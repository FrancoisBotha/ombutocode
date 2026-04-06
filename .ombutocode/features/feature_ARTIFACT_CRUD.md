# Feature: ARTIFACT_CRUD

Status: TICKETS
Owner: human
Created: 2026-04-04
Last Updated: 2026-04-04

---

## 1. Purpose

Implement the core domain functionality of ombutoplan: creating, reading, updating, and archiving requirement artifacts (PRDs, Components, FRs, NFRs, Epics, User Stories, Acceptance Criteria) stored as Markdown files with YAML frontmatter in `docs/`.

This is the foundational domain feature. Every subsequent feature (tree sidebar, git panel, dashboard, validation, mockup gallery) depends on the artifact service layer and UI being in place.

Why does it exist?
Without artifact CRUD, ombutoplan is an empty shell. This feature turns it into a working requirements management tool where a developer can create, browse, edit, and organize requirement documents.

What problem does it solve?
Gives the developer a structured way to author and maintain requirement artifacts with proper IDs, hierarchy, statuses, and frontmatter metadata — all persisted as Markdown files in their git repo.

---

## 2. User Story

As a solo developer,
I want to create, browse, edit, and archive requirement artifacts in a desktop UI,
So that I can maintain structured, traceable requirements alongside my code.

---

## 3. Scope

### In Scope
- **Backend — Database layer**: `artifactDb.js` — SQLite schema for artifacts table, counters table; CRUD operations on the metadata index
- **Backend — Service layer**: `artifactService.js` — file I/O with gray-matter, Markdown file writes, YAML frontmatter generation, sequential ID assignment, archive (soft delete), rebuildIndex from filesystem
- **Backend — IPC handlers**: artifact:* channels registered in `coreCallbacks.js` — list, get, create, update, archive, nextId, rebuildIndex
- **Backend — File watcher**: chokidar watching `docs/` for external changes, IPC push to renderer on file add/change/delete
- **Frontend — State**: `artifactStore.js` — Pinia store with IPC-driven actions for all artifact operations
- **Frontend — List view**: Flat, filterable, sortable table of all artifacts (ID, Title, Type, Status, Parent, Updated). Clicking a row navigates to the artifact detail view. Replaces the DashboardView placeholder from OMBUTO-003.
- **Frontend — Detail view (read mode)**: Metadata header (ID, title, status badge, parent breadcrumb, tags, dates), rendered Markdown body via marked, children section listing direct children as clickable cards
- **Frontend — Detail view (edit mode)**: Split-pane editor — CodeMirror 6 on the left, live Markdown preview on the right. Frontmatter fields edited via form controls (dropdowns for status/type/parent, tag input). Save writes file to disk.
- **Frontend — Create dialog**: Type picker dropdown, auto-assigned sequential ID (readonly), parent dropdown filtered by valid hierarchy rules, title field, opens editor with type-specific Markdown template
- **Frontend — Router**: Add `/artifact/:id` route for detail view

### Out of Scope
- Tree sidebar (separate feature — will consume artifactStore)
- Git operations (separate feature — save and commit are decoupled per PRD §6.3)
- Mockup gallery and inline mockup rendering (separate feature)
- Dashboard summary cards and coverage gaps (separate feature — will consume artifactStore)
- Validation engine (separate feature)
- Cross-reference link parsing (future, per PRD §10)
- Bulk operations on artifacts

---

## 4. Functional Requirements

### 4.1 Artifact File Format (from PRD §4.5)
1. Each artifact is a Markdown file with YAML frontmatter containing: id, title, type, status, parent, created, updated, tags.
2. Frontmatter is parsed/written using gray-matter.
3. The body below the frontmatter is free-form Markdown.
4. Files are stored in `docs/<type>/` subdirectories: `docs/prd/PRD-001.md`, `docs/us/US-048.md`, etc.

### 4.2 Artifact Types and Hierarchy (from PRD §4.1, §4.3)
5. Seven artifact types: prd, comp, fr, nfr, epic, us, ac.
6. Hierarchy rules enforced on create/update:
   - FR, NFR, COMP → parent must be PRD
   - EPIC → parent must be COMP
   - US → parent must be EPIC
   - AC → parent must be US
   - PRD → no parent (root)
