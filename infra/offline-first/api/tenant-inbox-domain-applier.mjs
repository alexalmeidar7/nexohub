import { isDeepStrictEqual } from "node:util";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOMAINS = Object.freeze({
  programa: {
    table: "housemix.programas",
    columns: new Set(["nome","descricao","horario_inicio","horario_fim","dias_semana","apresentador_id",
      "apresentadores_ids","tipo_programa","classificacao_etaria","estudio","selo","capa","thumb",
      "variavel","data_variavel","ativo"]),
    softDelete: true,
  },
  agenda_evento: {
    table: "housemix.agenda_eventos",
    columns: new Set(["data","descricao","recorrencia","prioridade","tipo_evento","horario_gravacao",
      "horario_gravacao_fim","status","programa_id","local","periodo_inicio","periodo_fim","excecoes",
      "artes_urls","edicao_concluida","edicao_notas","youtube_url","youtube_titulo","youtube_descricao"]),
    softDelete: false,
  },
});

export function normalizeDomainMutation(item) {
  if (!item || !UUID.test(item.id || "") || !UUID.test(item.lease_token || "") ||
      !UUID.test(item.mutation_id || "") || typeof item.aggregate_id !== "string" ||
      !UUID.test(item.aggregate_id) || !Number.isSafeInteger(item.schema_version) ||
      item.schema_version !== 1 || !Number.isSafeInteger(item.base_version ?? 0) ||
      (item.base_version ?? 0) < 0 || !["upsert","delete"].includes(item.operation)) {
    return { valid: false, reason: "invalid_mutation_envelope" };
  }
  const domain = DOMAINS[item.aggregate_type];
  if (!domain) return { valid: false, reason: "unsupported_aggregate_type" };
  if (item.operation === "delete") {
    if (item.payload !== null && item.payload !== undefined) return { valid: false, reason: "delete_payload_must_be_null" };
    if (!item.base_version || item.base_version < 1) return { valid: false, reason: "delete_requires_base_version" };
    return { valid: true, domain, fields: [], values: [] };
  }
  if (!item.payload || typeof item.payload !== "object" || Array.isArray(item.payload)) {
    return { valid: false, reason: "invalid_payload" };
  }
  const entries = Object.entries(item.payload);
  if (entries.some(([key, value]) => key === "id" || key === "row_version" ||
      key === "created_at" || key === "updated_at" || key === "deleted_at" ||
      !domain.columns.has(key) || value === undefined || typeof value === "function")) {
    return { valid: false, reason: "payload_field_not_allowed" };
  }
  if (item.payload.id && item.payload.id !== item.aggregate_id) {
    return { valid: false, reason: "aggregate_id_mismatch" };
  }
  if (!entries.length) return { valid: false, reason: "empty_payload" };
  return { valid: true, domain, fields: entries.map(([key]) => key), values: entries.map(([, value]) => value) };
}

/**
 * Applies one already-leased inbox item in the authenticated radio database.
 * The domain write and terminal inbox transition share one PostgreSQL transaction.
 */
export function createTenantInboxDomainApplier(db) {
  if (!db || typeof db.begin !== "function") throw new TypeError("tenant_database_transaction_required");
  return {
    async apply(item) {
      const normalized = normalizeDomainMutation(item);
      if (!normalized.valid) return { status: "rejected", reason: normalized.reason };
      return db.begin(async (tx) => {
        const locked = await tx`
          SELECT id, mutation_id, aggregate_type, aggregate_id, operation, payload,
                 base_version, schema_version, status, lease_token, lease_until
          FROM housemix.sync_inbox
          WHERE id = ${item.id}::uuid AND mutation_id = ${item.mutation_id}::uuid
          FOR UPDATE
        `;
        if (!locked.length || locked[0].status !== "processing" ||
            locked[0].lease_token !== item.lease_token || new Date(locked[0].lease_until) <= new Date()) {
          return { status: "stale_lease" };
        }

        // A claimed object is not authoritative after the inbox row is locked.
        const row = locked[0];
        if (row.aggregate_type !== item.aggregate_type ||
            row.aggregate_id !== item.aggregate_id ||
            row.operation !== item.operation ||
            Number(row.base_version ?? 0) !== Number(item.base_version ?? 0) ||
            Number(row.schema_version) !== Number(item.schema_version) ||
            !isDeepStrictEqual(row.payload ?? null, item.payload ?? null)) {
          return { status: "stale_lease" };
        }

        let changed;
        if (row.operation === "delete") {
          if (normalized.domain.softDelete) {
            changed = await tx`
              UPDATE housemix.programas SET deleted_at = now(), ativo = false,
                row_version = row_version + 1, updated_at = now()
              WHERE id = ${row.aggregate_id}::uuid AND row_version = ${row.base_version}
                AND deleted_at IS NULL RETURNING id
            `;
          } else {
            changed = await tx`
              DELETE FROM housemix.agenda_eventos
              WHERE id = ${row.aggregate_id}::uuid AND row_version = ${row.base_version}
              RETURNING id
            `;
          }
        } else {
          const columns = normalized.fields;
          const version = row.base_version ?? 0;
          const setValues = [...normalized.values, row.aggregate_id, version];
          const assignments = columns.map((column, index) => `${column} = $${index + 1}`);
          assignments.push("row_version = row_version + 1", "updated_at = now()");
          if (normalized.domain.softDelete) assignments.push("deleted_at = NULL");
          if (version === 0) {
            const insertColumns = ["id", ...columns, "row_version", "created_at", "updated_at"];
            const insertValues = [row.aggregate_id, ...normalized.values];
            const placeholders = insertValues.map((_, index) => `$${index + 1}`);
            const sql = `INSERT INTO ${normalized.domain.table} (${insertColumns.join(", ")})
              VALUES (${placeholders.join(", ")}, 1, now(), now())
              ON CONFLICT (id) DO NOTHING RETURNING id, row_version`;
            changed = await tx.unsafe(sql, insertValues);
          } else {
            const sql = `UPDATE ${normalized.domain.table} SET ${assignments.join(", ")}
              WHERE id = $${normalized.values.length + 1}
                AND row_version = $${normalized.values.length + 2}
                ${normalized.domain.softDelete ? "AND deleted_at IS NULL" : ""}
              RETURNING id, row_version`;
            changed = await tx.unsafe(sql, setValues);
          }
        }

        const terminalStatus = changed.length ? "applied" : "conflict";
        const terminal = await tx`
          UPDATE housemix.sync_inbox SET status = ${terminalStatus}, processed_at = now(),
            lease_token = NULL, lease_until = NULL, last_error_code = NULL
          WHERE id = ${row.id}::uuid AND status = 'processing'
            AND lease_token = ${item.lease_token}::uuid AND lease_until > now()
          RETURNING id
        `;
        if (terminal.length !== 1) throw new Error("inbox_lease_lost_during_apply");
        return { status: terminalStatus, aggregate_id: row.aggregate_id };
      });
    },
  };
}
