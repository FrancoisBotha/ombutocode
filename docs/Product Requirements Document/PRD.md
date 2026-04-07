# PRD: DropSync — Dropbox Backup Utility for Windows

## 1. Executive Summary

Windows users who subscribe to Dropbox for cloud storage lack a simple, dedicated backup tool that leverages their existing storage plan. Instead of paying for a separate cloud backup service, they need a lightweight utility that intelligently backs up selected folders to Dropbox — skipping unchanged files and excluding unwanted directories like `node_modules`. **DropSync** is an Electron-based desktop application that provides rsync-like incremental backups to a designated Dropbox folder, with .gitignore-style exclusion rules, interval-based scheduling, and a system tray presence for hands-off operation.

**Why now:** Most users already pay for Dropbox storage they underutilise. Existing backup tools either require a separate subscription or are enterprise-grade and overly complex. DropSync fills the gap as a focused, free utility for casual Windows users.

## 2. Vision

DropSync is a focused, single-purpose utility. The vision is to be the simplest and most reliable way for a Windows user to back up project and personal folders to Dropbox — nothing more. There are no plans to expand into multi-cloud support, mobile platforms, or advanced features beyond the core backup workflow.

## 3. Objectives

**User objectives**
- Set up a backup job with minimal effort — select a source folder, choose exclusions, set a schedule, and go
- Trust that only changed files are backed up, saving time and bandwidth
- View all configured backup jobs and their run history at a glance

**Project objectives**
- Deliver a polished, functional portfolio project demonstrating Electron, Dropbox API integration, and rsync-like file diffing
- Produce a reliable tool that works correctly across typical Windows file systems and Dropbox plans

## 4. Key Principles

- **Simplicity over features.** Every screen should be self-explanatory to a non-technical user.
- **Reliability over speed.** A backup that completes correctly is more important than a fast one.
- **No surprises.** The user always knows what will be backed up, what will be excluded, and when the next run is scheduled.
- **Respect Dropbox limits.** Operate within the user's existing Dropbox plan — never assume unlimited storage or API quota.
- **Unobtrusive.** Runs quietly in the system tray; only surfaces when the user wants it or something goes wrong.

## 5. Target Users and Personas

### Primary Persona — "The Casual Windows User"
- **Profile:** Any individual Windows user with a Dropbox account (free or paid)
- **Goals:** Back up important folders (documents, projects, photos) without paying for another cloud service
- **Tech comfort:** Low to medium. Comfortable installing desktop apps, not comfortable with command-line tools
- **Context of use:** Sets up backup jobs once, expects them to run automatically in the background

