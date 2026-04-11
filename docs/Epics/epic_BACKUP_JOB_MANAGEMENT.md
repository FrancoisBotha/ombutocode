# Epic: Backup Job Management

- **Status:** NEW
- **Owner:** human
- **Created:** 2026-04-11
- **Last Updated:** 2026-04-11

## 1. Purpose

Deliver CRUD for backup jobs — the user's primary configuration unit in DropSync. A job bundles a source folder, a Dropbox target, a run interval, strict-checksum/mirror-deletes flags, and a set of exclusion patterns. This epic provides the main-process Job Manager, an IPC API, and a renderer Job Config form so users can create, edit, enable/disable, and delete jobs.

## 2. User Story

As a **DropSync user**, I want **to create, edit, enable/disable, and delete backup jobs with source, target, schedule, and exclusions**, so that **I can configure exactly what gets backed up to my Dropbox and when**.

## 3. Scope

**In Scope**
- Job Manager module in the main process with CRUD over `backup_job` and `exclusion_rule`
- IPC API: `listJobs`, `getJob`, `createJob`, `updateJob`, `deleteJob`, `toggleJobEnabled`
- Validation: required fields, positive interval, unique job name, non-blank source and target
- Job Config form in the renderer (centered, 560px max-width per style guide §3)
- Native folder picker for `source_path` via Electron `dialog.showOpenDialog`
- Dropbox target input (typed/pasted; no tree browser in this epic)
- Per-job exclusion rule editor pre-populated from `default_exclusion_pattern`
- `strict_checksum` and `mirror_deletes` flag toggles with tooltip/help text
- Delete confirmation modal (destructive action)

**Out of Scope**
- Dropbox folder tree browser (could ship as a later enhancement)
- Actually running a backup (epic_SCHEDULER_AND_RUN_PIPELINE, epic_UPLOAD_MANAGER)
- Showing runs / last run summary on the job (epic_BACKUP_JOBS_DASHBOARD)
- Job export / import (deferred per PRD)

## 4. Functional Requirements

- **FR-014** — The user can create a backup job by specifying name, source path, Dropbox target, interval (minutes), and exclusion rules.
- **FR-015** — The user can edit every field of an existing backup job.
- **FR-016** — The user can delete a backup job; the action is confirmed before commit and cascades to `exclusion_rule` rows.
- **FR-017** — The user can enable or disable a backup job without deleting it.
- **FR-018** — The Job Config form validates required fields, rejects duplicate job names, and enforces `interval_minutes > 0`.
- **FR-019** — The user can select the source folder via the native Windows folder picker.
- **FR-020** — The user can add and remove per-job exclusion patterns; the form pre-populates with the active default exclusion patterns, which the user can accept or remove.

## 5. Non-Functional Requirements

- **NFR-007** — The Job Config form layout follows the style guide's centered-form secondary layout (max-width 560px, 24px section gap, 6px radius inputs).

## 6. UI/UX Notes

- **Form layout**: centered, max-width 560px, label-above-input convention (never placeholder-as-label per style guide §5).
- **Fields**:
  - Name (text)
  - Source path (text + "Browse…" secondary button opening folder picker)
  - Dropbox target (text, pre-filled with `/DropSync/<job-name>` default)
  - Interval (number + unit dropdown: minutes / hours)
  - Strict checksum mode (toggle, with "Slower but verifies content hash" help text)
  - Mirror deletes (toggle, with warning help text — this is destructive behaviour)
  - Exclusion rules (multi-line editor or pattern-chip list)
- **Buttons**: "Save" (primary), "Cancel" (secondary), "Delete" (danger, only visible in edit mode).
- **Validation**: inline error under each invalid field; Save disabled until form is valid.
- **Delete confirmation**: modal with job name echoed back for safety.

## 7. Data Model Impact

- Reads/writes `backup_job` (all fields except `last_run_at`, `next_run_at`, which are managed by the scheduler epic).
- Reads/writes `exclusion_rule` with cascade-delete on parent.
- Reads `default_exclusion_pattern` to pre-populate new jobs.
- No schema changes.

## 8. Integration Impact

- **Electron `dialog.showOpenDialog`** for the folder picker.
- **IPC**: new command channels under `jobs.*`.
- Does not yet touch Dropbox API (target path is free-text in this epic).

## 9. Acceptance Criteria

- [ ] User can create a new backup job via the form; the row lands in `backup_job` and associated `exclusion_rule` rows are inserted.
- [ ] User can edit all fields of an existing job; changes persist.
- [ ] Duplicate names are rejected with a clear inline error.
- [ ] Negative or zero interval values are rejected.
- [ ] Folder picker launches the native Windows folder dialog and populates the source path.
- [ ] Deleting a job shows a confirmation and cascades to `exclusion_rule` rows.
- [ ] Enabling/disabling a job updates `backup_job.enabled` without affecting other fields.
- [ ] New jobs start with the active default exclusion patterns pre-populated.
- [ ] Form visual matches the style guide centered-form layout (verified against screenshot or mockup).

## 10. Risks & Unknowns

- **Dropbox target validation** — in this epic it's free-text. A later epic could validate that the path exists / can be created in Dropbox.
- **Interval UX** — raw minutes is simple but not friendly; a minutes/hours dropdown is a small UX win.
- **Mirror-deletes flag surfacing** — this is a dangerous option; the help text and confirmation on enable should be unambiguous.

## 11. Dependencies

- **epic_APP_SCAFFOLD** — sidebar and routing
- **epic_DATABASE_FOUNDATION** — `backup_job`, `exclusion_rule`, `default_exclusion_pattern` tables
- **epic_DROPBOX_AUTH** — *soft dependency*; the form can exist without a connected account, but save should warn if Dropbox is not connected

## 12. References

- **prd:** docs/Product Requirements Document/PRD.md
- **architecture:** docs/Architecture/Architecture.md
- **data_model:** docs/Data Model/Schema.ddl
- **style_guide:** docs/Style Guide/StyleGuide.md

## 13. Implementation Notes

Suggested ticket breakdown (5–7 tickets):

1. Job Manager module in main process: CRUD over `backup_job` and `exclusion_rule` with prepared statements and transactional writes.
2. IPC channels `jobs.list / get / create / update / delete / toggleEnabled`.
3. Job Config form skeleton (route, layout, style tokens) — centered 560px.
4. Form fields: name, source path + folder picker, target, interval, strict-checksum, mirror-deletes.
5. Exclusion rule editor with default-pattern pre-population and add/remove chip UI.
6. Delete confirmation modal and enable/disable toggle.
7. Validation + inline errors + tests for Job Manager CRUD and form validation.

**Complexity:** Medium. CRUD is straightforward; the form wiring and validation are the bulk of the work.
