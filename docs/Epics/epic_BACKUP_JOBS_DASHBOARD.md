# Epic: Backup Jobs Dashboard

- **Status:** NEW
- **Owner:** human
- **Created:** 2026-04-11
- **Last Updated:** 2026-04-11

## 1. Purpose

Deliver the primary Vue view that lists all configured backup jobs at a glance, with name, source, target, schedule, status badge, next scheduled run, and last run summary. The view is where the user spends the most time — it should answer "is everything OK?" in a single glance and provide quick actions for Run Now, Edit, Enable/Disable, and Delete.

## 2. User Story

As a **DropSync user**, I want **a dashboard listing all my backup jobs with their current status and next run time**, so that **I can see at a glance whether my backups are healthy and take quick action on any job that needs attention**.

## 3. Scope

**In Scope**
- Jobs list view (full-width list/table per style guide §3 secondary layouts)
- Per-row display: job name, source path (truncated), Dropbox target, interval, enabled state, current status badge, next run time, last run summary (status + finished_at)
- Row status badges driven by the latest `backup_run` state for each job (Running / Completed / Failed / Disabled)
- Row actions: Run Now, Edit, Enable/Disable toggle, Delete (ghost/inline buttons)
- Live updates from IPC `runs.*` events emitted by epic_SCHEDULER_AND_RUN_PIPELINE
- Empty state when no jobs exist: call-to-action to create the first job
- Create Job primary button opening the Job Config form

**Out of Scope**
- Job creation form itself (epic_BACKUP_JOB_MANAGEMENT)
- Detailed run history (epic_BACKUP_LOGS_VIEW)
- Storage quota display (deferred per PRD)

## 4. Functional Requirements

- **FR-040** — The Jobs view lists all rows in `backup_job` with name, source, target, interval, enabled state, current run status, next scheduled run, and last run summary.
- **FR-041** — The user can toggle a job's `enabled` state from the list row without navigating to Edit.
- **FR-042** — The user can trigger a manual "Run Now" from the list row, invoking the manual-run IPC command.
- **FR-043** — The user can open Edit or Delete actions from the list row.
- **FR-044** — Row status is displayed as a status pill per the style guide (Running, Completed, Failed, Skipped, Disabled) with consistent colour semantics.

## 5. Non-Functional Requirements

- **NFR-014** — The Jobs view must reflect run status changes in near real-time (within ~1 second) as IPC `runs.*` events arrive, without manual refresh.

## 6. UI/UX Notes

- **Layout**: full-width list/table within the content region, 24px page padding.
- **Table header**: `#F0F3F7` background, 12px semi-bold muted text; columns: Name, Source, Target, Interval, Status, Next Run, Last Run, Actions.
- **Rows**: white background, 12px vertical / 16px horizontal padding, 1px bottom border `#E1E5EB`, hover `#F0F3F7`.
- **Text alignment**: names and paths left-aligned; numeric counts in tooltips right-aligned.
- **Status pill**: 12px radius pill with the status palette from the style guide.
- **Disabled jobs**: status pill shows "Disabled" grey; row text is rendered in muted text `#6B7280`.
- **Actions column**: ghost buttons ("Run Now", "Edit", "Delete") right-aligned; Delete in danger colour.
- **Empty state**: centered message + primary "Create Backup Job" button.
- **Page header**: H1 "Backup Jobs" with a primary "Create Job" button right-aligned above the table.
- **Destructive confirmation**: Delete confirms via modal per style guide.

## 7. Data Model Impact

- **Reads** from `backup_job` joined with latest `backup_run` per job (subquery or lateral join equivalent in SQLite).
- **Writes** to `backup_job.enabled` via IPC on toggle.
- No schema changes.

## 8. Integration Impact

- **IPC** — `jobs.list` (reused from epic_BACKUP_JOB_MANAGEMENT), `runs.runNow`, `runs.*` event subscription.
- **Vue Router** — `/jobs` route.
- Consumes live events from epic_SCHEDULER_AND_RUN_PIPELINE.

## 9. Acceptance Criteria

- [ ] Creating a job and navigating to the Jobs view shows the new row with all fields populated correctly.
- [ ] The empty state is shown when no jobs exist, with a primary "Create Backup Job" CTA.
- [ ] Toggling Enable/Disable from a row updates `backup_job.enabled` and re-renders the row with the correct badge.
- [ ] "Run Now" triggers a manual run and the row badge transitions to Running within 1 second.
- [ ] As the run progresses and finishes, the row badge transitions to Completed (or Failed) and the Last Run column updates.
- [ ] Delete confirms via modal and removes the row on confirmation.
- [ ] All visuals match the style guide (colours, spacing, radii, status pill shape).
- [ ] Disabled jobs are visually distinct (muted text + "Disabled" pill) and do not show a Next Run time.

## 10. Risks & Unknowns

- **"Latest run per job" query** — needs to be efficient as the `backup_run` table grows. An index exists (`ix_backup_run_job_started`); verify it's used.
- **Truncation of long source paths** — must show enough to be useful (leading + trailing path components with ellipsis in middle) — details TBD.
- **Live updates while on other views** — IPC events should be subscribed at the right scope so they don't leak listeners across route changes.

## 11. Dependencies

- **epic_APP_SCAFFOLD**
- **epic_BACKUP_JOB_MANAGEMENT** — provides CRUD and form
- **epic_SCHEDULER_AND_RUN_PIPELINE** — provides `runs.*` IPC events and `runNow` command
- **epic_DATABASE_FOUNDATION**

## 12. References

- **prd:** docs/Product Requirements Document/PRD.md
- **architecture:** docs/Architecture/Architecture.md
- **data_model:** docs/Data Model/Schema.ddl
- **style_guide:** docs/Style Guide/StyleGuide.md

## 13. Implementation Notes

Suggested ticket breakdown (4–5 tickets):

1. `jobs.listWithLatestRun` IPC command returning the join of `backup_job` + latest `backup_run` per job.
2. Jobs view Vue component with the table, style tokens, and empty state.
3. Row actions: Run Now, Enable/Disable, Edit (navigate), Delete (modal + IPC).
4. Subscribe to `runs.*` IPC events and merge updates into the local view state.
5. Visual pass against the style guide — status pills, row hover, action alignment.

**Complexity:** Medium. Straightforward view; live-update wiring and the latest-run query are the interesting bits.
