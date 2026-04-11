# Epic: Backup Logs View

- **Status:** TICKETS
- **Owner:** human
- **Created:** 2026-04-11
- **Last Updated:** 2026-04-11

## 1. Purpose

Deliver the Vue view that presents backup run history across all jobs, with filtering, drill-down into per-file records and structured log lines, and clear surfacing of failures. This is the user's primary confidence-building surface — "did my backups actually work, and if not, why?"

## 2. User Story

As a **DropSync user**, I want **to browse the history of my backup runs with counts, durations, and per-file details**, so that **I can confirm backups ran as expected and investigate any failures clearly**.

## 3. Scope

**In Scope**
- Logs list view listing `backup_run` rows across all jobs, newest first
- Columns: job name, status badge, started_at, duration, files_scanned, files_uploaded, files_failed, bytes_uploaded, trigger_source
- Filtering by job (dropdown) and status (dropdown)
- Pagination or virtualization so thousands of runs don't degrade UI performance
- Drill-down: clicking a run opens a detail panel or route showing:
  - Full run metadata
  - Per-file `file_record` rows (grouped/filterable by `action`)
  - Structured `run_log` entries (filterable by level)
  - Prominent display of `error_message` when the run is `failed`
- Empty state when no runs exist

**Out of Scope**
- Log export / download
- Clearing old logs (noted as future feature in Architecture §4 Data Lifecycle)
- Restore-from-backup (deferred per PRD)

## 4. Functional Requirements

- **FR-045** — The Logs view lists `backup_run` rows across all jobs with job name, status, started_at, duration, file counters, bytes uploaded, and trigger source.
- **FR-046** — The user can filter the list by job and/or status.
- **FR-047** — The user can drill into an individual run and see its `file_record` entries and `run_log` entries.
- **FR-048** — Failed runs prominently display the `error_message` and the first failing `file_record` entries.

## 5. Non-Functional Requirements

- **NFR-015** — The Logs view must paginate or virtualize its rendering so that browsing thousands of run rows (and tens of thousands of file records in a drill-down) does not cause UI jank.

## 6. UI/UX Notes

- **Layout**: full-width list/table per style guide secondary layouts.
- **Filters bar**: above the table — job dropdown, status dropdown, reset button (ghost).
- **Table**: same visual language as the Jobs dashboard (header `#F0F3F7`, 12px semi-bold muted; rows 12×16 padding; hover `#F0F3F7`).
- **Numeric columns right-aligned** per style guide.
- **Status pill** per row.
- **Drill-down** opens a detail view (secondary route `/logs/:runId`) containing:
  - Header card with run metadata (job, status pill, started/finished, counters, duration, bytes)
  - If failed: a prominent error card in the error colour with the `error_message`
  - Files section: tabbed or filterable by `action` (New / Changed / Unchanged / Deleted / Failed / Excluded)
  - Log section: virtualized list of `run_log` entries with level icons and timestamps; filter chips for `info`/`warn`/`error`
- **Back navigation** to the logs list via a secondary button.
- **Empty state**: centered message "No backup runs yet" with secondary "Create a job to get started" link.

## 7. Data Model Impact

- **Reads** from `backup_run`, `file_record`, `run_log`.
- Uses indices `ix_backup_run_status_started`, `ix_backup_run_job_started`, `ix_file_record_run_action`, `ix_run_log_run_ts`.
- No schema changes.

## 8. Integration Impact

- **IPC** — new read-only channels: `logs.listRuns`, `logs.getRun`, `logs.listFiles(runId, filters)`, `logs.listEntries(runId, filters)`.
- **Vue Router** — `/logs` and `/logs/:runId` routes.
- **Virtualization library** — e.g. `vue-virtual-scroller` or a lightweight built-in approach (decision during implementation).

## 9. Acceptance Criteria

- [ ] Logs view shows all runs, newest first, with all listed columns populated.
- [ ] Filtering by job reduces the list to runs for that job.
- [ ] Filtering by status reduces the list to runs in that status.
- [ ] Drilling into a run shows the run header, per-file records, and structured log entries.
- [ ] Failed runs display `error_message` prominently in the error colour.
- [ ] Per-file list can be filtered by `action` (new, changed, unchanged, deleted, failed, excluded).
- [ ] Run log entries can be filtered by level.
- [ ] Browsing a 10,000-run dataset stays responsive (pagination or virtualization verified).
- [ ] Empty state appears when no runs exist.

## 10. Risks & Unknowns

- **Pagination vs. virtualization** — virtualization is smoother but adds a dependency. For the MVP, simple page-based pagination may suffice.
- **Large `file_record` drill-downs** — a single run may produce tens of thousands of file records; the per-file panel should virtualize or page.
- **Long `error_message`** — SQLite TEXT has no length cap; the UI must handle multi-line errors with scrolling.

## 11. Dependencies

- **epic_APP_SCAFFOLD**
- **epic_DATABASE_FOUNDATION**
- **epic_SCHEDULER_AND_RUN_PIPELINE** — produces the runs and logs being displayed

## 12. References

- **prd:** docs/Product Requirements Document/PRD.md
- **architecture:** docs/Architecture/Architecture.md
- **data_model:** docs/Data Model/Schema.ddl
- **style_guide:** docs/Style Guide/StyleGuide.md

## 13. Implementation Notes

Suggested ticket breakdown (5–6 tickets):

1. IPC read commands: `logs.listRuns(filters, pagination)`, `logs.getRun(runId)`, `logs.listFiles(runId, actionFilter, pagination)`, `logs.listEntries(runId, levelFilter, pagination)`.
2. Logs list Vue view with filter bar, paginated table, empty state.
3. Run detail view layout: header card, failed-run error card, sectioned file / log panels.
4. Per-file tab/filter and log-level filter with virtualization.
5. Navigation between list ↔ detail and deep-linking support (`/logs/:runId`).
6. Performance pass on a seeded 10k-run fixture.

**Complexity:** Medium. The view itself is not novel; the interesting work is in query efficiency and virtualization for the drill-downs.
