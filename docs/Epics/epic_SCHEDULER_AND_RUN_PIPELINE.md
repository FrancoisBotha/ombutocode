# Epic: SCHEDULER_AND_RUN_PIPELINE

Status: NEW

## Overview

Assemble the pieces into a working backup. This epic delivers the **Scheduler**
that fires enabled `backup_job`s at their configured intervals, and the
**Run Pipeline** that owns the `backup_run` lifecycle and orchestrates
Scanner → Diff → Upload → persistence for each run. This is where DropSync's
reliability promise lands: transactional checkpointing, crash-resume, and
explicit run status transitions per the `backup_run.status` enum.

After this epic, the MVP is functionally complete end-to-end: a job configured
in the UI will actually produce uploaded files in Dropbox on schedule.

## Scope

### In Scope
- Interval scheduler driven by `backup_job.next_run_at`, honoring `enabled`
- `backup_run` lifecycle: `pending` → `running` → `completed` | `failed` |
  `cancelled` with matching `started_at` / `finished_at` writes
- Per-run orchestration:
  1. Create `backup_run` row in `pending`, transition to `running`
  2. Invoke File Scanner to enumerate and classify candidate files
  3. Invoke Diff Engine against prior `file_record` state
  4. Feed new/changed files to Upload Manager
  5. If `backup_job.mirror_deletes = true`, delete removed files from Dropbox
     via the API client (default is preserve, per ADR-005)
  6. Write `file_record` rows for every classification (`new`, `changed`,
     `unchanged`, `deleted`, `failed`, `excluded`) so a run is fully
     reconstructable
  7. Update `backup_run` counts, status, and `finished_at`
- Transactional checkpointing so a crash mid-run leaves a consistent
  `backup_run` state the next run can reason about
- Crash-resume logic: on startup, any `backup_run` still in `running` is
  marked `failed` with a clear `error_message` (MVP behavior; full resume is
  a future enhancement)
- Progress events published to the renderer via IPC so the UI can reflect a
  live run
- `RunLog` entries emitted at key pipeline stages for the Logs view
- Trigger sources recorded in `backup_run.trigger_source` (`scheduler` for
  this epic; `manual` is MVP-deferred per PRD §7)

### Out of Scope
- The Logs view UI itself (BACKUP_LOGS_VIEW)
- Manual "Run Now" trigger (MVP-deferred)
- Notifications on completion/failure (MVP-deferred)
- The Upload Manager's internal mechanics (UPLOAD_MANAGER)

## Functional Requirements

1. Enabled backup jobs fire at their configured interval while the app is
   running; `next_run_at` advances after each run.
2. Disabled jobs never fire.
3. A run begins with a `backup_run` row in `pending`, moves to `running` once
   work starts, and reaches exactly one terminal state: `completed`, `failed`,
   or `cancelled`.
4. The pipeline invokes Scanner, then Diff, then Upload, in that order, and
   writes one `file_record` row per classified path per run.
5. `backup_run` counters (`files_scanned`, `files_uploaded`, `files_skipped`,
   `files_failed`, `files_deleted`, `bytes_uploaded`) are correct at the end
   of a run.
6. On any uncaught pipeline error, the run transitions to `failed` with a
   non-null `error_message`.
7. On app startup, any `backup_run` left in `running` from a prior crash is
   transitioned to `failed` with a "crash recovery" `error_message`.
8. Run progress events are emitted to the renderer over IPC during the run.
9. With `backup_job.mirror_deletes = true`, files classified `deleted` by the
   Diff Engine are removed from the Dropbox target; otherwise they are
   preserved (default).
10. Only one run per job is active at a time; concurrent fires for the same
    job are coalesced or queued.

## Acceptance Criteria

- [ ] A freshly created and enabled job runs automatically at its configured
      interval end-to-end and uploads expected files
- [ ] `backup_run` status transitions match the strict lifecycle above
- [ ] Final `backup_run` counts match the files actually scanned, uploaded,
      skipped, failed, and deleted
- [ ] A synthetic pipeline error produces `status = 'failed'` with
      `error_message` populated
- [ ] Killing the app mid-run and restarting converts the abandoned
      `running` row to `failed` on next launch
- [ ] `mirror_deletes = false` preserves Dropbox files when the source is
      deleted; `mirror_deletes = true` removes them
- [ ] Progress events are received in the renderer during a run
- [ ] `RunLog` rows are emitted at start, classification summary, upload
      completion, and terminal transition

## Dependencies

- APP_SHELL
- DATABASE_FOUNDATION
- DROPBOX_AUTH
- BACKUP_JOB_MANAGEMENT (source of `backup_job` rows to schedule)
- FILE_SCANNER_AND_DIFF
- UPLOAD_MANAGER

## Tickets

_To be created during planning mode._
