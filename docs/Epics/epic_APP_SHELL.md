# Epic: APP_SHELL

Status: NEW

## Overview

Establish the DropSync Electron desktop application shell: a Vue 3 + Vite
renderer, a Node.js main process, a hardened `contextBridge` preload, and a
minimal IPC surface that every other epic builds on. This epic delivers a
runnable empty-shell app that launches on Windows, shows a window, and can
exchange typed commands between renderer and main — nothing more. No domain
logic, no persistence, no Dropbox.

This is pure foundation: without it no other epic can be built or tested.

## Scope

### In Scope
- Electron app bootstrap (`main.js`, `BrowserWindow` creation, window lifecycle)
- Vue 3 + Vite renderer project structure, build pipeline, dev server
- `preload.js` exposing a minimal, typed API via `contextBridge.exposeInMainWorld`
- IPC channel conventions (renderer → main commands, main → renderer events)
- Electron security hardening: `contextIsolation: true`, `nodeIntegration: false`,
  no remote content loading
- Base application routing shell (Jobs view, Logs view placeholders)
- Development scripts (`npm run dev`, `npm run build`)
- Minimal UI styling baseline (plain CSS or Tailwind, decision scoped here)

### Out of Scope
- Any Dropbox integration (DROPBOX_AUTH)
- Any database (DATABASE_FOUNDATION)
- Any backup pipeline components
- System tray behavior (SYSTEM_TRAY_AND_WINDOW_LIFECYCLE)
- Installer packaging (PACKAGING_AND_DISTRIBUTION)

## Functional Requirements

1. The application launches on Windows and displays a single `BrowserWindow`.
2. The renderer is a Vue 3 SPA served in development by Vite with HMR.
3. The main process exposes a typed IPC API to the renderer exclusively via
   `contextBridge`; `window.require` and direct Node.js access from the renderer
   are unavailable.
4. A demonstration IPC round-trip (e.g. `app:getVersion`) succeeds from renderer
   to main and back.
5. Navigation between placeholder Jobs and Logs routes works in the renderer.
6. The production renderer build is consumed by the main process when not in
   development mode.

## Acceptance Criteria

- [ ] `npm run dev` launches Electron with the Vite dev server and HMR works
- [ ] `npm run build` produces a production renderer bundle consumed by main
- [ ] A `BrowserWindow` opens with `contextIsolation: true`,
      `nodeIntegration: false`, and loads only local content
- [ ] The renderer can call a demonstration IPC method and receive a response
- [ ] Attempting `window.require('fs')` in the renderer fails
- [ ] Placeholder routes for Jobs and Logs are reachable via in-app navigation
- [ ] Project structure and scripts are documented in a short developer README

## Dependencies

- None. This epic is the foundation for all others.

## Tickets

_To be created during planning mode._
