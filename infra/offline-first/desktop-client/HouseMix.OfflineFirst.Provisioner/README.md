# House Mix Local Database Provisioner

Windows-only, interactive provisioning utility for a PostgreSQL 16 instance that is
already installed and running on the same computer.

## What it does

- Connects only to `127.0.0.1:5432` as the local PostgreSQL administrator.
- Reads the administrator password without echoing it and never saves it.
- Creates the dedicated `housemix_runtime` login with a fresh random password; it refuses to run if that role or database already exists.
- Creates the new, empty `housemix_local` database.
- Applies the checked-in control-plane schema migrations.
- Creates one initial radio tenant.
- Stores the runtime PostgreSQL URI using Windows DPAPI CurrentUser.

## Before running

1. Install PostgreSQL 16 locally and ensure its service is running.
2. Confirm the local administrator account is `postgres`.
3. Build/publish this utility for Windows x64.
4. Run it interactively under the same Windows account that will run House Mix Desktop.

## Important

- This utility does not install PostgreSQL.
- It does not import customer data or connect to Lovable Cloud/Supabase.
- It is intended for a fresh, dedicated House Mix database. It currently applies the
  schema migrations and creates a new tenant; do not run it against a database containing
  customer data.
- The runtime role owns the dedicated database. The administrator password is not stored.
- The protected credential can be decrypted only by the Windows account that provisioned it.
- Do not run this tool under a service account different from the Desktop user.
- LAN access and sync remain disabled.
