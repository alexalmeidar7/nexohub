const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Wrap an Express handler with a request-scoped radio database connection.
 * Tenant identity is taken exclusively from req.device, populated by the
 * device-authentication middleware. Request body, query and headers are never
 * consulted for tenant selection.
 */
export function withAuthenticatedTenantRuntime({ tenantRuntime, handler }) {
  if (!tenantRuntime || typeof tenantRuntime.openForAuthenticatedTenant !== "function") {
    throw new TypeError("An authenticated tenant runtime service is required");
  }
  if (typeof handler !== "function") {
    throw new TypeError("A tenant runtime request handler is required");
  }

  return async function authenticatedTenantRuntimeHandler(req, res, next) {
    const tenantId = req.device?.tenant_id;
    if (typeof tenantId !== "string" || !UUID_PATTERN.test(tenantId)) {
      return res.status(401).json({ error: "authenticated_device_required" });
    }

    let runtime;
    try {
      runtime = await tenantRuntime.openForAuthenticatedTenant(tenantId);
      if (!runtime || runtime.tenantId !== tenantId ||
          !runtime.client || typeof runtime.client.end !== "function") {
        throw new Error("tenant_runtime_unavailable");
      }
      req.tenantRuntime = Object.freeze({
        tenantId: runtime.tenantId,
        databaseKey: runtime.databaseKey,
        db: runtime.client,
      });
      return await handler(req, res, next);
    } catch (error) {
      return next(error);
    } finally {
      if (req.tenantRuntime) delete req.tenantRuntime;
      if (runtime?.client && typeof runtime.client.end === "function") {
        try {
          await runtime.client.end({ timeout: 5 });
        } catch {
          // Do not mask the request result or expose driver diagnostics.
        }
      }
    }
  };
}
