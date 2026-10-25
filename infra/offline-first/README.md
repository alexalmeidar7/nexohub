# House Mix Offline First — disposable local database

This folder provides an isolated PostgreSQL 16 instance for **development and migration experiments only**.

It is not connected to Lovable Cloud, the production House Mix project, or any customer data. It does not change the existing Web app or its Supabase-compatible client.

## Prerequisites

- Docker Desktop with Docker Compose.
- Windows 10/11 with Docker Desktop running.

## Start

From this directory:

1. Copy `.env.example` to `.env`.
2. Replace `HOUSEMIX_LOCAL_DB_PASSWORD` with a strong, unique local password.
3. Run:

```powershell
docker compose up -d
docker compose ps
docker compose logs -f housemix-local-postgres
```

The database is available only from this computer at `127.0.0.1:55432`.

Connection settings:
- Host: `127.0.0.1`
- Port: `55432`
- Database: `housemix_local`
- User: `housemix_dev`
- Password: value in local `.env`

## Stop / reset

Stop without deleting data:

```powershell
docker compose down
```

**Destructive reset — deletes this disposable database volume:**

```powershell
docker compose down -v
```

Do not run the destructive reset if you have placed test data in this environment that you need to keep.

## Safety boundaries

- Never put a production URL, Lovable Cloud key, Supabase service-role key, or customer backup in this folder.
- Never expose port 55432 to the LAN or public internet.
- Do not use this container as the production primary or standby server.
- Do not restore the historical repository JSON files into this database yet. The schema, tenant ownership, constraints, policies, and Storage objects have not been verified against a fresh authoritative export.
- This disposable instance is only the foundation for testing a future local schema and migration scripts.

## Next milestone

Before loading customer data, define and review:
1. verified schema and constraints from an authoritative export;
2. tenant and device identity model;
3. local API contract and authorization rules;
4. migration scripts with repeatable checks;
5. row-level tenant ownership report and quarantine for ambiguous records.

No existing House Mix Web runtime files are changed by this scaffold.
