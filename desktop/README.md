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
House Mix modules offline-capable and does not replace the current Supabase data
client. The Offline First local API host manager introduced in the transport
library is not wired into Electron in this change: it still requires a dedicated
runtime/provisioning integration, including secure retrieval of the database
credential and a packaged Node/API/PostgreSQL layout.

Do not describe this build as an offline-ready production release. The Windows
installer artifact is a packaging/integration milestone only. Database
installation, local data migration, host lifecycle integration, backup/restore,
and failover remain separate acceptance gates.
