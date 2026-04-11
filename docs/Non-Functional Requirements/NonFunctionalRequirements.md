# Non-Functional Requirements

| ID | Sub-System | Description | Status | Epic |
|----|------------|-------------|--------|------|
| NFR-001 | App Scaffold | The renderer process must run with contextIsolation enabled and must not have direct access to Node.js APIs. | NEW | epic_APP_SCAFFOLD |
| NFR-002 | App Scaffold | electron-builder must produce a Windows installer (.exe) from a single npm run build command. | NEW | epic_APP_SCAFFOLD |
| NFR-003 | Database | All writes during a backup run (backup_run updates, file_record inserts, run_log inserts) must be wrapped in transactions to prevent corruption on crash. | NEW | epic_DATABASE_FOUNDATION |
| NFR-004 | Database | The SQLite schema must preserve the semantics of the authoring PostgreSQL DDL (constraints, enums-as-CHECKs, cascade deletes, indices). | NEW | epic_DATABASE_FOUNDATION |
| NFR-005 | Dropbox Auth | OAuth tokens must never be persisted in cleartext, in SQLite, or in log files. | NEW | epic_DROPBOX_AUTH |
| NFR-006 | Dropbox Auth | All Dropbox API traffic must use TLS 1.2 or higher; no plaintext fallback is permitted. | NEW | epic_DROPBOX_AUTH |
| NFR-007 | Job Management | The Job Config form layout follows the style guide's centered-form secondary layout (max-width 560px, 24px section gap, 6px radius inputs). | NEW | epic_BACKUP_JOB_MANAGEMENT |
| NFR-008 | File Scanner | The scanner must process a directory tree of at least 100,000 files without running out of memory by streaming results rather than building a single in-memory array. | NEW | epic_FILE_SCANNER |
| NFR-009 | Diff Engine | In default mode, diffing a 100,000-file tree must complete in under 10 seconds on a typical modern developer laptop (SSD, warm filesystem cache). | NEW | epic_DIFF_ENGINE |
| NFR-010 | Upload Manager | A single file upload failure must not abort the backup run; the run continues with remaining files and the failure is captured in file_record.error_message and run_log. | NEW | epic_UPLOAD_MANAGER |
| NFR-011 | Upload Manager | Concurrent uploads are bounded (recommended default: 4) to avoid saturating the connection or exceeding Dropbox's concurrent-request limits. | NEW | epic_UPLOAD_MANAGER |
| NFR-012 | Scheduler | The scheduler must continue to fire and run jobs while the main window is hidden (minimized to tray). | NEW | epic_SCHEDULER_AND_RUN_PIPELINE |
| NFR-013 | Scheduler | Run state must be durable across app restarts: no completed run should be lost, and no interrupted run should remain in running state after restart. | NEW | epic_SCHEDULER_AND_RUN_PIPELINE |
| NFR-014 | Jobs Dashboard | The Jobs view must reflect run status changes in near real-time (within ~1 second) as IPC runs.* events arrive, without manual refresh. | NEW | epic_BACKUP_JOBS_DASHBOARD |
| NFR-015 | Logs View | The Logs view must paginate or virtualize its rendering so that browsing thousands of run rows (and tens of thousands of file records in a drill-down) does not cause UI jank. | NEW | epic_BACKUP_LOGS_VIEW |
| NFR-016 | System Tray | When the main window is hidden/minimized to the tray, scheduled backup runs must continue to fire and complete exactly as if the window were visible. | NEW | epic_SYSTEM_TRAY_INTEGRATION |
