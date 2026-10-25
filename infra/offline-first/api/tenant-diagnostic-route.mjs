import { withAuthenticatedTenantRuntime } from "./tenant-runtime-http.mjs";

/**
 * Mount a minimal authenticated diagnostic endpoint against the isolated
 * radio database. It returns no database names, roles, secrets or row data.
 */
export function mountTenantDiagnosticRoute(app, { authenticateDevice, tenantRuntime }) {
  if (!app || typeof app.get !== "function" ||
      typeof authenticateDevice !== "function") {
    throw new TypeError("An Express app and device authentication middleware are required");
  }

  app.get("/v1/tenant/diagnostics", authenticateDevice, (req, res, next) => {
    if (!tenantRuntime) {
      return res.status(503).json({ error: "tenant_runtime_not_configured" });
    }
    return withAuthenticatedTenantRuntime({
      tenantRuntime,
      handler: async (request, response) => {
        await request.tenantRuntime.db`SELECT 1`;
        return response.json({
          ok: true,
          tenant_id: request.tenantRuntime.tenantId,
          database_ready: true,
        });
      },
    })(req, res, next);
  });
}
