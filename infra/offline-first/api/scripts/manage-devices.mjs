import postgres from "postgres";

const [command, tenantSlug, deviceId] = process.argv.slice(2);
const usage = "Usage: node infra/offline-first/api/scripts/manage-devices.mjs list <tenant-slug> | revoke <tenant-slug> <device-uuid>";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!tenantSlug || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantSlug)) throw new Error(usage);
if (!["list", "revoke"].includes(command) || (command === "revoke" && !deviceId)) throw new Error(usage);
if (command === "revoke" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceId)) {
  throw new Error("Invalid device UUID");
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 5 });
try {
  if (command === "list") {
    const rows = await sql`
      SELECT d.id, d.label, d.device_role, d.status, d.created_at, d.last_seen_at
      FROM local_devices d
      JOIN tenants t ON t.id = d.tenant_id
      WHERE t.slug = ${tenantSlug}
      ORDER BY d.created_at ASC, d.id ASC
    `;
    console.log(JSON.stringify({ tenant_slug: tenantSlug, devices: rows }, null, 2));
  } else {
    const result = await sql.begin(async (tx) => {
      const rows = await tx`
        SELECT d.id, d.tenant_id, d.status
        FROM local_devices d
        JOIN tenants t ON t.id = d.tenant_id
        WHERE t.slug = ${tenantSlug} AND d.id = ${deviceId}::uuid
        FOR UPDATE OF d
      `;
      if (rows.length !== 1) throw new Error("Device not found in the specified tenant");
      const device = rows[0];
      if (device.status === "revoked") return { status: "already_revoked", device_id: device.id };
      await tx`UPDATE local_devices SET status = 'revoked' WHERE tenant_id = ${device.tenant_id} AND id = ${device.id}`;
      await tx`
        INSERT INTO local_audit_events (tenant_id, actor_subject, device_id, event_type, entity_type, entity_id, details)
        VALUES (${device.tenant_id}, 'local-operator', ${device.id}, 'device.revoked', 'device', ${device.id},
                ${tx.json({ source: "manage-devices-cli" })})
      `;
      return { status: "revoked", device_id: device.id };
    });
    console.log(JSON.stringify({ tenant_slug: tenantSlug, ...result }, null, 2));
  }
} finally {
  await sql.end();
}
