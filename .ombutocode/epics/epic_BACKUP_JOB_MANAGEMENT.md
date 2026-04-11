# Epic: BACKUP_JOB_MANAGEMENT

Status: NEW

## Overview

Let the user create, view, edit, enable/disable, and delete backup jobs. A
backup job is the central user-facing concept in DropSync: a named pairing of
a local source folder, a Dropbox target folder, an interval, and a set of
exclusion rules. This epic delivers the full CRUD experience — the Jobs list
view, the create/edit form, folder pickers for both ends, and the persistence
layer backed by `backup_job` and `exclusion_rule`.

It does **not** run backups; it only captures what should be backed up. The
Scheduler and pipeline epics execute these jobs.

## Scope

### In Scope
- Jobs list view showing each `backup_job` with name, source, target,
  interval, enabled flag, `last_run_at`, `next_run_at`, and latest run status
- Create Job flow:
  - Name field with uniqueness enforced by `backup_job_name_unique`
  - Local source folder picker using the Electron `dialog.showOpenDialog`
  - Dropbox target folder picker/browser that lists and lets the user create
    folders using the Dropbox API client from DROPBOX_AUTH
  - Interval selection (minutes) with sensible defaults from `app_settings`
  - Strict-checksum and mirror-deletes toggles (ADR-002, ADR-005) with
    explanatory help text and safe defaults (off)
  - Exclusion rules editor pre-populated from `default_exclusion_pattern`,
    with add/remove/inline edit
- Edit Job flow re-using the same form
- Enable/disable toggle on the list and detail views
- Delete Job with confirmation and `ON DELETE CASCADE` cleanup of
  `exclusion_rule`, `backup_run`, `file_record`, `run_log`
- IPC commands: `job:list`, `job:get`, `job:create`, `job:update`,
  `job:delete`, `job:setEnabled`

### Out of Scope
- Triggering a backup run, manual or scheduled (SCHEDULER_AND_RUN_PIPELINE,
  UPLOAD_MANAGER)
- Displaying run history details (BACKUP_LOGS_VIEW)
- Notifications (MVP-deferred)

## Functional Requirements

1. The user can see all configured backup jobs at a glance with their current
   status and next scheduled run time.
2. The user can create a new job by entering a unique name, picking a local
   source folder, picking or creating a Dropbox target folder, setting an
   interval in minutes, and optionally editing exclusion rules.
3. The user can edit any field on an existing job.
4. The user can enable or disable a job without deleting it; disabled jobs
   are not eligible for scheduling.
5. The user can delete a job; all dependent `exclusion_rule`, `backup_run`,
   `file_record`, and `run_log` rows cascade away.
6. New jobs start with the active default exclusion patterns pre-populated
   but user-removable.
7. The Dropbox target folder picker can list folders under a given path and
   create a new folder via the Dropbox API client.
8. Name uniqueness and blank source/target constraints from the schema are
   surfaced as inline validation before submit.

## Acceptance Criteria

- [ ] Jobs list view renders all rows in `backup_job` with correct fields
- [ ] Create Job produces one `backup_job` row and one `exclusion_rule` row
      per rule supplied
- [ ] Validation prevents duplicate names and blank source/target paths
- [ ] Local folder picker returns an absolute path and is stored in
      `source_path`
- [ ] Dropbox folder picker can list and create folders under the user's
      Dropbox root
- [ ] Edit Job persists all changes and updates `updated_at`
- [ ] Enable/disable toggles `enabled` without touching other fields
- [ ] Delete Job removes the job and cascades dependent rows
- [ ] Default exclusion patterns are pre-populated for new jobs

## Dependencies

- APP_SHELL
- DATABASE_FOUNDATION
- DROPBOX_AUTH (for the Dropbox folder picker)

## Tickets

_To be created during planning mode._
