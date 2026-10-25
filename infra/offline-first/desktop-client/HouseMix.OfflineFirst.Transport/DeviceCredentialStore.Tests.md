# Device pairing verification matrix

The pairing client uses the existing API contract in \`infra/offline-first/api/README.md\`:

- \`POST /v1/devices/enroll\` with \`enrollment_token\`, \`device_key\`, and \`label\`.
- Tenant and role are returned by the server grant; the client cannot choose them.
- A lost response can be retried with the same token/key pair because the API returns the existing enrollment for that exact pair.
- A different key cannot reuse a consumed token.

## Credential handling

- Device keys are generated from 256 bits of cryptographic randomness and encoded as base64url.
- Pending token and key are protected with Windows DPAPI using \`DataProtectionScope.CurrentUser\` before the first network request.
- Successful enrollment replaces pending state with the device identity and key; the one-time token is no longer retained.
- A pending enrollment cannot silently be replaced with a different token.
- The credential file is stored under the current Windows user's LocalApplicationData directory; DPAPI prevents another Windows user from decrypting it.
- This component does not implement remote revocation; the existing local administrator CLI remains the revocation mechanism.

## Required Windows integration tests

1. Current Windows user can save and reload pending state.
2. A different Windows user cannot decrypt the credential blob.
3. A failed/lost enrollment response preserves pending state and retry reuses the same key.
4. Successful enrollment removes the one-time token from persisted state.
5. A second enrollment is blocked when a device is already enrolled.
6. Invalid tokens and labels are rejected before network access.
7. HTTP endpoints remain rejected by \`LocalApiClientFactory\`; redirects remain disabled.
8. No LAN listener or production database is enabled by this project.
