# DeviceIdentityClient acceptance tests

Run on Windows 10/11 with a trusted HTTPS test endpoint and a disposable Offline First database. Do not use production credentials or a production database.

## API contract coverage

The existing API integration test `infra/offline-first/api/tests/api-isolation.test.mjs` verifies:
- `GET /v1/me` returns the identity belonging to the presented device key;
- missing and unknown credentials are rejected;
- tenant identity is derived from the enrolled device, not client input;
- revoked devices are rejected immediately.

## Desktop client checks

1. **No enrollment:** with no credential file, `GetCurrentAsync` fails locally and sends no HTTP request.
2. **Pending enrollment:** a pending state cannot authenticate.
3. **Valid enrollment:** a valid protected enrolled state sends `GET /v1/me` with `Authorization: Bearer <device-key>` and returns the matching identity.
4. **Revoked device:** HTTP 401 raises `DeviceAuthenticationException`; no automatic re-enrollment occurs.
5. **Unknown/invalid credential:** HTTP 401 raises the same explicit authentication failure.
6. **Identity mismatch:** a response with a different device ID, tenant slug, role, or label raises `DeviceIdentityMismatchException`; the credential file remains unchanged.
7. **Unexpected server response:** missing identity fields or invalid JSON fails closed.
8. **TLS failure:** untrusted, expired, hostname-mismatched, or revoked server certificates fail before credentials are sent.
9. **Redirect:** 3xx is not followed and does not forward the bearer credential.
10. **No credential leakage:** the device key is absent from exception messages, logs, URLs, and shared `HttpClient.DefaultRequestHeaders`.

## Security boundary

These checks validate client-side identity only. They do not enable LAN binding, add a trust bypass, provision a CA, or authorize production rollout. The API remains loopback-only.