### Anti-Persona
- Enterprise users or IT administrators needing centralised backup management, compliance features, or multi-user administration
- Users requiring real-time continuous sync (Dropbox's own sync client covers this)
- Linux or macOS users

### Top Pain Points
1. Already paying for Dropbox but not using it for structured backups
2. Existing backup services require a separate paid subscription
3. Dropbox sync is all-or-nothing — no way to exclude specific folders or file patterns
4. No visibility into what was backed up and when
5. Manual copy-paste backups to Dropbox are tedious and error-prone

## 6. Key Features

### High Priority
| Feature | Description | User Value | Acceptance Criteria |
|---|---|---|---|
| Dropbox API integration | OAuth-based connection to user's Dropbox account; no Dropbox desktop app required | Works without installing Dropbox app | User can authenticate via OAuth and the app can list, upload, and manage files in their Dropbox |
| Source folder selection | File browser to select one or more local folders to back up | Easy setup | User can browse and select any local folder as a backup source |
| Dropbox target folder | Select or create a destination folder inside Dropbox for backups | Organised backups | User can choose where backups are stored within their Dropbox |
| Incremental change detection | rsync-like logic to detect changed files (size, modified date, checksum) | Only changed files are uploaded, saving time and bandwidth | Unchanged files are skipped; changed, new, and deleted files are detected correctly |
| Exclusion rules | .gitignore-style patterns to exclude files and folders (e.g. `node_modules`, `*.tmp`) | Never waste storage on junk folders | User can define exclusion patterns per job; matched files are never backed up |
| Interval-based scheduling | Configure how often each backup job runs (e.g. every 1 hour, 6 hours, 24 hours) | Set and forget | Backup runs automatically at the configured interval while the app is running |
| Backup Jobs view | Dashboard listing all configured backup jobs with status and next run time | At-a-glance overview | User can see all jobs, their source/target, schedule, and current status |
| Backup Logs view | History of backup runs with results (files backed up, errors, duration) | Confidence that backups are working | User can review past runs and identify any failures |
| System tray operation | App runs in the system tray; minimises to tray on close | Unobtrusive background operation | App stays running in tray, shows status icon, and provides right-click menu |
| Multiple backup jobs | User can configure and run more than one backup job | Back up different folders with different settings | Each job has independent source, target, exclusions, and schedule |

### Medium Priority
| Feature | Description | User Value |
|---|---|---|
| Notifications | System notifications on backup success or failure | Awareness without opening the app |
| Storage usage display | Show how much Dropbox storage is used and available | Avoid exceeding plan limits |
| Manual backup trigger | Run a backup job immediately outside its schedule | Flexibility before important changes |

### Low Priority
| Feature | Description | User Value |
|---|---|---|
| Restore from backup | Browse and restore files from a Dropbox backup | Recovery from accidental deletion |
| Backup job export/import | Export job configurations for sharing or migration | Portability |

## 7. MVP Scope

**Must-have**
- Dropbox OAuth integration (API-based, no desktop app required)
- Source folder browser and selection
- Dropbox target folder selection
- Incremental change detection (rsync-like)
- Exclusion rules (.gitignore-style)
- Interval-based scheduling
- Backup Jobs list view
- Backup Logs view
- System tray operation
- Multiple backup jobs
- Windows desktop build (Electron)

**Deferred**
- Notifications
- Storage usage display
- Manual backup trigger
- Restore from backup
- Job export/import

**Out of scope**
- macOS or Linux support
- Mobile apps
- Multi-cloud support (Google Drive, OneDrive)
- Real-time/continuous sync
- File versioning or point-in-time restore
- Encryption beyond Dropbox's built-in encryption

**Complexity assessment:** Medium. Dropbox API integration and OAuth are well-documented. The rsync-like change detection logic (comparing file metadata and checksums) is the core algorithmic challenge. System tray integration on Windows via Electron is straightforward.

## 8. Technical Approach

**Architecture overview**
- Electron desktop application (Windows)
- Local SQLite database for job configuration, file state tracking, and backup logs
- Dropbox API v2 for all cloud operations (no Dropbox desktop app dependency)

**Key components**
- **Auth Module** — Dropbox OAuth 2.0 PKCE flow for secure token acquisition and refresh
- **File Scanner** — Walks source directories, applies exclusion rules, computes file fingerprints (size + modified time + optional checksum)
- **Diff Engine** — Compares local file state against the last known backup state in SQLite to identify new, changed, and deleted files
- **Upload Manager** — Uploads changed files to Dropbox via API with batching and retry logic
- **Scheduler** — Interval-based timer that triggers backup jobs according to their configured frequency
- **Job Manager** — CRUD operations for backup job configurations
- **Log Store** — Records backup run results (files processed, errors, duration) to SQLite
- **Tray Manager** — System tray icon, context menu, and notification integration

**Data flow**
1. User configures a backup job (source folder, Dropbox target, exclusions, interval)
2. Scheduler triggers the job at the configured interval
3. File Scanner walks the source directory, applying exclusion rules
4. Diff Engine compares scanned files against the stored state from the last backup
5. Upload Manager uploads new and changed files to Dropbox via API
6. File state and backup results are saved to SQLite
7. Logs view displays results

**Integration points**
- Dropbox API v2 (OAuth, files/list_folder, files/upload, files/upload_session, files/delete)
- Windows OS keychain (credential manager) for OAuth token storage
- Electron Tray API for system tray integration

**Security considerations**
- OAuth tokens stored in Windows Credential Manager, not in plaintext
- No user data sent to any server other than Dropbox
- Exclusion rules processed locally before any file is uploaded

**Constraints**
- Windows only
- Requires internet connection for backup operations
- Subject to Dropbox API rate limits and user's storage quota
- Dropbox desktop app is not required

## 9. Success Metrics

**North star**
- **Functional reliability:** Backups complete successfully without data loss or corruption

**Supporting indicators**
- All configured backup jobs run on schedule without manual intervention
- Changed files are correctly detected and uploaded; unchanged files are correctly skipped
- Exclusion rules reliably prevent unwanted files from being backed up
- Backup logs accurately reflect what happened during each run

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Dropbox API rate limiting during large backups | Backup fails or stalls mid-run | Implement batched uploads with exponential backoff; resumable upload sessions |
| User's Dropbox storage quota exceeded mid-backup | Partial backup, user confusion | Check available storage before starting; warn user if backup size may exceed quota |
| Incorrect change detection leads to missed files | Data loss | Use multiple signals (size + modified time); optional checksum verification for critical files |
| OAuth token expires during a long backup run | Backup fails | Implement token refresh; retry with fresh token on 401 errors |
| Large files (>150MB) require upload sessions | Upload complexity | Use Dropbox upload session API for files above the single-upload threshold |
| App crash during backup leaves inconsistent state | Uncertain backup status | Write state transactionally to SQLite; mark incomplete runs in logs |

## 11. Open Questions

- What is the right default backup interval? (e.g. every 6 hours, every 24 hours)
- Should deleted source files be deleted from the Dropbox backup, or preserved?
- What is the maximum practical library size (number of files) the scanner should handle?
- Should the app auto-start with Windows, or is that user-configured?
- What exclusion patterns should be included by default? (e.g. `node_modules`, `.git`, `__pycache__`, `*.tmp`)

## 12. Product Roadmap

**Phase 1 — MVP (Months 1–2)**
- Dropbox OAuth integration
- Source/target folder selection
- Incremental change detection and upload
- Exclusion rules
- Interval-based scheduling
- Backup Jobs and Logs views
- System tray operation
- Windows build

**Phase 2 — Polish (Month 3)**
- Notifications on success/failure
- Storage usage display
- Manual backup trigger
- UX refinements based on testing

**Phase 3 — Extended Features (Month 4+)**
- Restore from backup
- Job export/import
- Performance optimisation for large file sets

**Dependencies**
- Phase 1 depends on Dropbox API access and OAuth app approval
- All phases target Windows only
