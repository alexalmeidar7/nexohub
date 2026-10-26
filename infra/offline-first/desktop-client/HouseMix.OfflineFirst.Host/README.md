# House Mix Offline First Host

Small Windows console host that supervises the loopback-only Node API through
`LocalApiHostManager`. It is intended to be launched by the Electron main
process, never by the renderer.

## Configuration

The host reads these values only from its process environment:

- `HOUSEMIX_LOCAL_API_NODE_PATH`: absolute path to the bundled Node runtime.
- `HOUSEMIX_LOCAL_API_SCRIPT_PATH`: absolute path to `api/server.mjs`.
- `HOUSEMIX_LOCAL_API_WORKING_DIRECTORY`: absolute API working directory.
- `HOUSEMIX_LOCAL_DATABASE_URL`: PostgreSQL URL.
- `HOUSEMIX_LOCAL_API_PORT`: optional port (defaults to 8787).

The database URL is never accepted as a command-line argument and is never
printed. The current environment-variable handoff is an integration seam for
local development only. The next credential/provisioning milestone must replace
it with DPAPI-backed configuration before any customer data is used.

The host emits `HOUSEMIX_LOCAL_API_READY` only after the API health endpoint
returns HTTP 200, including a successful database check. It then remains alive
until Electron terminates it. The transport manager kills the API child process
tree during disposal.

## Safety boundary

The API remains hard-bound to `127.0.0.1`. This host does not enable LAN,
install PostgreSQL, create databases, migrate customer data, or configure a
standby server. Do not use this development integration with production data.
