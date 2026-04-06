# Feature: ELECTRON_APP_SHELL

Status: TICKETS
Owner: human
Created: 2026-04-04
Last Updated: 2026-04-04

---

## 1. Purpose

Establish the foundational Electron + Vue 3 application shell for ombutoplan by copying and adapting the proven architecture from `.ombutocode/src/`. This feature delivers a bootable desktop app with navigation, settings, IPC plumbing, and database infrastructure — everything needed before domain-specific features (artifact CRUD, git panel, tree view) can be built on top.

Why does it exist?
Every subsequent feature-epic depends on a working Electron app with a main process, renderer process, preload bridge, Pinia stores, router, and build pipeline. Building this from scratch would be slow and error-prone; copying from `.ombutocode/` gives us a battle-tested starting point.

What problem does it solve?
Eliminates the cold-start problem — after this feature, agents and developers can start implementing domain features (artifact editing, tree sidebar, git panel) immediately against a working app shell.

---

## 2. User Story

As a developer working on ombutoplan,
I want a bootable Electron desktop app with sidebar navigation, settings page, status bar, and database infrastructure,
So that I have a working foundation to build all ombutoplan domain features on top of.

---

## 3. Scope

### In Scope
- Electron main process entry point (`main.js`) — adapted from `.ombutocode/src/main.js`
- Preload script (`preload.js`) — secure IPC bridge with channel whitelisting, adapted from `.ombutocode/src/preload.js`
- Vite configuration (`vite.config.js`) — adapted from `.ombutocode/src/vite.config.js`, dev port 5175
- `package.json` — dependencies, scripts, electron-builder config for ombutoplan
- Vue 3 app bootstrap (`renderer/main.js`) — Pinia + Vue Router setup
- Root component (`App.vue`) — sidebar + main content area layout, adapted from `.ombutocode/src/src/renderer/App.vue`
- Sidebar navigation (`BoardList.vue` equivalent) — menu items for ombutoplan views: Dashboard, Tree, Mockups, Git, Validate, Settings
- Settings page (`SettingsView.vue`) — project name, theme, UI preferences, adapted from `.ombutocode/src/src/renderer/components/SettingsView.vue`
- Status bar (`StatusBar.vue`) — adapted from `.ombutocode/src/src/renderer/components/StatusBar.vue`
- Settings store (`settingsStore.js`) — persistent settings via IPC + electron-store, adapted from `.ombutocode/src/src/renderer/stores/settingsStore.js`
- UI store (`uiStore.js`) — sidebar state, active view, theme
- Vue Router (`router/index.js`) — hash-mode routing with placeholder views
- Database infrastructure (`ombutoplanDb.js`) — sql.js unified DB manager, adapted from `.ombutocode/src/src/main/ombutocodeDb.js`
- Core IPC callbacks (`coreCallbacks.js`) — handler registration skeleton for settings, app lifecycle
- Core utilities (`coreUtilities.js`) — path resolution for `docs/`, `.ombutoplan/`, project root
- Project init (`projectInit.js`) — ensure `.ombutoplan/` and `docs/` directory structure exists on first launch
- Logger utilities (`renderer/utils/logger.js`, `renderer/plugins/logger.js`) — copied from `.ombutocode/`
- Global CSS (`assets/main.css`) — base styles, dark/light theme support
- `index.html` — Vue mount point
- `buildandrun.bat` — Windows dev build-and-launch script (adapted from `.ombutocode/buildandrun.bat`)
- Placeholder views — empty components for Dashboard, Tree, Mockups, Git, Validate (just `<h1>` stubs) so navigation works

### Out of Scope
- Artifact CRUD (ArtifactService, artifact store, artifact editor) — separate feature
- Git integration (GitService, git store, git panel) — separate feature
- Tree sidebar with artifact hierarchy (TreeService) — separate feature
- Mockup gallery (MockupService) — separate feature
- Validation engine — separate feature
- CodeMirror editor integration — separate feature
- Agent/scheduler/worktree infrastructure (ombutocode-specific, not needed in ombutoplan)
- Dropbox integration (ombutocode-specific)
- Kanban board / ticket views (ombutocode-specific)

---

## 4. Functional Requirements