7. The create dialog MUST filter the parent dropdown to show only valid parent types.

### 4.3 ID Generation (from PRD §4.2)
8. IDs are sequential per type: PRD-001, COMP-002, US-048, etc.
9. Counters are stored in the SQLite `counters` table.
10. IDs are never reused, even after archive.
11. `nextId(type)` reads and increments the counter atomically.

### 4.4 Statuses (from PRD §4.6)
12. Five statuses: draft, active, implemented, deferred, deprecated.
13. Status transitions are not enforced — the developer changes freely.

### 4.5 CRUD Operations
14. **Create**: assign next ID, write Markdown file with frontmatter + template body, update DB index, return artifact.
15. **Read (list)**: query DB index with optional type/status/search filters, return array.
16. **Read (single)**: parse the Markdown file from disk (gray-matter), return frontmatter + rendered body.
17. **Update**: merge frontmatter changes and body changes, write the file, update DB index.
18. **Archive**: move the file to `docs/.archive/<type>/`, remove from DB index. Warn if artifact has children.

### 4.6 Rebuild Index
19. `rebuildIndex()` scans all `docs/<type>/` directories, parses every `.md` file, and repopulates the artifacts and counters tables.
20. Called automatically on first launch when the DB is empty but `docs/` has files.

### 4.7 File Watcher
21. chokidar watches `docs/` for add/change/unlink events.
22. On change, the affected artifact is re-parsed and the DB index is updated.
23. An IPC event `watcher:fileChanged` is pushed to the renderer.
24. The renderer refreshes the artifact store on receiving the event.

### 4.8 UI — List View (from PRD §6.2)
25. Flat table with columns: ID, Title, Type, Status, Parent, Updated.
26. Filterable by type (dropdown), status (dropdown), and free-text search.
27. Sortable by clicking column headers.
28. Clicking a row navigates to `/artifact/:id`.

### 4.9 UI — Detail View Read Mode (from PRD §6.3)
29. Metadata header: ID (readonly), title, status badge (color-coded), parent as clickable breadcrumb link, tags, created/updated dates.
30. Rendered Markdown body below the header (via marked + highlight.js).
31. "Children" section below the body listing direct children as clickable cards showing ID, title, status dot.
32. "Edit" button toggles to edit mode.

### 4.10 UI — Detail View Edit Mode (from PRD §6.3)
33. Frontmatter fields as form controls: title (text input), status (dropdown), parent (dropdown filtered by hierarchy), tags (tag input), priority (dropdown, optional).
34. Body as split-pane: CodeMirror 6 editor on left, live Markdown preview (marked) on right.
35. "Save" writes the file to disk (does NOT auto-commit — per PRD §6.3).
36. "Cancel" reverts to read mode without saving.

### 4.11 UI — Create Dialog (from PRD §6.4)
37. Triggered by a "+ New Artifact" button (in sidebar or list view toolbar).
38. Step 1: Select artifact type from dropdown.
39. Step 2: Next ID auto-assigned and displayed readonly.
40. Step 3: Parent dropdown filtered to valid parent types. For EPICs, grouped by Component.
41. Step 4: Title field.
42. Step 5: Opens editor with type-specific Markdown body template.

---

## 5. Non-Functional Requirements

- File writes must be near-instant (local disk I/O).
- List view should load in under 1 second for up to 500 artifacts.
- gray-matter parsing of all files for rebuildIndex should complete in under 3 seconds for 500 files.
- CodeMirror editor should feel responsive with no visible lag on keystroke.
- File watcher must not cause excessive re-renders — debounce events by 300ms.

---

## 6. UI/UX Notes

