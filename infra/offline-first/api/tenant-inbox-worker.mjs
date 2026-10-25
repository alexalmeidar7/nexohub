const ERROR_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const TERMINAL = new Set(["applied", "conflict", "rejected"]);

export function createTenantInboxWorker(db, { leaseSeconds = 60, maxAttempts = 12 } = {}) {
  if (typeof db !== "function" || !Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 900 ||
      !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) {
    throw new TypeError("Invalid inbox worker configuration");
  }
  return {
    async claimBatch(limit = 20) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("invalid_claim_limit");
      return db.begin(async (tx) => {
        await tx`UPDATE housemix.sync_inbox
          SET status = 'rejected', processed_at = now(), lease_token = NULL,
              lease_until = NULL, last_error_code = 'max_attempts_exceeded'
          WHERE attempt_count >= ${maxAttempts}
            AND (status = 'pending' OR (status = 'processing' AND lease_until <= now()))`;
        return tx`WITH candidates AS (
          SELECT id FROM housemix.sync_inbox
          WHERE (status = 'pending' AND available_at <= now())
             OR (status = 'processing' AND lease_until <= now())
          ORDER BY available_at ASC, received_at ASC, id ASC
          FOR UPDATE SKIP LOCKED LIMIT ${limit}
        )
        UPDATE housemix.sync_inbox AS inbox
        SET status = 'processing', attempt_count = attempt_count + 1,
            lease_token = gen_random_uuid(),
            lease_until = now() + make_interval(secs => ${leaseSeconds})
        FROM candidates WHERE inbox.id = candidates.id
        RETURNING inbox.id, inbox.mutation_id, inbox.source, inbox.aggregate_type,
          inbox.aggregate_id, inbox.operation, inbox.payload, inbox.base_version,
          inbox.schema_version, inbox.attempt_count, inbox.lease_token, inbox.lease_until`;
      });
    },
    async finish(id, leaseToken, status) {
      if (!TERMINAL.has(status)) throw new TypeError("invalid_terminal_status");
      const rows = await db`UPDATE housemix.sync_inbox
        SET status = ${status}, processed_at = now(), lease_token = NULL,
            lease_until = NULL, last_error_code = NULL
        WHERE id = ${id}::uuid AND status = 'processing'
          AND lease_token = ${leaseToken}::uuid AND lease_until > now()
        RETURNING id, status`;
      return rows.length === 1;
    },
    async retry(id, leaseToken, errorCode, delaySeconds = 30) {
      if (typeof errorCode !== "string" || !ERROR_CODE.test(errorCode) ||
          !Number.isInteger(delaySeconds) || delaySeconds < 1 || delaySeconds > 86400) {
        throw new TypeError("invalid_retry_parameters");
      }
      const rows = await db`UPDATE housemix.sync_inbox
        SET status = 'pending', available_at = now() + make_interval(secs => ${delaySeconds}),
            lease_token = NULL, lease_until = NULL, last_error_code = ${errorCode}
        WHERE id = ${id}::uuid AND status = 'processing'
          AND lease_token = ${leaseToken}::uuid AND lease_until > now()
          AND attempt_count < ${maxAttempts}
        RETURNING id, status, available_at, attempt_count`;
      return rows[0] || null;
    },
  };
}
