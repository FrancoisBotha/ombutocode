# Epic: App Scaffold

- **Status:** NEW
- **Owner:** human
- **Created:** 2026-04-11
- **Last Updated:** 2026-04-11

## 1. Purpose

Establish the Electron + Vue 3 + Vite project skeleton that every other epic builds on. This epic delivers a runnable desktop application shell with a hardened main/renderer split, a typed IPC bridge, the base sidebar+content layout from the style guide, and a Windows packaging pipeline via electron-builder. No domain logic is delivered here — only the foundation.

## 2. User Story

As a **DropSync developer**, I want **a runnable Electron/Vue 3 shell with secure IPC and a packaged Windows build**, so that **subsequent epics can add Dropbox auth, backup jobs, and UI views on a stable foundation**.

## 3. Scope

**In Scope**
- Electron main process bootstrap with a single `BrowserWindow`
- Vue 3 + Vite renderer, building to `dist/`
- `contextBridge` preload exposing a typed IPC API surface
- Electron security hardening (`contextIsolation: true`, `nodeIntegration: false`, no remote content)
- Sidebar + content layout shell per the style guide (220px sidebar, 24px page padding)
- Navigation entries for "Backup Jobs" and "Backup Logs" (placeholder views)
- electron-builder config producing a Windows installer
- Base CSS tokens (colours, spacing, typography) matching the style guide

**Out of Scope**
- Database integration (epic_DATABASE_FOUNDATION)
- Dropbox auth (epic_DROPBOX_AUTH)
- Any backup job domain logic
- macOS / Linux builds
- System tray behaviour (epic_SYSTEM_TRAY_INTEGRATION)

## 4. Functional Requirements

- **FR-001** — The Electron main process launches and opens a single `BrowserWindow` loading the Vue renderer.
- **FR-002** — The Vue 3 renderer builds via Vite and is served from the local filesystem in production builds.
- **FR-003** — A preload script uses `contextBridge.exposeInMainWorld` to expose a typed IPC API; `nodeIntegration` is disabled in the `BrowserWindow` configuration.
- **FR-004** — The renderer presents a sidebar + content layout shell with navigation entries for "Backup Jobs" and "Backup Logs", routed via Vue Router (hash history).

## 5. Non-Functional Requirements

- **NFR-001** — The renderer process must run with `contextIsolation: true` and must not have direct access to Node.js APIs.
- **NFR-002** — electron-builder must produce a Windows installer (`.exe`) from a single `npm run build` command.

## 6. UI/UX Notes

- Layout matches style guide §3: 220px sidebar (white, 1px right border), content fills remaining width with 24px page padding.
- Sidebar nav items: 12×16 padding, 14px text, hover `#F0F3F7`, active state with 3px `#4A90E2` left accent bar and primary text colour.
- Typography tokens: Inter font stack, body 14px/1.6, H1 24px/700.
- Colour tokens wired as CSS custom properties (`--color-primary: #4A90E2`, etc.) so future views can consume them.
- Placeholder views for Jobs and Logs show an H1 title only.

## 7. Data Model Impact

None. This epic ships no schema, no tables, and no data access.

## 8. Integration Impact

- **Electron**: first introduction of main/renderer processes.
- **Vite**: build tool wired into `npm run dev` and `npm run build`.
- **electron-builder**: added as dev dependency and configured in `package.json` / `electron-builder.yml`.
- No Dropbox, filesystem walker, or SQLite integration in this epic.

## 9. Acceptance Criteria

- [ ] `npm run dev` launches the Electron app with hot-reloading Vue renderer.
- [ ] The BrowserWindow opens with the sidebar + content layout and two nav entries.
- [ ] Clicking "Backup Jobs" and "Backup Logs" navigates between placeholder views via hash routing.
- [ ] `contextIsolation` is enabled and `nodeIntegration` is disabled; renderer cannot `require('fs')`.
- [ ] Preload script exposes a minimal IPC API surface (e.g. `window.dropsync.ping()`) via `contextBridge`.
- [ ] `npm run build` produces a Windows installer via electron-builder.
- [ ] Base CSS custom properties for colours, spacing, and typography are defined and consumed by the layout shell.

## 10. Risks & Unknowns

- **electron-builder native module rebuilds** — not relevant yet (no native modules), but the pipeline must tolerate them once `better-sqlite3` arrives in the next epic.
- **Vue Router hash vs. history mode** — hash mode is safer for file:// loading in Electron; must be confirmed.
- **Electron + Vite templates** drift frequently; pinning versions is important.

## 11. Dependencies

- None. This is the foundation epic.

## 12. References

- **prd:** docs/Product Requirements Document/PRD.md
- **architecture:** docs/Architecture/Architecture.md
- **data_model:** docs/Data Model/Schema.ddl
- **style_guide:** docs/Style Guide/StyleGuide.md
- mockup: docs/Mockups/AppScaffoldClaude.svg

## 13. Implementation Notes

Suggested ticket breakdown (4–5 tickets):

1. Initialize Electron + Vite + Vue 3 project skeleton (`package.json`, `vite.config.js`, directory layout).
2. Configure `BrowserWindow` with security hardening and a preload script exposing a stub IPC API via `contextBridge`.
3. Wire Vue Router (hash mode) with placeholder Jobs and Logs views.
4. Build the sidebar + content layout shell and base CSS tokens from the style guide.
5. Configure electron-builder to produce a Windows installer; add `npm run build` script.

**Complexity:** Low–Medium. Mostly boilerplate; the security hardening and electron-builder config are the fiddly parts.
