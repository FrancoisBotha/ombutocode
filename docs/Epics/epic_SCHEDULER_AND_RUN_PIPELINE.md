# Epic: Scheduler and Run Pipeline

- **Status:** NEW
- **Owner:** human
- **Created:** 2026-04-11
- **Last Updated:** 2026-04-11

## 1. Purpose

Wire the backup pipeline together. This epic delivers the interval scheduler that fires jobs based on `next_run_at`, the run orchestrator that drives `Scanner → Diff → Uploader` end-to-end, transactional persistence of `backup_run` / `file_record` / `run_log` state, and crash recovery for runs that were interrupted. It is the first epic where a complete backup actually happens from end to end.

## 2. User Story

As a **DropSync user**, I want **my configured backup jobs to run automatically at their scheduled intervals and to reliably record what happened**, so that **I can trust DropSync to keep my folders backed up without babysitting it**.

## 3. Scope

**In Scope**
- Interval scheduler that wakes every N seconds (e.g. 30s) and inspects `backup_job` rows for jobs whose `next_run_at` has elapsed and that are `enabled = TRUE`
- Run orchestration: create `backup_run` with `status='running'`, invoke Scanner → Diff → Uploader, update counters, finalize with `status='completed'` or `status='failed'` and `finished_at`
- Transactional writes per checkpoint so a crash leaves the DB consistent
- Crash recovery on startup: any `backup_run` rows left in `running` from a prior process are marked `failed` with an explanatory `error_message`
- Manual "Run Now" invocation triggered from the dashboard (epic_BACKUP_JOBS_DASHBOARD) with `trigger_source='manual'`
- `next_run_at` computation after each run based on `interval_minutes`
- Emission of IPC progress events to the renderer (`runStarted`, `runProgress`, `runFinished`) for near real-time UI updates
- Concurrency rule: a given job cannot have two runs in flight simultaneously; global concurrency across jobs is bounded (default 1 for MVP — sequential runs)

**Out of Scope**
- Actual file walking, diffing, and uploading (those are the earlier pipeline epics)
- UI surfaces — the dashboard and logs views consume this epic's output
- Resuming a partially-completed run with precise chunk offsets (mark failed and retry on next scheduled run)
- Notifications (deferred per PRD)

## 4. Functional Requirements

- **FR-034** — The scheduler inspects `backup_job` rows on a regular tick and triggers runs for jobs that are `enabled` and whose `next_run_at` has elapsed.
- **FR-035** — The run orchestrator drives the pipeline in order: File Scanner → Diff Engine → Upload Manager, and records results to `backup_run`, `file_record`, and `run_log`.
- **FR-036** — A `backup_run` row is created with `status='running'` on start and updated to `completed`, `failed`, or `cancelled` with a `finished_at` timestamp when the run terminates.
- **FR-037** — Per-file activity is recorded in `file_record` with the appropriate `action` values for the run.
- **FR-038** — On app startup, any `backup_run` rows with `status='running'` from a prior process are marked `failed` with a clear `error_message` indicating interrupted-run recovery.
- **FR-039** — A manual "Run Now" invocation triggers a run with `trigger_source='manual'` regardless of the schedule.

## 5. Non-Functional Requirements

- **NFR-012** — The scheduler must continue to fire and run jobs while the main window is hidden (minimized to tray).
- **NFR-013** — Run state must be durable across app restarts: no completed run should be lost, and no interrupted run should remain in `running` state after restart.

## 6. UI/UX Notes

No direct UI in this epic, but IPC progress events (`runStarted`, `runProgress`, `runFinished`) are emitted for epic_BACKUP_JOBS_DASHBOARD to consume so that the dashboard can update status badges in near real-time.

## 7. Data Model Impact

- Writes `backup_run` (create, update counters, finalize).
- Writes `file_record` via the Scanner/Diff/Uploader subsystems.
- Writes `run_log` with structured `info`/`warn`/`error` lines throughout the run.
- Updates `backup_job.last_run_at` and `backup_job.next_run_at` after each run.

## 8. Integration Impact

- **epic_FILE_SCANNER**, **epic_DIFF_ENGINE**, **epic_UPLOAD_MANAGER** — orchestrated end-to-end.
- **IPC** — new `runs.*` event channel (main → renderer push).
- **Electron app lifecycle** — startup crash-recovery hook, graceful shutdown to mark runs `cancelled` on app quit.

## 9. Acceptance Criteria

- [ ] Creating a new job with a 1-minute interval and waiting past `next_run_at` causes a run to fire without manual intervention.
- [ ] A full pipeline run end-to-end produces a `backup_run` row, populated `file_record` rows (mix of `new`, `unchanged`, etc.), and `run_log` entries.
- [ ] `backup_run` counters (`files_scanned`, `files_uploaded`, `files_skipped`, `files_failed`, `files_deleted`, `bytes_uploaded`) match the actual pipeline output.
- [ ] `backup_job.last_run_at` and `next_run_at` are updated correctly after the run.
- [ ] Forcibly killing the app mid-run and restarting causes the orphaned run to be marked `failed` with a clear `error_message`.
- [ ] "Run Now" from the dashboard triggers an out-of-schedule run with `trigger_source='manual'`.
- [ ] A job cannot have two concurrent runs in flight for the same `job_id`.
- [ ] IPC progress events fire for `runStarted`, `runProgress` (periodic), and `runFinished`.
- [ ] The scheduler keeps firing jobs while the window is hidden/minimized.

## 10. Risks & Unknowns

- **Graceful shutdown** — on app quit during a run, we should mark the run `cancelled` transactionally before the process dies. Electron provides `before-quit` hooks; the shutdown must be bounded in time.
- **Clock drift** — relying on `Date.now()` is fine for minute-granularity scheduling; sub-second accuracy isn't required.
- **Sequential vs. parallel jobs** — defaulting to one run at a time (global) keeps Dropbox rate-limit pressure low; users with many jobs may notice serialization.
- **`next_run_at` drift** — should be calculated from `started_at + interval_minutes`, not `finished_at`, to avoid slow runs pushing the schedule out.

## 11. Dependencies

- **epic_FILE_SCANNER**
- **epic_DIFF_ENGINE**
- **epic_UPLOAD_MANAGER**
- **epic_DATABASE_FOUNDATION**
- **epic_BACKUP_JOB_MANAGEMENT** — need jobs to run

## 12. References

- **prd:** docs/Product Requirements Document/PRD.md
- **architecture:** docs/Architecture/Architecture.md
- **data_model:** docs/Data Model/Schema.ddl
- **style_guide:** docs/Style Guide/StyleGuide.md

## 13. Implementation Notes

Suggested ticket breakdown (5–7 tickets):

1. Scheduler tick: `setInterval`-based loop that queries jobs due to run and enqueues them.
2. Run orchestrator: creates `backup_run`, invokes Scanner → Diff → Uploader, updates counters, finalizes.
3. Transactional checkpoint writes and counter updates during the run.
4. Crash recovery on startup: sweep `backup_run` rows still in `running` and mark them `failed`.
5. `last_run_at` / `next_run_at` maintenance and job-level single-flight enforcement.
6. IPC progress events: `runStarted`, `runProgress`, `runFinished` channels.
7. Manual `runNow(jobId)` IPC command with `trigger_source='manual'`.

**Complexity:** High. This is the integration point for three upstream pipeline epics plus crash recovery and IPC fan-out. Thorough testing (including simulated crashes) is essential.