- List view: use tabulator-tables (already a .ombutocode dependency) or a simple Vue table component. Filterable dropdowns above the table.
- Detail view read mode: clean layout with metadata in a horizontal bar at the top, body below. Status badge uses colored pills (draft=gray, active=green, implemented=blue, deferred=yellow, deprecated=red).
- Detail view edit mode: split-pane with draggable divider. CodeMirror uses a Markdown language mode. Preview updates on debounced input (200ms).
- Create dialog: modal overlay. Type dropdown icons match sidebar (mdi-file-document for PRD, mdi-puzzle for COMP, mdi-format-list-checks for FR, etc.).
- Parent dropdown in create/edit: shows "TYPE-ID: Title" format, e.g., "COMP-002: Execution Engine". For EPICs, entries are grouped under their Component.
- Breadcrumb navigation: `PRD-001 > COMP-002 > EPIC-003 > US-017` — each segment is a clickable link.

---

## 7. Data Model Impact

Introduces to `.ombutoplan/data/ombutoplan.db`:
- `artifacts` table (id, type, title, status, parent_id, file_path, data JSON, last_modified)
- `counters` table (type, next_val)
- Indexes on type, status, parent_id

New IPC channels:
- `artifact:list`, `artifact:get`, `artifact:create`, `artifact:update`, `artifact:archive`
- `artifact:nextId`, `artifact:rebuildIndex`
- `watcher:fileChanged` (push from main to renderer)

---

## 8. Integration Impact

- New dependencies needed in frontend/package.json: codemirror (CodeMirror 6 packages), @codemirror/lang-markdown
- gray-matter and marked already listed in OMBUTO-001 package.json
- coreCallbacks.js gains artifact:* handler registrations
- main.js gains artifactService initialization and chokidar watcher startup/shutdown
- preload.js artifact:* channels were already whitelisted as placeholders in OMBUTO-002
- Router gains `/artifact/:id` route

---

## 9. Acceptance Criteria

Feature is complete when:

- [ ] Artifacts can be created via the UI for all 7 types (PRD, COMP, FR, NFR, EPIC, US, AC)
- [ ] Created artifacts appear as Markdown files in the correct `docs/<type>/` subdirectory with valid YAML frontmatter
- [ ] Sequential IDs are assigned correctly and never reused
- [ ] Hierarchy rules are enforced — invalid parent selections are not offered
- [ ] Artifacts can be viewed in read mode with rendered Markdown body and metadata header
- [ ] Breadcrumb navigation works (clicking parent links navigates to the parent artifact)
- [ ] Children section shows direct children with clickable links
- [ ] Artifacts can be edited via split-pane editor (CodeMirror + live preview)
- [ ] Saving an edit writes the file to disk and updates the DB index
- [ ] Artifacts can be archived (moved to docs/.archive/, removed from list)
- [ ] Archive warns if artifact has children
- [ ] List view shows all artifacts with type/status/search filtering and column sorting
- [ ] Clicking a list row navigates to the artifact detail view
- [ ] File watcher detects external changes to docs/ and refreshes the UI
- [ ] rebuildIndex correctly populates the DB from existing Markdown files on first launch
- [ ] Status badges are color-coded per status value

---

## 10. Risks & Unknowns

- CodeMirror 6 has a modular package structure — need to identify the correct set of packages (@codemirror/state, @codemirror/view, @codemirror/lang-markdown, @codemirror/theme-one-dark, etc.) and ensure they bundle correctly with Vite.
- gray-matter YAML parsing may need error handling for malformed frontmatter in hand-edited files.
- chokidar on Windows can emit duplicate events — debouncing is essential.
- Split-pane resizing needs a lightweight implementation — consider a CSS-only approach or a small library.
- The parent dropdown for EPICs needs grouping by Component — Vue select component may need custom rendering.

---

## 11. Rollback Strategy

- Backend changes (artifactDb.js, artifactService.js) are additive — they add new DB tables and a new service.
- Frontend changes add new views and a store. Rolling back means removing these files and reverting router/coreCallbacks changes.
- No migrations on existing data — the artifacts table is new.

---

## 12. Dependencies

- **Requires feature**: ELECTRON_APP_SHELL (OMBUTO-001 through OMBUTO-007) — app shell, settings, database infrastructure must be in place.
- **Specifically depends on**:
  - OMBUTO-005 (sql.js database infrastructure) — for artifactDb.js
  - OMBUTO-004 (settings + coreCallbacks.js) — for registering IPC handlers
  - OMBUTO-003 (Vue app shell + router) — for adding views and routes
