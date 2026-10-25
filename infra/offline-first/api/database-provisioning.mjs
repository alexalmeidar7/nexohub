import crypto from "node:crypto";

export function createDatabaseKey(tenantId) {
  if (typeof tenantId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new TypeError("A valid tenant UUID is required");
  }
  const digest = crypto.createHash("sha256").update(tenantId.toLowerCase()).digest("hex");
  return `hm_${digest.slice(0, 32)}`;
}

export function validateDatabaseKey(value) {
  if (typeof value !== "string" || !/^hm_[a-f0-9]{32}$/.test(value)) {
    throw new TypeError("Invalid server-generated database identifier");
  }
  return value;
}

export function assertProvisioningMayActivate({ migrationVersion, verifiedVersion, databaseExists }) {
  if (databaseExists !== true || !Number.isInteger(migrationVersion) ||
      migrationVersion < 1 || verifiedVersion !== migrationVersion) {
    throw new Error("Database cannot be activated before all migrations are verified");
  }
  return true;
}
