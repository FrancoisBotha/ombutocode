# Feature: FILESYSTEM_TREE

Status: TICKETS
Owner: human
Created: 2026-04-05
Last Updated: 2026-04-05

---

## 1. Purpose

Replace the current frontmatter-hierarchy tree sidebar with a **filesystem-based tree** that mirrors the actual folder and file structure of `docs/`. Clicking a Markdown file shows it in a preview pane (rendered Markdown). An edit button opens a Markdown editor with save functionality.

This is simpler, more intuitive, and works for any Markdown file — not just artifacts with specific frontmatter. The developer organizes their docs however they want (e.g., `docs/prd/PRD.md`, `docs/architecture/ARCHITECTURE.md`) and the tree reflects that structure directly.

Why does it exist?
The frontmatter-hierarchy tree only works for artifacts with valid `parent` fields. A filesystem tree works for all files, is immediately understandable, and mirrors what the developer sees in their file explorer.

---

## 2. User Story

As a developer,
I want the sidebar to show the folder/file structure of `docs/` and click any Markdown file to preview or edit it,
So that I can browse and manage my requirements documents naturally without worrying about frontmatter hierarchy.

---

## 3. Scope

### In Scope
- **Backend — FileTreeService**: `fileTreeService.js` — scan `docs/` recursively, return folder/file tree structure. Read file contents. Write file contents.
- **Backend — IPC handlers**: `filetree:scan`, `filetree:readFile`, `filetree:writeFile`
- **Frontend — TreeSidebar rewrite**: replace current artifact-hierarchy tree with filesystem tree. Show folders (expandable) and `.md` files. Folders sorted first, then files, alphabetically.
- **Frontend — Markdown preview**: clicking a `.md` file shows rendered Markdown in the main content area (using marked + highlight.js)
- **Frontend — Markdown editor**: edit button switches to a CodeMirror editor with live preview split-pane. Save writes back to disk.
- **Frontend — File watcher integration**: tree refreshes when files are added/changed/removed externally

### Out of Scope
- Creating new files/folders from the UI (future enhancement)
- Deleting/renaming files from the UI (future enhancement)
- Non-Markdown file preview (images, etc.)
- Git operations (handled by separate GIT_PANEL feature)

---

## 4. Functional Requirements

### 4.1 FileTreeService
1. `scan()` — recursively scan `docs/`, return tree: `{ name, path, type: 'folder'|'file', children? }`. Exclude `.archive/` directory. Only include `.md` files (ignore other file types). Sort folders first, then files, alphabetically.
2. `readFile(relativePath)` — read a `.md` file from `docs/`, return raw Markdown content.
3. `writeFile(relativePath, content)` — write content to a `.md` file in `docs/`. Validate path is under `docs/`.

### 4.2 Tree Sidebar
4. Display folder/file tree of `docs/`. Folders show folder icon and are expandable/collapsible. Files show file icon.
5. Clicking a folder expands/collapses it.
6. Clicking a `.md` file navigates to a preview route showing the rendered Markdown.
7. Currently selected file is highlighted in the tree.
8. Tree refreshes when the file watcher detects changes in `docs/`.
9. Empty folders are shown (so the developer knows the structure exists).

### 4.3 Markdown Preview
10. When a file is selected, the main content area shows the rendered Markdown (HTML via marked).
11. Title bar above the preview shows the file name and relative path.
12. An "Edit" button in the title bar switches to edit mode.

### 4.4 Markdown Editor
13. Edit mode shows a split-pane: CodeMirror editor on the left, live Markdown preview on the right.
14. Preview updates on debounced input (200ms).
15. "Save" button writes the content back to disk via `filetree:writeFile`.
16. "Cancel" button reverts to preview mode without saving.
17. After save, the preview updates with the new content.

---

## 5. Non-Functional Requirements

- `scan()` should complete in under 200ms for a typical docs/ directory (< 100 files).
- File read/write should be near-instant (local disk).
- Tree should render smoothly with up to 200 nodes.

---

## 6. UI/UX Notes

