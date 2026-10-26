# House Mix Offline First Host

Small Windows console host that supervises the loopback-only Node API through
`LocalApiHostManager`. It is intended to be launched by the Electron main
process, never by the renderer.

## Runtime configuration

The host reads these values from its process environment:

- `HOUSEMIX_LOCAL_API_NODE_PATH`: absolute path to the bundled Node runtime.
- `HOUSEMIX_LOCAL_API_SCRIPT_PATH`: absolute path to `api/server.mjs`.
- `HOUSEMIX_LOCAL_API_WORKING_DIRECTORY`: absolute API working directory.
- `HOUSEMIX_LOCAL_API_PORT`: optional port (defaults to 8787).

The PostgreSQL connection URL is loaded from
`%LOCALAPPDATA%\\HouseMix\\OfflineFirst\\database-credential.bin`,
protected with Windows DPAPI `CurrentUser`. It is never accepted from
environment variables or command-line arguments and is never printed.
A credential created by one Windows account cannot be decrypted by another.

The credential must be provisioned by the trusted Windows setup flow before
the local API can start. If it is missing or cannot be decrypted, startup
fails closed and Electron receives no ready signal. Do not bypass this gate
with a plaintext environment variable.

The host emits `HOUSEMIX_LOCAL_API_READY` only after the API health endpoint
returns HTTP 200, including a successful database check. It then remains alive
until Electron terminates it.

## Safety boundary

The API remains hard-bound to `127.0.0.1`. This host does not install
PostgreSQL, create databases, migrate customer data, or configure a standby
server. Do not use this integration with production data until the trusted
provisioning workflow and database installation are implemented and validated.
