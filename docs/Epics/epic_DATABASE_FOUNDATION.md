# Epic: Database Foundation

- **Status:** NEW
- **Owner:** human
- **Created:** 2026-04-11
- **Last Updated:** 2026-04-11

## 1. Purpose

Introduce `better-sqlite3` as the persistence layer in the Electron main process, translate the authoring PostgreSQL schema in `docs/Data Model/Schema.ddl` into SQLite-compatible migrations, and bootstrap the database at `%APPDATA%/dropsync/dropsync.db` on first launch. This epic delivers the schema and the migration framework that every downstream epic (jobs, runs, file records, logs) will depend on.

## 2. User Story

As a **DropSync developer**, I want **a transactional SQLite persistence layer with versioned migrations**, so that **job configuration, backup run state, and file records can be stored reliably and evolved over time**.

## 3. Scope

**In Scope**
- `better-sqlite3` dependency added to the main process, rebuilt against Electron via `electron-rebuild`
- SQLite database created on first launch at `%APPDATA%/dropsync/dropsync.db`
- Versioned migration runner that tracks applied versions in `schema_migration`
- Initial migration translating the PostgreSQL DDL into SQLite-compatible DDL (`backup_job`, `exclusion_rule`, `backup_run`, `file_record`, `run_log`, `app_settings`, `default_exclusion_pattern`, `schema_migration`)
- Seed data for `default_exclusion_pattern` (`node_modules`, `.git`, `__pycache__`, `*.tmp`, `Thumbs.db`, etc.)
- A thin repository layer abstraction (or direct prepared-statement wrappers) consumed by subsequent epics
- IPC handlers exposing a minimal read API for `default_exclusion_pattern` and `app_settings` so the renderer can bootstrap

**Out of Scope**
- Domain-specific CRUD for jobs, runs, files (delivered in their respective epics)
- UI for viewing or editing settings
- Schema evolution beyond the initial migration

## 4. Functional Requirements

- **FR-005** — On first launch the app creates a SQLite database file at `%APPDATA%/dropsync/dropsync.db` (creating parent directories as needed).
- **FR-006** — Migrations are applied idempotently at startup; applied versions are recorded in a `schema_migration` table.
- **FR-007** — The initial migration seeds `default_exclusion_pattern` with a curated set of common exclusions (`node_modules`, `.git`, `__pycache__`, `*.tmp`, `Thumbs.db`, `.DS_Store`).
- **FR-008** — An `app_settings` key/value store is readable and writable from the main process and exposed to the renderer via IPC.

## 5. Non-Functional Requirements

- **NFR-003** — All writes during a backup run (backup_run updates, file_record inserts, run_log inserts) must be wrapped in transactions to prevent corruption on crash.
- **NFR-004** — The SQLite schema must preserve the semantics of the authoring PostgreSQL DDL (constraints, enums-as-CHECKs, cascade deletes, indices) within SQLite's type system.

## 6. UI/UX Notes

No direct UI in this epic. A small diagnostic area may surface "Database ready" status in the placeholder Jobs view if helpful for dev smoke testing, but is not required.

## 7. Data Model Impact

**All tables from `docs/Data Model/Schema.ddl`** land in this epic:

- `schema_migration`
- `app_settings`
- `default_exclusion_pattern`
- `backup_job`
- `exclusion_rule`
- `backup_run`
- `file_record`
- `run_log`

Translation notes:
- `BIGINT GENERATED ALWAYS AS IDENTITY` → `INTEGER PRIMARY KEY AUTOINCREMENT`
- `TIMESTAMPTZ` → `TEXT` (ISO 8601) or `INTEGER` (Unix epoch ms) — pick one and use consistently
- `JSONB` → `TEXT` (JSON-encoded)
- Trigger-based `updated_at` maintenance → explicit SQLite triggers or application-layer stamping
- All `CHECK` constraints preserved
- All indices preserved

## 8. Integration Impact

- **better-sqlite3**: new native dependency; requires `electron-rebuild` in postinstall.
- **Main process**: new module owns DB lifecycle (open, migrate, close on app quit).
- **IPC**: minimal read API for settings and default exclusion patterns.
- No Dropbox or filesystem integration yet.

## 9. Acceptance Criteria

- [ ] `better-sqlite3` installed and rebuilt against the Electron Node version without errors.
- [ ] On first launch, `%APPDATA%/dropsync/dropsync.db` is created with all tables from Schema.ddl.
- [ ] Re-running the app does not re-apply migrations (idempotency verified via `schema_migration` contents).
- [ ] `default_exclusion_pattern` contains the seed set after first launch.
- [ ] `app_settings` can be read and written via main-process API and via an IPC channel.
- [ ] A simulated crash mid-transaction (e.g. forced exit during an insert batch) leaves the DB in a consistent state.
- [ ] Node built-in test runner tests cover: migration runner idempotency, seed data, and basic CRUD on `app_settings`.

## 10. Risks & Unknowns

- **better-sqlite3 rebuild friction** — documented risk in Architecture §5; mitigated with `electron-rebuild` pinned in postinstall.
- **Timestamp representation choice** — ISO strings are more human-readable in DB tooling; epoch ms are cheaper to compare. Pick one consistently.
- **SQLite doesn't have `TIMESTAMPTZ`** — timezone handling must be explicit; convention: store UTC ISO 8601.
- **Migration rollback** — not in scope; forward-only migrations only for MVP.

## 11. Dependencies

- **epic_APP_SCAFFOLD** — needs the main process bootstrap to attach the DB lifecycle.

## 12. References

- **prd:** docs/Product Requirements Document/PRD.md
- **architecture:** docs/Architecture/Architecture.md
- **data_model:** docs/Data Model/Schema.ddl
- **style_guide:** docs/Style Guide/StyleGuide.md

## 13. Implementation Notes

Suggested ticket breakdown (4–6 tickets):

1. Add `better-sqlite3` dependency, `electron-rebuild` postinstall, and open a DB handle on app launch.
2. Build a minimal versioned migration runner that reads files from a `migrations/` folder and records applied versions.
3. Author migration `0001_initial_schema.sql` translating all tables from the PostgreSQL DDL to SQLite.
4. Author migration `0002_seed_default_exclusions.sql` inserting the curated default exclusion list.
5. Expose `app_settings` and `default_exclusion_pattern` read/write via a minimal main-process API + IPC.
6. Node test-runner tests for migration idempotency, seed data, and settings CRUD.

**Complexity:** Medium. The DDL translation is mechanical but must be careful about types and triggers. The migration runner itself is small.
