# Functional Requirements

| ID | Sub-System | Description | Status | Epic |
|----|------------|-------------|--------|------|
| FR-001 | App Scaffold | The Electron main process launches and opens a single BrowserWindow loading the Vue renderer. | NEW | epic_APP_SCAFFOLD |
| FR-002 | App Scaffold | The Vue 3 renderer builds via Vite and is served from the local filesystem in production builds. | NEW | epic_APP_SCAFFOLD |
| FR-003 | App Scaffold | A preload script uses contextBridge to expose a typed IPC API; nodeIntegration is disabled. | NEW | epic_APP_SCAFFOLD |
| FR-004 | App Scaffold | The renderer presents a sidebar + content layout shell with navigation entries for Backup Jobs and Backup Logs via Vue Router (hash history). | NEW | epic_APP_SCAFFOLD |
| FR-005 | Database | On first launch the app creates a SQLite database file at %APPDATA%/dropsync/dropsync.db, creating parent directories as needed. | NEW | epic_DATABASE_FOUNDATION |
| FR-006 | Database | Migrations are applied idempotently at startup and tracked in the schema_migration table. | NEW | epic_DATABASE_FOUNDATION |
| FR-007 | Database | The initial migration seeds default_exclusion_pattern with a curated set of common exclusions (node_modules, .git, __pycache__, *.tmp, Thumbs.db, .DS_Store). | NEW | epic_DATABASE_FOUNDATION |
| FR-008 | Database | An app_settings key/value store is readable and writable from the main process and exposed to the renderer via IPC. | NEW | epic_DATABASE_FOUNDATION |
| FR-009 | Dropbox Auth | The user can initiate the Dropbox OAuth 2.0 PKCE flow from a Connect control in the renderer. | NEW | epic_DROPBOX_AUTH |
| FR-010 | Dropbox Auth | On successful authentication, the refresh token is persisted to Windows Credential Manager via keytar. | NEW | epic_DROPBOX_AUTH |
| FR-011 | Dropbox Auth | The app exchanges the refresh token for short-lived access tokens on demand; access tokens are held only in main-process memory. | NEW | epic_DROPBOX_AUTH |
| FR-012 | Dropbox Auth | The access token is automatically refreshed when it expires or when a Dropbox API call returns 401. | NEW | epic_DROPBOX_AUTH |
| FR-013 | Dropbox Auth | A Disconnect action clears the stored refresh token and requires re-authentication before further Dropbox API calls. | NEW | epic_DROPBOX_AUTH |
| FR-014 | Job Management | The user can create a backup job by specifying name, source path, Dropbox target, interval (minutes), and exclusion rules. | NEW | epic_BACKUP_JOB_MANAGEMENT |
| FR-015 | Job Management | The user can edit every field of an existing backup job. | NEW | epic_BACKUP_JOB_MANAGEMENT |
| FR-016 | Job Management | The user can delete a backup job with confirmation; the delete cascades to exclusion_rule rows. | NEW | epic_BACKUP_JOB_MANAGEMENT |
| FR-017 | Job Management | The user can enable or disable a backup job without deleting it. | NEW | epic_BACKUP_JOB_MANAGEMENT |
| FR-018 | Job Management | The Job Config form validates required fields, rejects duplicate job names, and enforces interval_minutes > 0. | NEW | epic_BACKUP_JOB_MANAGEMENT |
| FR-019 | Job Management | The user can select the source folder via the native Windows folder picker. | NEW | epic_BACKUP_JOB_MANAGEMENT |
| FR-020 | Job Management | The user can add and remove per-job exclusion patterns; the form pre-populates from the active default exclusion patterns. | NEW | epic_BACKUP_JOB_MANAGEMENT |
| FR-021 | File Scanner | The scanner walks a job's source_path recursively and emits an entry per discovered file with a path relative to the source root. | NEW | epic_FILE_SCANNER |
| FR-022 | File Scanner | The scanner applies per-job exclusion rules using .gitignore-style semantics. | NEW | epic_FILE_SCANNER |
| FR-023 | File Scanner | For each included file the scanner captures file size in bytes and modified timestamp in UTC. | NEW | epic_FILE_SCANNER |
| FR-024 | File Scanner | Files that cannot be stat'd or opened due to locks or permissions are logged and recorded as failed without aborting the scan. | NEW | epic_FILE_SCANNER |
| FR-025 | Diff Engine | The Diff Engine classifies every scanned file as new, changed, unchanged, or deleted based on comparison with the most recent successful run's file_record state for the same job. | NEW | epic_DIFF_ENGINE |
| FR-026 | Diff Engine | Default detection uses size_bytes and modified_at; a mismatch in either field marks the file changed. | NEW | epic_DIFF_ENGINE |
| FR-027 | Diff Engine | When a job has strict_checksum = TRUE the engine additionally computes SHA-256 for files whose size and mtime match and compares against the stored checksum. | NEW | epic_DIFF_ENGINE |
| FR-028 | Diff Engine | Files present in the prior state but absent from the current scan are emitted with action = deleted. | NEW | epic_DIFF_ENGINE |
| FR-029 | Upload Manager | Files under 150 MB are uploaded via a single /files/upload API call. | NEW | epic_UPLOAD_MANAGER |
| FR-030 | Upload Manager | Files at or above 150 MB are uploaded via Dropbox upload sessions in chunks (start, append_v2, finish). | NEW | epic_UPLOAD_MANAGER |
| FR-031 | Upload Manager | Upload failures (network errors, 5xx responses) are retried with exponential backoff and jitter up to a bounded retry count. | NEW | epic_UPLOAD_MANAGER |
| FR-032 | Upload Manager | On 429 or rate-limited responses the Upload Manager waits for the duration specified by the Retry-After header before retrying. | NEW | epic_UPLOAD_MANAGER |
| FR-033 | Upload Manager | After a successful upload, the file's dropbox_rev and dropbox_path are recorded in file_record along with upload_started_at and upload_finished_at. | NEW | epic_UPLOAD_MANAGER |
| FR-034 | Scheduler | The scheduler inspects backup_job rows on a regular tick and triggers runs for enabled jobs whose next_run_at has elapsed. | NEW | epic_SCHEDULER_AND_RUN_PIPELINE |
| FR-035 | Scheduler | The run orchestrator drives the pipeline in order: File Scanner → Diff Engine → Upload Manager, recording results to backup_run, file_record, and run_log. | NEW | epic_SCHEDULER_AND_RUN_PIPELINE |
| FR-036 | Scheduler | A backup_run row is created with status running on start and updated to completed, failed, or cancelled with a finished_at timestamp when the run terminates. | NEW | epic_SCHEDULER_AND_RUN_PIPELINE |
| FR-037 | Scheduler | Per-file activity is recorded in file_record with the appropriate action values for the run. | NEW | epic_SCHEDULER_AND_RUN_PIPELINE |
| FR-038 | Scheduler | On app startup, any backup_run rows with status running from a prior process are marked failed with a clear error_message indicating interrupted-run recovery. | NEW | epic_SCHEDULER_AND_RUN_PIPELINE |
| FR-039 | Scheduler | A manual Run Now invocation triggers a run with trigger_source = manual regardless of the schedule. | NEW | epic_SCHEDULER_AND_RUN_PIPELINE |
| FR-040 | Jobs Dashboard | The Jobs view lists all rows in backup_job with name, source, target, interval, enabled state, current run status, next scheduled run, and last run summary. | NEW | epic_BACKUP_JOBS_DASHBOARD |
| FR-041 | Jobs Dashboard | The user can toggle a job's enabled state from the list row without navigating to Edit. | NEW | epic_BACKUP_JOBS_DASHBOARD |
| FR-042 | Jobs Dashboard | The user can trigger a manual Run Now from the list row, invoking the manual-run IPC command. | NEW | epic_BACKUP_JOBS_DASHBOARD |
| FR-043 | Jobs Dashboard | The user can open Edit or Delete actions from the list row. | NEW | epic_BACKUP_JOBS_DASHBOARD |
| FR-044 | Jobs Dashboard | Row status is displayed as a status pill (Running, Completed, Failed, Skipped, Disabled) with consistent colour semantics per the style guide. | NEW | epic_BACKUP_JOBS_DASHBOARD |
| FR-045 | Logs View | The Logs view lists backup_run rows across all jobs with job name, status, started_at, duration, file counters, bytes uploaded, and trigger source. | NEW | epic_BACKUP_LOGS_VIEW |
| FR-046 | Logs View | The user can filter the list by job and/or status. | NEW | epic_BACKUP_LOGS_VIEW |
| FR-047 | Logs View | The user can drill into an individual run and see its file_record entries and run_log entries. | NEW | epic_BACKUP_LOGS_VIEW |
| FR-048 | Logs View | Failed runs prominently display the error_message and the first failing file_record entries. | NEW | epic_BACKUP_LOGS_VIEW |
| FR-049 | System Tray | On launch the app installs a system tray icon using the Electron Tray API. | NEW | epic_SYSTEM_TRAY_INTEGRATION |
| FR-050 | System Tray | The tray icon changes state between idle, running, and error, driven by the scheduler's run lifecycle events. | NEW | epic_SYSTEM_TRAY_INTEGRATION |
| FR-051 | System Tray | The tray icon's right-click context menu exposes Open DropSync, Run Now (per-job submenu), and Quit DropSync. | NEW | epic_SYSTEM_TRAY_INTEGRATION |
| FR-052 | System Tray | Closing the main window hides it to the tray instead of quitting the application; the scheduler continues to run. | NEW | epic_SYSTEM_TRAY_INTEGRATION |
| FR-053 | System Tray | A single-instance lock prevents a second copy of DropSync from launching; attempting to launch a second copy focuses the existing window. | NEW | epic_SYSTEM_TRAY_INTEGRATION |
