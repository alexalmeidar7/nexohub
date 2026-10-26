const ERROR_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const TERMINAL = new Set(["applied", "conflict", "rejected"]);

export function createTenantInboxWorker(db, { leaseSeconds = 60, maxAttempts = 12, domainApplier = null } = {}) {
  if (typeof db !== "function" || !Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 900 ||
      !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) {
    throw new TypeError("Invalid inbox worker configuration");
  }
  return {
    async processBatch(limit = 20, { retryDelaySeconds = 30 } = {}) {
      if (!domainApplier || typeof domainApplier.apply !== "function") {
        throw new Error("tenant_inbox_domain_applier_not_configured");
      }
      if (!Number.isInteger(retryDelaySeconds) || retryDelaySeconds < 1 || retryDelaySeconds > 86400) {
        throw new RangeError("invalid_retry_delay");
      }
      const items = await this.claimBatch(limit);
      const summary = { claimed: items.length, applied: 0, conflicts: 0, rejected: 0, retried: 0, stale: 0 };
      for (const item of items) {
        try {
          const result = await domainApplier.apply(item);
          if (result.status === "applied") summary.applied += 1;
          else if (result.status === "conflict") summary.conflicts += 1;
          else if (result.status === "rejected") {
            const finished = await this.finish(item.id, item.lease_token, "rejected");
            if (finished) summary.rejected += 1;
            else summary.stale += 1;
          } else if (result.status === "stale_lease") summary.stale += 1;
          else {
            const retried = await this.retry(item.id, item.lease_token, "unexpected_domain_result", retryDelaySeconds);
            if (retried) summary.retried += 1;
            else summary.stale += 1;
          }
        } catch {
          const retried = await this.retry(item.id, item.lease_token, "domain_apply_failed", retryDelaySeconds);
          if (retried) summary.retried += 1;
          else summary.stale += 1;
        }
      }
      return summary;
    },
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
