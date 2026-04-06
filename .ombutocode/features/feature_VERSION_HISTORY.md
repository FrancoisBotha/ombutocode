# Feature: VERSION_HISTORY

Status: TICKETS
Owner: human
Created: 2026-04-05
Last Updated: 2026-04-05

---

## 1. Purpose

Provide transparent version history for any Markdown file in `docs/`. No git UI, no staging, no branch management — just a "Versions" button that shows previous versions of the current file with dates, and the ability to click one to view it.

Git versioning happens naturally as the developer commits from their terminal or IDE. ombutoplan simply surfaces the history of each file by reading `git log` for that path.

Why does it exist?
The PRD promises version history aligned to the code (§2). But developers don't need a full git panel inside ombutoplan — they already have git tools. What they need is the ability to see "what did this document look like last week?" directly in the app.

---

## 2. User Story

As a developer viewing a requirements document,
I want to click "Versions" and see a list of previous versions with dates, and click one to view the old content,
So that I can trace how a requirement evolved over time without leaving the app.

---

## 3. Scope

### In Scope
- **Backend — VersionService**: `versionService.js` — get commit history for a specific file, retrieve file content at a specific commit
- **Backend — IPC handlers**: `version:log`, `version:fileAtCommit`
- **Frontend — "Versions" button**: visible in the FilePreviewView (and ArtifactDetailView) title bar, next to "Edit"
- **Frontend — Versions panel**: slide-out panel or modal listing previous versions of the current file. Each entry shows: commit date, commit message (truncated), author. Sorted newest first.
- **Frontend — Version preview**: clicking a version entry shows the file content at that commit, rendered as Markdown. A clear indicator that this is a historical version (not the current one). A "Back to current" button to return.
- **Frontend — Diff option**: optional — show what changed between the selected historical version and the current version

### Out of Scope
- Full git panel (staging, committing, branches, merge) — removed from ombutoplan scope
- Restoring/reverting to a previous version (developer does this via git CLI if needed)
- Comparing two arbitrary historical versions against each other
- Version history for non-committed changes (only committed versions are shown)

---

## 4. Functional Requirements

### 4.1 VersionService
1. `getFileLog(relativePath, count?)` — run `git log --follow` for the given file path under `docs/`. Return array of `{ hash, date, message, author }`. Default count: 30. The `--follow` flag tracks the file through renames.
2. `getFileAtCommit(hash, relativePath)` — run `git show <hash>:<path>` to retrieve the file content at that commit. Return raw Markdown string.

### 4.2 Versions Button
3. A "Versions" button appears in the file preview title bar (next to "Edit").
4. The button shows a small count badge if the file has more than 1 version (e.g., "Versions (5)").
5. Button is hidden or disabled if the file has never been committed (0 versions in git log).

### 4.3 Versions Panel
6. Clicking "Versions" opens a panel (slide-out from the right, or a modal).
7. The panel lists all committed versions of the current file, newest first.
8. Each entry shows: date (formatted, e.g., "Apr 5, 2026 3:42 PM"), commit message (truncated to ~80 chars with tooltip for full), author name.
9. The current (latest) version is labelled "Current" and is not clickable.
10. Clicking any other entry loads that version's content.

### 4.4 Version Preview
11. When a historical version is selected, the main content area shows the file content at that commit, rendered as Markdown.
12. A prominent banner at the top indicates: "Viewing version from [date] — [commit message]".
13. A "Back to current" button returns to the current file content.
14. The Edit button is hidden/disabled when viewing a historical version (read-only).

---

## 5. Non-Functional Requirements

- `getFileLog` should return in under 500ms for files with up to 100 commits.
- `getFileAtCommit` should return in under 200ms.
- The versions panel should load immediately after the log is fetched.

---

## 6. UI/UX Notes

- **Versions button**: outline style, positioned after "Edit" in the title bar. Icon: `mdi-history`. Shows badge count.
- **Versions panel**: slide-out from the right edge (~300px wide) with a semi-transparent overlay. Or a simple modal. Each version entry as a row: date on top (bold), message below (muted), author (small). Hover highlights the row. Click selects.
- **Version preview banner**: full-width bar above the rendered content, yellow/amber background. Text: "Viewing version from Apr 5, 2026 — Updated acceptance criteria". [Back to current] button on the right.
- **Transition**: smooth slide/fade between current and historical content.

---

## 7. Data Model Impact

No database changes. VersionService reads from git directly via simple-git.

New IPC channels: `version:log`, `version:fileAtCommit`

---

## 8. Integration Impact

- simple-git already a dependency (from OMBUTO-023 or existing package.json)
- coreCallbacks.js gains version:* handlers
- preload.js gains version:* channels
- FilePreviewView.vue gains "Versions" button and version panel
- ArtifactDetailView.vue could also gain "Versions" button (optional, same pattern)

---

## 9. Acceptance Criteria

Feature is complete when:

- [ ] "Versions" button appears in the file preview title bar
- [ ] Button shows version count badge (e.g., "Versions (5)")
- [ ] Button is hidden for files with no git history
- [ ] Clicking "Versions" opens a panel listing all committed versions
- [ ] Each version shows date, commit message, and author
- [ ] Versions are sorted newest first
- [ ] Current version is labelled and not clickable
- [ ] Clicking a historical version shows the file at that commit, rendered as Markdown
- [ ] A banner clearly indicates the user is viewing a historical version
- [ ] "Back to current" returns to the current file content
- [ ] Edit button is disabled when viewing a historical version

---

## 10. Risks & Unknowns

- `git log --follow` may be slow on repos with very long histories — the count parameter mitigates this.
- `git show <hash>:<path>` requires the exact path at that commit — if the file was renamed, the path at the old commit may differ. `--follow` in the log handles this but we need to track the old path per commit.
- Files that have never been committed will have empty version history — the button should handle this gracefully.

---

## 11. Rollback Strategy

- Remove VersionService, version:* IPC handlers, and the Versions button/panel from FilePreviewView.
- No data migrations.

---

## 12. Dependencies

- **Requires**: FILESYSTEM_TREE feature (OMBUTO-029–032) — FilePreviewView must exist
- **Specifically depends on**:
  - OMBUTO-031 (FilePreviewView) — the Versions button lives here
  - OMBUTO-010 (coreCallbacks.js) — for registering IPC handlers
- simple-git already in package.json

---

## 13. Implementation Notes (For Planning Agent)

### Suggested Ticket Breakdown

1. **OMBUTO-033**: VersionService backend — `versionService.js` with getFileLog(path, count) and getFileAtCommit(hash, path) using simple-git. Register version:* IPC handlers in coreCallbacks.js. Add channels to preload.js.
   - Depends on: OMBUTO-010
   - Touches: coreCallbacks.js, preload.js

2. **OMBUTO-034**: Versions panel UI — Add "Versions" button to FilePreviewView. Create VersionsPanel.vue (slide-out or modal) listing committed versions with date, message, author. Load via version:log IPC. Show count badge. Handle empty state.
   - Depends on: OMBUTO-033, OMBUTO-031

3. **OMBUTO-035**: Historical version preview — Clicking a version in the panel loads file content at that commit via version:fileAtCommit. Show rendered Markdown with a "viewing historical version" banner. Back to current button. Disable Edit while viewing old version.
   - Depends on: OMBUTO-034

Expected complexity: S-M (small-medium) — 3 tickets. Backend is two simple-git calls. UI is a button + panel + conditional rendering.
Estimated total effort: 3 tickets, each 2-3 hours.
