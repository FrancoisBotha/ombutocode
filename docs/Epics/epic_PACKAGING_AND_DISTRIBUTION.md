# Epic: PACKAGING_AND_DISTRIBUTION

Status: NEW

## Overview

Ship DropSync as an installable Windows application. This epic wires up
`electron-builder`, produces a working `.exe` (and optional `.msi`) installer,
handles the `better-sqlite3` native module rebuild against the target Electron
Node ABI, and adds the "start with Windows" setting. It is the final epic:
its exit criterion is a user double-clicking an installer on a clean Windows
machine and running a successful backup.

## Scope

### In Scope
- `electron-builder` configuration producing an NSIS `.exe` installer for
  Windows x64
- App icons (tray, window, installer, shortcut) in the required sizes
- Native module rebuild via `electron-rebuild` in the postinstall step so
  `better-sqlite3` binds to the correct Electron Node ABI
- Product metadata (name, publisher, version, copyright) sourced from
  `package.json`
- Installer UX: install directory, Start Menu shortcut, desktop shortcut
  (optional), uninstall entry
- Auto-start-on-login toggle, persisted in `app_settings` and wired to the
  Windows `app.setLoginItemSettings` API
- Smoke test: install the produced artifact on a clean-ish Windows environment,
  launch, connect to Dropbox, run a small backup job end-to-end, verify files
  in Dropbox
- Documentation of the release/build commands

### Out of Scope
- macOS or Linux installers (explicit non-goal per PRD §7 and Architecture §2)
- Code signing certificate acquisition (document the hook for it; actual
  signing is out-of-scope for the portfolio MVP)
- Auto-update infrastructure
- App store distribution
- Telemetry or crash reporting

## Functional Requirements

1. `npm run dist` (or equivalent) produces a Windows `.exe` installer in a
   predictable output directory.
2. Installing the artifact on a Windows machine results in a working app
   with Start Menu and desktop shortcuts.
3. The installed app launches, opens its database at
   `%APPDATA%/dropsync/dropsync.db`, and the native `better-sqlite3` module
   loads without rebuild errors.
4. The user can toggle "Start DropSync when Windows starts" in the settings;
   the setting persists and takes effect on next login.
5. Uninstalling via Windows Add/Remove Programs removes the app binaries;
   user data in `%APPDATA%/dropsync` is preserved (documented behavior).
6. Build commands and release process are documented in a short README
   section.

## Acceptance Criteria

- [ ] `electron-builder` produces a signed-or-unsigned `.exe` installer
- [ ] Installer places app files, Start Menu shortcut, and uninstall entry
- [ ] Installed app launches and opens its database on first run
- [ ] `better-sqlite3` loads without ABI errors in the packaged build
- [ ] Auto-start-on-login toggle persists and is respected by Windows
- [ ] End-to-end smoke test passes: install → auth → create job → run → verify
      files in Dropbox
- [ ] Uninstall removes binaries and leaves user data intact
- [ ] Build/release steps are documented

## Dependencies

- APP_SHELL
- DATABASE_FOUNDATION
- DROPBOX_AUTH
- BACKUP_JOB_MANAGEMENT
- FILE_SCANNER_AND_DIFF
- UPLOAD_MANAGER
- SCHEDULER_AND_RUN_PIPELINE
- BACKUP_LOGS_VIEW
- SYSTEM_TRAY_AND_WINDOW_LIFECYCLE

## Tickets

_To be created during planning mode._