- Folder icon: `mdi-folder` (closed) / `mdi-folder-open` (expanded), colored gold/yellow
- File icon: `mdi-file-document-outline`, colored blue
- Indent: 16px per depth level (same as current tree)
- Preview: clean rendered Markdown with proper heading styles, code blocks with syntax highlighting, tables, etc.
- Editor split-pane: same pattern as current ArtifactDetailView edit mode

---

## 7. Data Model Impact

No database changes. FileTreeService reads/writes the filesystem directly.

New IPC channels: `filetree:scan`, `filetree:readFile`, `filetree:writeFile`

---

## 8. Integration Impact

- TreeSidebar.vue significantly rewritten (filesystem tree replaces artifact hierarchy tree)
- coreCallbacks.js gains filetree:* handlers
- preload.js gains filetree:* channels
- Current TreeService (treeService.js) and treeStore.js may be deprecated or kept alongside for dashboard coverage features
- Router needs a file preview/edit route

---

## 9. Acceptance Criteria

Feature is complete when:

- [ ] Tree sidebar shows the folder/file structure of `docs/`
- [ ] Folders are expandable/collapsible with folder icons
- [ ] Only `.md` files are shown (other files excluded)
- [ ] `.archive/` directory is excluded
- [ ] Clicking a `.md` file shows rendered Markdown preview in the main content area
- [ ] Preview displays with proper heading styles, code blocks, tables
- [ ] "Edit" button switches to CodeMirror editor with live preview
- [ ] "Save" writes content to disk and returns to preview mode
- [ ] "Cancel" reverts to preview without saving
- [ ] Tree refreshes when files are added/changed/removed externally
- [ ] Currently selected file is highlighted in the tree
- [ ] Navigation items (Dashboard, Git, Settings, etc.) remain accessible

---

## 10. Risks & Unknowns

- The existing TreeSidebar has artifact-hierarchy logic, search/filter, and nav icons. The rewrite needs to preserve the nav icons and add file-system browsing. Could adapt rather than fully replace.
- Large docs/ directories with deep nesting could slow scan — unlikely for a requirements repo.
- CodeMirror is already a dependency (from OMBUTO-014) so no new deps needed for the editor.

---

## 11. Rollback Strategy

- Revert TreeSidebar.vue to the artifact-hierarchy version.
- Remove FileTreeService and its IPC handlers.
- No data migrations.

---

## 12. Dependencies

- **Requires**: ELECTRON_APP_SHELL (working Electron + Vue shell)
- **Specifically depends on**:
  - OMBUTO-003 (Vue app shell, TreeSidebar exists)
  - OMBUTO-014 (CodeMirror already integrated for editor)
  - OMBUTO-016 (file watcher for auto-refresh)

---

## 13. Implementation Notes (For Planning Agent)

### Suggested Ticket Breakdown

1. **OMBUTO-029**: FileTreeService backend — `fileTreeService.js` with scan(), readFile(), writeFile(). Register filetree:* IPC handlers in coreCallbacks.js. Add channels to preload.js.
   - Depends on: OMBUTO-010
   - Touches: coreCallbacks.js, preload.js

2. **OMBUTO-030**: Rewrite TreeSidebar to filesystem tree — replace artifact hierarchy rendering with folder/file tree from filetree:scan. Folder expand/collapse, file click navigates. Keep nav icon bar. Integrate with file watcher for auto-refresh.
   - Depends on: OMBUTO-029
   - Touches: TreeSidebar.vue (major rewrite)

3. **OMBUTO-031**: Markdown preview view — new FilePreviewView.vue at route `/file/:path*`. Loads file via filetree:readFile, renders with marked + highlight.js. Shows file name, path, Edit button.
   - Depends on: OMBUTO-029
   - Touches: router/index.js (add route)

4. **OMBUTO-032**: Markdown editor mode — extend FilePreviewView with edit toggle. Split-pane CodeMirror + live preview. Save/Cancel. Writes via filetree:writeFile.
   - Depends on: OMBUTO-031

Expected complexity: M (medium) — 4 tickets. Backend is simple (fs.readdir + fs.readFile/writeFile). The TreeSidebar rewrite is the most work but the pattern is similar to the current one.
Estimated total effort: 4 tickets, each 2-3 hours.