- References:
  - `docs/PRD.md` §4.1–4.6 (artifact types, hierarchy, file format, statuses)
  - `docs/PRD.md` §6.2–6.4 (browsing, editing, creation UI)
  - `docs/ARCHITECTURE.md` §5.1–5.2 (DB schema, service layer)

---

## 13. Implementation Notes (For Planning Agent)

### Scaffolding Files (shared across tickets — chain with depends_on)

- `frontend/src/main/coreCallbacks.js` — OMBUTO-010 adds artifact:* handlers
- `frontend/main.js` — OMBUTO-010 registers service, OMBUTO-016 adds file watcher (chain OMBUTO-016 after OMBUTO-010)
- `frontend/src/renderer/router/index.js` — OMBUTO-013 adds /artifact/:id route
- `frontend/package.json` — OMBUTO-014 may add CodeMirror dependencies

### Suggested Ticket Breakdown

1. **OMBUTO-008**: artifactDb.js — DB schema (artifacts, counters tables), index CRUD, counter operations. Integrate schema init with ombutoplanDb.js open().
   - Depends on: OMBUTO-005
   - Touches: ombutoplanDb.js (add artifactDb.open(db) call)

2. **OMBUTO-009**: artifactService.js — file I/O with gray-matter, create/read/update/archive on Markdown files, nextId from counters, rebuildIndex, type-specific Markdown templates.
   - Depends on: OMBUTO-008

3. **OMBUTO-010**: Artifact IPC handlers + main.js wiring — register artifact:list, artifact:get, artifact:create, artifact:update, artifact:archive, artifact:nextId, artifact:rebuildIndex in coreCallbacks.js. Initialize artifactService in main.js on app ready. Call rebuildIndex on first launch.
   - Depends on: OMBUTO-009, OMBUTO-004
   - Touches: coreCallbacks.js, main.js

4. **OMBUTO-011**: artifactStore.js — Pinia store with actions: fetchAll, fetchOne, create, update, archive. Reactive state: artifactList, currentArtifact, filters (type, status, search). Computed: filteredList.
   - Depends on: OMBUTO-010

5. **OMBUTO-012**: Artifact list view — Vue component replacing DashboardView placeholder. Flat table with columns (ID, Title, Type, Status, Parent, Updated). Type/status dropdown filters, search input. Column sorting. Row click navigates to /artifact/:id.
   - Depends on: OMBUTO-011

6. **OMBUTO-013**: ArtifactDetailView read mode — new view component at route /artifact/:id. Metadata header bar (ID, title, status badge, parent breadcrumb, tags, dates). Rendered Markdown body (marked + highlight.js). Children section with clickable cards. Edit button.
   - Depends on: OMBUTO-011
   - Touches: router/index.js (add route)

7. **OMBUTO-014**: ArtifactDetailView edit mode — extend detail view with edit toggle. Split-pane: CodeMirror 6 editor (left) + live Markdown preview (right). Frontmatter form controls above editor (title, status dropdown, parent dropdown, tags). Save/Cancel buttons. Add CodeMirror packages to package.json.
   - Depends on: OMBUTO-013
   - Touches: package.json (add @codemirror/* deps)

8. **OMBUTO-015**: Artifact create dialog — modal triggered by "+ New Artifact" button. Type picker, auto-ID display, parent dropdown (filtered by hierarchy, grouped by Component for EPICs), title field. On confirm: calls artifactStore.create(), navigates to new artifact in edit mode.
   - Depends on: OMBUTO-011, OMBUTO-014

9. **OMBUTO-016**: File watcher for docs/ — chokidar watches docs/ for add/change/unlink. Debounce 300ms. On event: re-parse affected file, update DB index, push watcher:fileChanged IPC to renderer. Renderer listens and refreshes artifactStore. Start watcher in main.js on app ready, stop on quit.
   - Depends on: OMBUTO-010
   - Touches: main.js (add watcher start/stop)

Expected complexity: L (large) — 9 tickets, mix of backend service layer and frontend UI with CodeMirror integration.
Estimated total effort: 9 tickets, each 2-4 hours.
