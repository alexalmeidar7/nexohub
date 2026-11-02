# House Mix Desktop shell

This folder contains the Electron application shell used to package the existing
Vite/React House Mix interface as a Windows desktop application.

## Local development

```bash
npm install
npm run desktop:build
npx electron .
```

## Security baseline

- Renderer Node.js integration is disabled.
- Context isolation and Chromium sandbox are enabled.
- External navigation is denied inside the app; only HTTP(S) links are delegated
  to the operating system browser.
- The renderer receives only a small, read-only desktop identity object.

## Offline First runtime: current integration

The Electron main process imports and supervises the local API host manager.
On Windows, it starts the host only when
`HOUSEMIX_LOCAL_API_ENABLED=true` is present in the Electron process
environment. When enabled, Electron waits for `HOUSEMIX_LOCAL_API_READY`
before opening the main window. A startup failure is shown to the operator and
the application exits instead of silently continuing without the requested
local API.

The Windows build bundles the portable Node runtime, local API server, host
executable, PostgreSQL provisioner, and the current local schema files. The
host reads the database connection credential from the Windows DPAPI-backed
credential store; it does not accept the database URL from command-line
arguments or environment variables.

The provisioner is a separate command-line program, not a first-run wizard. It
asks for the radio name and the local PostgreSQL administrator password, creates
a new `housemix_local` database and a restricted runtime role, applies the
bundled schemas, and stores the runtime credential using DPAPI. It stops if
that database or role already exists; it does not overwrite an existing local
database. It does not migrate the station's existing Supabase data.

## Current scope and limitations

The installer packages these components, but it does **not** automatically run
the provisioner, set `HOUSEMIX_LOCAL_API_ENABLED`, or complete first-run
configuration. Unless the operator has provisioned the local database and
explicitly enabled the host in the Electron process environment, the Desktop
opens the existing web interface using its configured Supabase client.

This does **not** make all House Mix modules offline-capable and does not replace
the current Supabase data client. A guided first-run experience, secure
configuration of the startup flag, cloud-to-local data migration, backup and
restore, failover, and full Windows lifecycle validation remain acceptance
gates.

Do not describe this build as an offline-ready production release. The Windows
installer is a packaging/integration milestone only. Test provisioning and
startup on a clean Windows machine with a disposable PostgreSQL instance before
using it with any existing station data.