1. The app MUST boot as an Electron desktop window showing the ombutoplan shell UI.
2. The sidebar MUST list navigation items: Dashboard, Tree, Mockups, Git, Validate, Settings.
3. Clicking a sidebar item MUST switch the main content area to the corresponding view.
4. The Settings page MUST allow editing: project name, theme (system/light/dark).
5. Settings MUST persist across app restarts via electron-store.
6. The status bar MUST display at the bottom of the window.
7. The preload script MUST whitelist only valid IPC channels and reject all others.
8. The app MUST initialize `.ombutoplan/data/` and `docs/` directories on first launch if they don't exist.
9. The sql.js database infrastructure MUST be loadable (create/open `.ombutoplan/data/ombutoplan.db`).
10. `npm run dev` MUST start the Vite dev server + Electron in development mode.
11. `npm run build` MUST produce a distributable via electron-builder.
12. The sidebar MUST be collapsible (same pattern as .ombutocode's BoardList).

---

## 5. Non-Functional Requirements

- Startup time: app window visible in under 2 seconds on a modern machine.
- Dev mode: Vite HMR must work — changes to Vue components reflect without full reload.
- Security: `nodeIntegration: false`, `contextIsolation: true` in BrowserWindow.
- The app loads only local content — no external URLs in the BrowserWindow.
- Platform: Windows first (portable EXE), macOS and Linux as secondary targets.

---

## 6. UI/UX Notes

- Layout: vertical sidebar on the left (collapsible), main content area on the right, status bar at the bottom. Same spatial layout as `.ombutocode/`.
- Sidebar uses Material Design Icons (mdi) like `.ombutocode/` — `mdi-view-dashboard`, `mdi-file-tree`, `mdi-image-multiple`, `mdi-git`, `mdi-check-decagram`, `mdi-cog`.
- Dark/light theme toggled from Settings, respects system preference by default.
- Placeholder views show centered heading text (e.g., "Dashboard — Coming Soon") so navigation is visually confirmed working.

---

## 7. Data Model Impact

Introduces:
- `.ombutoplan/data/ombutoplan.db` — SQLite database via sql.js (empty schema, tables created by later features)
- `settings` IPC channel backed by electron-store (key-value pairs: `project_name`, `theme`)

No ticket/backlog schema changes (this is a ombutoplan feature, not a ombutocode feature).

---

## 8. Integration Impact

- New IPC contract: `settings:read`, `settings:write`, `app:getPath`, `app:quit`
- New dependency: sql.js, electron-store, vue, vue-router, pinia, js-yaml, marked
- Dev dependencies: vite, @vitejs/plugin-vue, electron-builder, concurrently
- No external API changes.

---

## 9. Acceptance Criteria

Feature is complete when:

- [ ] Running `npm run dev` from `frontend/` boots Electron with the Vue 3 SPA visible
- [ ] Sidebar displays all 6 navigation items (Dashboard, Tree, Mockups, Git, Validate, Settings)
- [ ] Clicking each sidebar item switches the main content area to the corresponding placeholder view
- [ ] Sidebar collapses/expands via toggle button
- [ ] Settings page allows editing project name and theme preference
- [ ] Settings persist after closing and reopening the app
- [ ] Status bar is visible at the bottom of the window
- [ ] `.ombutoplan/data/` directory is created on first launch
- [ ] `.ombutoplan/data/ombutoplan.db` is created (empty, loadable via sql.js)
- [ ] `docs/` directory structure is created if missing (prd/, comp/, fr/, nfr/, epic/, us/, ac/, mockups/)
- [ ] Preload script rejects IPC calls on non-whitelisted channels
- [ ] `nodeIntegration` is `false` and `contextIsolation` is `true`
- [ ] `npm run build` produces a Windows portable EXE via electron-builder
- [ ] Dark/light theme switching works from Settings

---

## 10. Risks & Unknowns

- sql.js WASM binary needs to be correctly bundled by Vite/electron-builder — may need explicit copy configuration.
- electron-store may need schema validation setup to avoid corrupt settings.
- Vite dev server port (5175) must not conflict with .ombutocode's dev server (5174) when both run simultaneously.
- Material Design Icons font/CSS must be included in the build (CDN link or npm package).

---

## 11. Rollback Strategy

This is a greenfield feature — rollback is simply deleting the `frontend/` directory. No migrations, no existing data to corrupt.

---

## 12. Dependencies

- No prior features required — this is the first feature-epic.
- Requires: Node.js, npm, git (on the developer's machine).
- References:
  - `docs/PRD.md` — product requirements
  - `docs/ARCHITECTURE.md` — architecture specification (sections 3-6, 8-10)

---

## 13. Implementation Notes (For Planning Agent)

### Source Files to Copy and Adapt

| Priority | .ombutocode source | ombutoplan target | Adaptation needed |
|---|---|---|---|
| 1 | `src/package.json` | `frontend/package.json` | Strip agent/scheduler/dropbox deps; change name/appId to ombutoplan; keep electron, vue, pinia, sql.js, electron-store, vite |
| 2 | `src/main.js` | `frontend/main.js` | Strip agent/scheduler/worktree/archive/requests imports; keep BrowserWindow setup, electron-store, IPC registration, dev mode detection; change paths to `.ombutoplan/` and `docs/` |
| 3 | `src/preload.js` | `frontend/preload.js` | Replace channel whitelist with ombutoplan channels (settings:*, app:*, artifact:*, git:*, tree:*, mockup:*, watcher:*) |
| 4 | `src/vite.config.js` | `frontend/vite.config.js` | Change port to 5175, keep everything else |
| 5 | `src/src/renderer/main.js` | `frontend/src/renderer/main.js` | Direct copy (Pinia + Router + mount) |
| 6 | `src/src/renderer/App.vue` | `frontend/src/renderer/App.vue` | Replace view list with ombutoplan views (dashboard, tree, mockups, git, validate, settings); strip kanban/agent/close-dialog; keep layout structure and sidebar integration |
| 7 | `src/src/renderer/components/BoardList.vue` | `frontend/src/renderer/components/SidebarNav.vue` | Replace menu items with ombutoplan navigation; keep collapse toggle pattern |
| 8 | `src/src/renderer/components/SettingsView.vue` | `frontend/src/renderer/components/SettingsView.vue` | Keep project name + theme; strip eval agent, refresh interval, notification sound, Dropbox sections |
| 9 | `src/src/renderer/components/StatusBar.vue` | `frontend/src/renderer/components/StatusBar.vue` | Adapt content for ombutoplan (artifact counts instead of ticket counts) |
| 10 | `src/src/renderer/stores/settingsStore.js` | `frontend/src/renderer/stores/settingsStore.js` | Keep loadSettings/saveSettings IPC pattern; change setting keys to project_name, theme |
| 11 | `src/src/renderer/router/index.js` | `frontend/src/renderer/router/index.js` | Hash history, routes for ombutoplan views |
| 12 | `src/src/main/ombutocodeDb.js` | `frontend/src/main/ombutoplanDb.js` | Change DB path to `.ombutoplan/data/ombutoplan.db`; keep load/modify/save pattern |
| 13 | `src/src/main/coreCallbacks.js` | `frontend/src/main/coreCallbacks.js` | Skeleton with settings + app handlers only; other domains added by later features |
| 14 | `src/src/main/coreUtilities.js` | `frontend/src/main/coreUtilities.js` | Path constants for docs/, .ombutoplan/, project root |
| 15 | `src/src/main/projectInit.js` | `frontend/src/main/projectInit.js` | Create .ombutoplan/data/, docs/prd/, docs/comp/, docs/fr/, docs/nfr/, docs/epic/, docs/us/, docs/ac/, docs/mockups/ |
| 16 | `src/src/renderer/utils/logger.js` | `frontend/src/renderer/utils/logger.js` | Direct copy |
| 17 | `src/src/renderer/plugins/logger.js` | `frontend/src/renderer/plugins/logger.js` | Direct copy |
| 18 | `src/src/renderer/assets/main.css` | `frontend/src/renderer/assets/main.css` | Copy and adapt color variables for ombutoplan branding |
| 19 | `src/index.html` | `frontend/src/renderer/index.html` | Change title to "ombutoplan" |
| 20 | `.ombutocode/buildandrun.bat` | `frontend/buildandrun.bat` | Adapt paths |

### Suggested Ticket Breakdown

**Scaffolding files** (shared across tickets): `package.json`, `main.js`, `preload.js`, `coreCallbacks.js` — tickets touching these MUST be chained with `depends_on`.

1. **OMBUTO-001**: Project scaffold — `package.json`, `vite.config.js`, `index.html`, directory structure, `npm install` works
2. **OMBUTO-002**: Electron main process — `main.js`, `preload.js`, `projectInit.js`, `coreUtilities.js`, BrowserWindow boots (depends on OMBUTO-001)
3. **OMBUTO-003**: Vue 3 app shell — `renderer/main.js`, `App.vue`, `router/index.js`, placeholder views, `SidebarNav.vue`, `StatusBar.vue`, `main.css` (depends on OMBUTO-002)
4. **OMBUTO-004**: Settings infrastructure — `settingsStore.js`, `SettingsView.vue`, `coreCallbacks.js` settings handlers, electron-store integration (depends on OMBUTO-003)
5. **OMBUTO-005**: Database infrastructure — `ombutoplanDb.js`, sql.js setup, DB creation on first launch (depends on OMBUTO-002)
6. **OMBUTO-006**: Build pipeline — electron-builder config, `buildandrun.bat`, portable EXE output (depends on OMBUTO-003)
7. **OMBUTO-007**: Theme support — dark/light/system theme switching from settings, CSS variables (depends on OMBUTO-004)

Expected complexity: M (medium) — mostly copying and adapting, but wiring up Electron + Vite + sql.js correctly requires care.
Estimated total effort: 7 tickets, each 1-3 hours.
