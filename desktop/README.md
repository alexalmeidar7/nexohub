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
- Each registered client profile receives a separate Electron `userData`
  directory for its cookies and browser storage. This local profile separation
  is not server-side tenant authorization.

## Current startup behavior

- Starting the application without `--client-id` opens the local client manager.
- Opening a registered client starts a separate Electron process with that
  client's profile and the `HOUSEMIX_CLIENT_ID` environment value.
- The Electron main process calls the local API host manager for a client
  process. The host starts only on Windows when
  `HOUSEMIX_LOCAL_API_ENABLED=true` is already present in that process
  environment. The installer and Electron shell do not set this variable.
- If the variable is absent, the client window can open without the local API
  host. This is not an Offline First-ready state.

## Local database provisioner

The Windows installer bundles
`runtime/provisioner/HouseMix.OfflineFirst.Provisioner.exe` and its two SQL
schema files. Electron does not launch this provisioner automatically.

For an isolated test machine only, the provisioner:
- connects to PostgreSQL on `127.0.0.1:5432`;
- asks for a station name and the local PostgreSQL `postgres` administrator
  password;
- creates the dedicated `housemix_local` database and
  `housemix_runtime` login;
- applies the bundled local control-plane and one-time-enrollment schemas;
- creates an initial local tenant; and
- stores the runtime connection credential using Windows DPAPI for the current
  Windows user.

It stops without changing the database if either `housemix_local` or
`housemix_runtime` already exists. Do not rename, drop, or overwrite an
existing database or role to make provisioning pass. Use a clean, dedicated
test machine and a database installation reserved for House Mix testing.

Provisioning does **not** import cloud data and does **not** start the local API
automatically. The host activation and readiness flow still require a separate
implementation and Windows validation. Do not enable the host globally or
describe this package as an Offline First production release until that flow is
implemented and tested.

## Remaining acceptance gates

This shell packages the current web interface; it does not yet make every
House Mix module offline-capable and does not replace the Supabase data client.
Installation, first-run provisioning, secure host activation, per-client local
data isolation, cloud-to-local data migration, backup/restore, failover, and
recovery after Windows restart remain separate acceptance gates.
