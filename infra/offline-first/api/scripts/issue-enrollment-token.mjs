import crypto from "node:crypto";
import postgres from "postgres";

const [tenantSlug, deviceRole, rawTtl = "60"] = process.argv.slice(2);
const allowedRoles = new Set(["primary_server", "workstation", "standby_server"]);
const ttlMinutes = Number(rawTtl);

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!tenantSlug || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantSlug)) {
  throw new Error("Usage: node infra/offline-first/api/scripts/issue-enrollment-token.mjs <tenant-slug> <primary_server|workstation|standby_server> [ttl-minutes]");
}
if (!allowedRoles.has(deviceRole)) throw new Error("Invalid device role");
if (!Number.isInteger(ttlMinutes) || ttlMinutes < 5 || ttlMinutes > 1440) {
  throw new Error("TTL must be between 5 and 1440 minutes");
}

const token = crypto.randomBytes(32).toString("base64url");
const tokenHash = crypto.createHash("sha256").update(token, "utf8").digest();
const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 5 });

try {
  const rows = await sql.begin(async (tx) => {
    const tenants = await tx`SELECT id FROM tenants WHERE slug = ${tenantSlug} AND status = 'active' FOR SHARE`;
    if (tenants.length !== 1) throw new Error("Active tenant not found");
    return tx`
      INSERT INTO device_enrollment_tokens (tenant_id, token_hash, device_role, expires_at, created_by)
      VALUES (${tenants[0].id}, ${tokenHash}, ${deviceRole}, now() + (${ttlMinutes} * interval '1 minute'), 'local-operator')
      RETURNING id, expires_at
    `;
  });
  console.log(JSON.stringify({
    enrollment_token: token,
    tenant_slug: tenantSlug,
    device_role: deviceRole,
    expires_at: rows[0].expires_at,
    warning: "Show this token once. It is single-use and must be delivered securely."
  }, null, 2));
} finally {
  await sql.end();
}
