/**
 * Network exposure guard for the local House Mix API.
 *
 * LAN transport is intentionally unavailable until HTTPS, certificate
 * validation, firewall guidance and the LAN acceptance suite are implemented.
 * HOUSEMIX_ALLOW_LAN is not an override for this hard stop.
 */
export function resolveApiHost(env = process.env) {
  const requestedHost = env.HOUSEMIX_API_HOST || "127.0.0.1";

  if (requestedHost !== "127.0.0.1") {
    throw new Error(
      "LAN binding is hard-disabled: HTTPS transport and LAN security acceptance tests are not implemented. " +
      "HOUSEMIX_ALLOW_LAN cannot bypass this safety gate."
    );
  }

  return "127.0.0.1";
}
