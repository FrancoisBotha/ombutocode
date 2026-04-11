# Epic: System Tray Integration

- **Status:** NEW
- **Owner:** human
- **Created:** 2026-04-11
- **Last Updated:** 2026-04-11

## 1. Purpose

Deliver DropSync's unobtrusive background presence: a Windows system tray icon that reflects the app's current state (idle / running / error), a right-click menu exposing Open / Run Now / Quit, minimize-to-tray behaviour when the main window is closed, and a single-instance lock so users can't spawn multiple copies. This epic is what makes DropSync "set and forget".

## 2. User Story

As a **DropSync user**, I want **the app to live quietly in my system tray and keep running backups even when I close the window**, so that **my backups happen reliably in the background without cluttering my taskbar**.

## 3. Scope

**In Scope**
- Tray icon created on app launch via Electron `Tray` API
- Three icon states: idle (default), running (active backup in progress), error (last run failed) — driven by IPC events from the scheduler
- Right-click context menu: "Open DropSync", "Run Now" (submenu listing enabled jobs), "Quit DropSync"
- Left-click / double-click: toggle main window visibility
- Closing the main window hides it rather than quitting the app
- Explicit Quit path (menu item + `app.quit()` handler) that performs a graceful shutdown
- Single-instance lock via `app.requestSingleInstanceLock()` — second launch focuses the existing window
- Icon assets for idle/running/error states (small PNG/ICO suitable for Windows tray)

**Out of Scope**
- System notifications on success/failure (deferred per PRD medium-priority)
- Auto-start with Windows (deferred, open question in Architecture §8)
- macOS menu-bar variant

## 4. Functional Requirements

- **FR-049** — On launch the app installs a system tray icon using the Electron `Tray` API.
- **FR-050** — The tray icon changes state between idle, running, and error, driven by the scheduler's run lifecycle events.
- **FR-051** — The tray icon's right-click context menu exposes: Open DropSync, Run Now (per-job submenu), and Quit DropSync.
- **FR-052** — Closing the main window hides it to the tray instead of quitting the application; the scheduler continues to run.
- **FR-053** — A single-instance lock prevents a second copy of DropSync from launching; attempting to launch a second copy focuses the existing window.

## 5. Non-Functional Requirements

- **NFR-016** — When the main window is hidden/minimized to the tray, scheduled backup runs must continue to fire and complete exactly as if the window were visible.

## 6. UI/UX Notes

- **Tray icons**: three 16×16 (and 32×32 for high-DPI) PNG/ICO assets.
  - Idle: neutral DropSync mark
  - Running: subtle colour variant or overlay indicating activity (e.g. primary blue dot)
  - Error: red-tinted variant
- **Context menu**: native Windows look (Electron default); labels plain English; destructive "Quit DropSync" separated by a divider.
- **Run Now submenu**: populated dynamically from `backup_job` rows where `enabled = TRUE`. Empty if none.
- **Close-to-tray**: first time this happens, consider a one-time toast or balloon tip explaining "DropSync is still running in the system tray" — a nice-to-have.
- **Quit flow**: Quit performs a graceful shutdown: if a backup is running, marks it `cancelled` transactionally, then exits.

## 7. Data Model Impact

- No schema changes.
- Reads `backup_job` (enabled rows) to populate the Run Now submenu.
- Writes `backup_run.status = 'cancelled'` during graceful quit if a run is in flight.

## 8. Integration Impact

- **Electron `Tray`, `Menu`, `nativeImage`** APIs
- **Electron `app.requestSingleInstanceLock()` / `second-instance` event**
- **Electron `before-quit`** hook for graceful shutdown
- **IPC** — subscribes to the `runs.*` events from epic_SCHEDULER_AND_RUN_PIPELINE to drive icon state
- **IPC** — invokes `runs.runNow(jobId)` from the submenu

## 9. Acceptance Criteria

- [ ] Launching DropSync installs a tray icon in the Windows notification area.
- [ ] The tray icon changes to the "running" variant when a backup run starts and back to "idle" when it finishes successfully.
- [ ] A failed run leaves the tray icon in the "error" variant until the next successful run.
- [ ] Right-clicking the tray icon opens the context menu with Open, Run Now, and Quit entries.
- [ ] Run Now submenu lists all enabled jobs and invoking an entry triggers a manual run.
- [ ] Clicking "Open DropSync" (or double-clicking the tray icon) restores and focuses the main window.
- [ ] Closing the main window hides it; the app and scheduler continue to run.
- [ ] "Quit DropSync" fully exits the app; an in-flight run is marked `cancelled` transactionally first.
- [ ] Attempting to launch a second copy focuses the existing window instead of spawning another instance.
- [ ] Scheduled runs continue to fire while the window is hidden.

## 10. Risks & Unknowns

- **Graceful quit timing** — cancelling an in-flight upload may take a moment; the `before-quit` handler should bound the shutdown time (e.g. 3 seconds) to avoid hanging the OS logout.
- **Tray icon state drift** — if the app misses a `runFinished` event, the tray could be stuck in "running". A periodic reconciliation tick reading `backup_run` status is a safe fallback.
- **Icon DPI** — Windows high-DPI displays need both 16px and 32px variants.
- **First-time close-to-tray UX** — users may panic when the window "disappears". Document or toast on first close.

## 11. Dependencies

- **epic_APP_SCAFFOLD** — main process and window management
- **epic_BACKUP_JOB_MANAGEMENT** — to populate the Run Now submenu
- **epic_SCHEDULER_AND_RUN_PIPELINE** — provides `runs.*` events and `runNow` command

## 12. References

- **prd:** docs/Product Requirements Document/PRD.md
- **architecture:** docs/Architecture/Architecture.md
- **data_model:** docs/Data Model/Schema.ddl
- **style_guide:** docs/Style Guide/StyleGuide.md

## 13. Implementation Notes

Suggested ticket breakdown (4–5 tickets):

1. Tray icon bootstrap with idle icon and a stub context menu; wire Open/Quit.
2. Icon-state machine driven by `runs.*` IPC events; add running/error icon assets.
3. Run Now submenu populated dynamically from enabled jobs.
4. Minimize-to-tray on window close + single-instance lock and `second-instance` focus handler.
5. Graceful `before-quit` shutdown that cancels any in-flight run transactionally.

**Complexity:** Medium. Electron tray APIs are straightforward; the edge cases are graceful shutdown and icon-state reconciliation.
