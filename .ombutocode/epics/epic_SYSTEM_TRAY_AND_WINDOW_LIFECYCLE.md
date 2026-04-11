# Epic: SYSTEM_TRAY_AND_WINDOW_LIFECYCLE

Status: NEW

## Overview

Make DropSync feel like a background utility. This epic adds a Windows system
tray presence, a minimize-to-tray window lifecycle, and a tray context menu
that lets the user show the window, see current status, and quit the app.
It delivers the "unobtrusive" principle from PRD §4 and the Tray Manager
component from Architecture §3.

This epic does not add new domain behavior; it changes where and how the
existing app surfaces itself.

## Scope

### In Scope
- Tray icon using the Electron Tray API with a branded icon
- Tray context menu with at minimum: **Open DropSync**, **Status** (read-only
  status line, e.g. "Idle" / "Running backup: <job>" / "Error"), **Quit**
- Close-window behavior changed to hide the `BrowserWindow` and keep the
  process alive in the tray
- Explicit quit path (from menu or `app.quit()`) that actually terminates
  the process and closes the database cleanly
- Tray icon state reflecting idle / running / error states, updated via
  events from the run pipeline
- Show/hide window on tray icon click (single-click on Windows)
- First-time close hint letting the user know the app is still running in
  the tray
- Window state persistence (size, position) in `app_settings`

### Out of Scope
- Auto-start with Windows (owned by PACKAGING_AND_DISTRIBUTION)
- Notifications on success/failure (MVP-deferred)
- Manual "Run Now" action from the tray menu (MVP-deferred)

## Functional Requirements

1. A tray icon is present while the app is running.
2. Closing the main window hides it to the tray and leaves the process alive.
3. The first time the user closes the window, a one-time hint explains the
   behavior.
4. The tray context menu lets the user open the main window, see current
   status, and quit.
5. Choosing Quit fully terminates the process and closes the database.
6. The tray icon visibly differentiates idle, running, and error states.
7. Window size and position are restored on next launch.

## Acceptance Criteria

- [ ] Tray icon appears on app launch and disappears on explicit quit
- [ ] Closing the window hides it and the process keeps running
- [ ] Opening via tray click or menu restores the window to its previous
      size and position
- [ ] Quit from the tray menu terminates the process and closes the database
      without corruption
- [ ] Tray icon changes state when a run starts, completes, or errors
- [ ] First close shows the one-time "still running in tray" hint
- [ ] Window state persists across launches via `app_settings`

## Dependencies

- APP_SHELL
- DATABASE_FOUNDATION (for window state persistence in `app_settings`)
- SCHEDULER_AND_RUN_PIPELINE (for running/idle/error status events)

## Tickets

_To be created during planning mode._
