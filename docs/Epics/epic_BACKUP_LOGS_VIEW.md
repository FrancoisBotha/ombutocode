# Epic: BACKUP_LOGS_VIEW

Status: NEW

## Overview

Give the user visibility into what DropSync has done. This epic delivers the
Backup Logs view: a history of every `backup_run`, drill-down into the
per-file `file_record` detail of any run, and a searchable `run_log` viewer
for diagnostic lines. This is the PRD's "confidence that backups are working"
feature (PRD §6).

This epic is read-only against the tables owned by SCHEDULER_AND_RUN_PIPELINE
and BACKUP_JOB_MANAGEMENT.

## Scope

### In Scope
- Logs list view: paginated table of `backup_run` rows across all jobs,
  sortable by `started_at`, filterable by job and status
- Columns: job name, status, started_at, finished_at, duration, counts
  (`files_scanned`, `files_uploaded`, `files_skipped`, `files_failed`,
  `files_deleted`, `bytes_uploaded`), `error_message` preview
- Run detail view for a single `backup_run`:
  - All header fields above
  - Per-file `file_record` table with `relative_path`, `action`, `size_bytes`,
    `dropbox_rev`, timestamps, and `error_message`
  - Filter by `action` (e.g. show only `failed`)
- `run_log` viewer pane filtered to the current run, with level filters
  (`debug`, `info`, `warn`, `error`) and text search
- IPC commands: `runs:list`, `runs:get`, `runs:files`, `runs:logs`
- Empty and loading states
- Sensible pagination / virtualisation so a run with 100k `file_record` rows
  does not lock the UI

### Out of Scope
- Writing to any of these tables (the pipeline epic owns writes)
- Triggering or cancelling runs from the UI (MVP-deferred manual trigger)
- Exporting logs (MVP-deferred)
- Restoring files from a historical run (MVP-deferred restore)
- Notifications (MVP-deferred)

## Functional Requirements

1. The user can see a paginated list of all backup runs across all jobs, most
   recent first.
2. The user can filter the list by job and by status.
3. The user can click into any run and see its full summary, the per-file
   records, and the structured `run_log` entries.
4. The per-file table in run detail can be filtered by `action`.
5. The `run_log` viewer can be filtered by level and searched by substring.
6. Large runs (tens of thousands of `file_record` rows) remain responsive
   through pagination or list virtualisation.

## Acceptance Criteria

- [ ] Logs list view shows runs from multiple jobs correctly sorted
- [ ] Filters by job and status narrow the list as expected
- [ ] Run detail view displays all `backup_run` fields including durations
      derived from `started_at` / `finished_at`
- [ ] Run detail file table lists `file_record` rows and filters by `action`
- [ ] `run_log` viewer filters by level and supports substring search
- [ ] A run with 10k+ `file_record` rows opens without freezing the UI
- [ ] All data is fetched via IPC; the renderer has no direct database access

## Dependencies

- APP_SHELL
- DATABASE_FOUNDATION
- SCHEDULER_AND_RUN_PIPELINE (produces the rows this view reads)
- BACKUP_JOB_MANAGEMENT (for job name lookup / filtering)

## Tickets

_To be created during planning mode._
