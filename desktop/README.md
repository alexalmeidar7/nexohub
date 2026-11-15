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

## Current scope and limitations

This shell packages the current web interface. It does **not** yet make all
House Mix modules offline-capable or replace the current Supabase data client.
The Electron main process can start the packaged local API host when
`HOUSEMIX_LOCAL_API_ENABLED=true` and a local database has already been
provisioned. The Windows build bundles the API host, Node runtime, API files,
schema and provisioner, but the installer does not install or start PostgreSQL,
run provisioning, or enable the local API automatically. The renderer is not
yet connected to this API.

Do not describe this build as an offline-ready production release. The Windows
installer artifact is a packaging/integration milestone only. The local API
currently provides device enrollment and sync outbox/change-feed endpoints; it
does not yet synchronize House Mix application records. Making the computer's
database the primary source still requires PostgreSQL installation, safe schema
migrations, app data access through the local API, bidirectional sync with
conflict handling, backup/restore, and failover acceptance.

