# Epic: DATABASE_FOUNDATION

Status: NEW

## Overview

Stand up the embedded SQLite database that all DropSync persistence depends on.
The authoritative schema is defined in `docs/Data Model/Schema.ddl` (authored in
PostgreSQL dialect); this epic translates it into the runtime SQLite dialect
using `better-sqlite3`, wires a forward-only migration runner, and seeds the
`default_exclusion_pattern` and `app_settings` tables with sensible defaults.

After this epic, the main process can open the database, apply migrations at
startup, and every later epic can use real tables instead of stubs.

## Scope

### In Scope
- `better-sqlite3` dependency and `electron-rebuild` postinstall for the
  Electron Node ABI
- Database file lifecycle: creation, open, and location at
  `%APPDATA%/dropsync/dropsync.db`
- Forward-only schema migration runner keyed off `schema_migration.version`
- Initial migration(s) translating the tables from `Schema.ddl` into SQLite
  syntax: `schema_migration`, `app_settings`, `default_exclusion_pattern`,
  `backup_job`, `exclusion_rule`, `backup_run`, `file_record`, `run_log`
- Equivalent CHECK constraints and indexes where SQLite supports them;
  `updated_at` maintained via triggers (SQLite-compatible)
- Seed data: built-in exclusion patterns (`node_modules`, `.git`,
  `__pycache__`, `*.tmp`, `Thumbs.db`, etc.) and default `app_settings` rows
- A thin repository/DAO layer providing typed accessors used by later epics
- Unit tests that run migrations against a temporary database

### Out of Scope
- Any domain behavior on top of the tables (owned by later epics)
- Encryption of the SQLite file (Architecture §7: stores no secrets)
- Any UI reading from the database (owned by later epics)
- OAuth token storage (that lives in Windows Credential Manager, not SQLite)

## Functional Requirements

1. On app startup, the main process opens (or creates) the SQLite database and
   runs all pending migrations in order, recording each in `schema_migration`.
2. Every table defined in `docs/Data Model/Schema.ddl` exists in the runtime
   database with equivalent columns, constraints, and indexes (adapted to
   SQLite dialect where necessary).
3. The `default_exclusion_pattern` table is seeded with the built-in patterns
   on first run.
4. The `app_settings` table is seeded with default entries covering at minimum
   the default backup interval, strict-checksum mode (off), and auto-start
   preference (off).
5. A repository layer exposes typed read/write operations the later epics can
   depend on without reinventing query glue.
6. Migrations are idempotent: starting the app twice produces the same schema
   state and does not re-seed data already present.

## Acceptance Criteria

- [ ] Fresh install creates `%APPDATA%/dropsync/dropsync.db` and all tables
- [ ] Running the app a second time is a no-op for migrations and seeds
- [ ] Every table and index in `Schema.ddl` has a SQLite equivalent in the
      migrated database
- [ ] `default_exclusion_pattern` contains the documented built-in patterns
- [ ] `app_settings` contains the documented default keys
- [ ] Migration runner unit tests pass against a temporary database
- [ ] `electron-rebuild` runs cleanly on the target Electron version

## Dependencies

- APP_SHELL (needs a main process to host the database)

## Tickets

_To be created during planning mode._
