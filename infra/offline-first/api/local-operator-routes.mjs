import crypto from "node:crypto";
import { hashOperatorPassword, verifyOperatorPassword, normalizeOperatorEmail } from "./local-operator-password.mjs";

const digest = (s) => crypto.createHash("sha256").update(s, "utf8").digest();
const SESSION_HOURS = 12;

function validSubject(subject) {
  return typeof subject === "string" && subject.length >= 1 && subject.length <= 160;
}
function publicUser(row) {
  return { subject: row.user_subject, email: row.email, role: row.role, status: row.status };
}

/**
 * Local-only auth endpoints. The existing network-config module still rejects
 * LAN/public binding. Client devices must enroll before these calls.
 * This is not a Supabase JWT and must never be presented as one.
 */
export function registerLocalOperatorRoutes(app, db, authenticateDevice) {
  app.post("/v1/operators/provision", authenticateDevice, async (req, res) => {
    if (req.device.device_role !== "primary_server") {
      return res.status(403).json({ error: "primary_server_required" });
    }
    const { subject, password, role, email: rawEmail } = req.body || {};
    if (!validSubject(subject) || !["owner", "admin", "operator", "viewer"].includes(role)) {
      return res.status(400).json({ error: "invalid_operator" });
    }
    let email, verifier;
    try {
      email = normalizeOperatorEmail(rawEmail);
      verifier = await hashOperatorPassword(password);
    } catch {
      return res.status(400).json({ error: "invalid_operator" });
    }
    try {
      const result = await db`
        INSERT INTO local_operator_accounts
          (tenant_id, user_subject, email, password_verifier, role, status, updated_at)
        VALUES (${req.device.tenant_id}, ${subject}, ${email}, ${verifier}, ${role}, 'active', now())
        ON CONFLICT (tenant_id, user_subject) DO NOTHING
        RETURNING user_subject, email, role, status
      `;
      if (!result.length) return res.status(409).json({ error: "operator_already_exists" });
      return res.status(201).json({ user: publicUser(result[0]) });
    } catch {
      return res.status(500).json({ error: "operator_provision_failed" });
    }
  });

  app.post("/v1/operators/login", authenticateDevice, async (req, res) => {
    const { email: rawEmail, password } = req.body || {};
    let email;
    try { email = normalizeOperatorEmail(rawEmail); }
    catch { return res.status(400).json({ error: "invalid_credentials" }); }
    if (typeof password !== "string" || password.length > 256) {
      return res.status(400).json({ error: "invalid_credentials" });
    }
    try {
      const result = await db.begin(async (tx) => {
        const rows = await tx`
          SELECT user_subject, email, role, status, password_verifier,
                 failed_attempts, locked_until
          FROM local_operator_accounts
          WHERE tenant_id = ${req.device.tenant_id} AND email = ${email}
          FOR UPDATE
        `;
        if (!rows.length) return null;
        const row = rows[0];
        if (row.status !== "active" || (row.locked_until && new Date(row.locked_until) > new Date())) {
          return null;
        }
        const valid = await verifyOperatorPassword(password, row.password_verifier);
        if (!valid) {
          await tx`
            UPDATE local_operator_accounts
            SET failed_attempts = failed_attempts + 1,
                locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '5 minutes' ELSE NULL END
            WHERE tenant_id = ${req.device.tenant_id} AND user_subject = ${row.user_subject}
          `;
          return null;
        }
        const token = crypto.randomBytes(32).toString("base64url");
        await tx`
          UPDATE local_operator_accounts
          SET failed_attempts = 0, locked_until = NULL, last_login_at = now()
          WHERE tenant_id = ${req.device.tenant_id} AND user_subject = ${row.user_subject}
        `;
        await tx`
          INSERT INTO local_operator_sessions
            (tenant_id, session_hash, user_subject, device_id, expires_at)
          VALUES
            (${req.device.tenant_id}, ${digest(token)}, ${row.user_subject}, ${req.device.id},
             now() + (${SESSION_HOURS} * interval '1 hour'))
        `;
        return { token, user: publicUser(row) };
      });
      if (!result) return res.status(401).json({ error: "invalid_credentials" });
      res.set("Cache-Control", "no-store");
      return res.json({ authenticated: true, local: true, ...result });
    } catch {
      return res.status(503).json({ error: "local_auth_unavailable" });
    }
  });

  const resolveSession = async (req) => {
    const token = req.get("x-housemix-operator-session");
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
    const rows = await db`
      SELECT a.user_subject, a.email, a.role, a.status
      FROM local_operator_sessions s
      JOIN local_operator_accounts a ON a.tenant_id = s.tenant_id AND a.user_subject = s.user_subject
      WHERE s.tenant_id = ${req.device.tenant_id}
        AND s.device_id = ${req.device.id}
        AND s.session_hash = ${digest(token)}
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND a.status = 'active'
      LIMIT 1
    `;
    return rows[0] || null;
  };

  app.get("/v1/operators/session", authenticateDevice, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const account = await resolveSession(req);
      if (!account) return res.status(401).json({ error: "invalid_local_session" });
      return res.json({ authenticated: true, local: true, user: publicUser(account) });
    } catch {
      return res.status(503).json({ error: "local_auth_unavailable" });
    }
  });

  app.post("/v1/operators/logout", authenticateDevice, async (req, res) => {
    const token = req.get("x-housemix-operator-session");
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) {
      return res.status(401).json({ error: "invalid_local_session" });
    }
    try {
      await db`
        UPDATE local_operator_sessions SET revoked_at = now()
        WHERE tenant_id = ${req.device.tenant_id} AND device_id = ${req.device.id}
          AND session_hash = ${digest(token)} AND revoked_at IS NULL
      `;
      return res.json({ ok: true });
    } catch {
      return res.status(503).json({ error: "local_auth_unavailable" });
    }
  });
}
