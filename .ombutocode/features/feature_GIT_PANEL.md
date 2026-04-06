# Feature: GIT_PANEL

Status: DEPRECATED — Replaced by feature_VERSION_HISTORY.md. No full git UI in ombutoplan; versioning is transparent via a per-file "Versions" button.
Owner: human
Created: 2026-04-05
Last Updated: 2026-04-05

---

## 1. Purpose

Implement the git integration layer and UI panel for ombutoplan. This is the feature that makes ombutoplan truly "git-backed" — the developer can see which artifacts changed, stage and commit from the UI, browse commit history filtered to requirement files, view diffs between versions, and manage branches for exploring alternate requirement directions.

Why does it exist?
The PRD promises that "Git Is Not Abstracted Away" (§2.2) — the tool surfaces commits, branches, and diffs directly. Without the git panel, developers must use the terminal for all version control on their requirements, breaking the workflow.

What problem does it solve?
- Saves and commits are decoupled (PRD §6.3) — the git panel is where the developer commits batched edits
- History view lets the developer trace when and why a requirement changed
- Branch support enables exploring alternate requirement scopes without risking the main line

---

## 2. User Story

As a solo developer,
I want to stage, commit, browse history, view diffs, and manage branches for my requirement files from within the ombutoplan UI,
So that I can version-control my requirements without leaving the desktop app.

---

## 3. Scope

### In Scope
- **Backend — GitService**: `gitService.js` — status, commit, log, diff, branches, createBranch, switchBranch, mergeBranch, fileAtCommit, suggestCommitMessage. All operations use simple-git scoped to `docs/`.
- **Backend — IPC handlers**: git:* channels registered in coreCallbacks.js
- **Frontend — gitStore**: Pinia store for git status, log, diff, branches, current branch
- **Frontend — GitPanel component**: collapsible panel with three tabs — Status, History, Diff
- **Frontend — Status tab**: list of changed `docs/` files with checkboxes, commit message input (with auto-suggest), commit button
- **Frontend — History tab**: scrollable commit log filtered to `docs/` files, each entry shows hash, message, date, affected artifact IDs. Click opens diff.
- **Frontend — Diff tab**: side-by-side or unified diff of a specific artifact between two commits. Rendered with diff2html.
- **Frontend — BranchPanel**: dropdown in the header or sidebar showing current branch, list branches, create/switch/merge. Warns if uncommitted changes before switching.
- **Router integration**: GitView accessible via sidebar navigation icon

### Out of Scope
- Merge conflict resolution UI (future — PRD acknowledges this)
- Push/pull to remotes (PRD §7.5 — "developer's responsibility using their normal git workflow")
- Force push, rebase, or destructive operations (PRD §7.3)
- Git LFS configuration (PRD §10 — documented recommendation only)
- Visual mockup diffing between commits (future)

---

## 4. Functional Requirements

### 4.1 GitService (from Architecture §5.2)
1. `status()` — run `git status` and filter output to only show files under `docs/`. Return array of { path, status (modified/added/deleted/untracked) }.
2. `commit(files[], message)` — stage the specified files (must be under `docs/`), commit with the given message. Return { hash, message }.
3. `log(path?, count?)` — return commit history. If path is provided, filter to commits touching that file. Default count: 50.
4. `diff(from, to, path?)` — return structured diff between two refs (commits, branches, HEAD). If path given, scope to that file.
5. `branches()` — return list of branches with current branch flagged.
6. `createBranch(name)` — create and checkout a new branch.
7. `switchBranch(name)` — checkout an existing branch. Fail if uncommitted changes exist.
8. `mergeBranch(source, target)` — merge source into target. Return merge result (success, conflicts).
9. `fileAtCommit(commitHash, path)` — return the content of a file at a specific commit.
10. `suggestCommitMessage(files[])` — inspect the staged/changed files and generate a descriptive commit message (e.g., "Update US-017, Add AC-045").
11. All operations use simple-git pointed at the project root.

### 4.2 Git Status Tab (from PRD §6.7)
12. Show all changed files under `docs/` with their status (modified, added, deleted, untracked).
13. Each file has a checkbox for selecting which files to stage/commit.
14. "Select All" / "Deselect All" buttons.
15. Commit message text input. Auto-populated by suggestCommitMessage when files are selected.
16. "Commit" button stages selected files and commits.
17. After commit, status refreshes automatically.
18. Status refreshes when the git view is opened and after file watcher events.

### 4.3 Git History Tab (from PRD §6.7)
19. Scrollable commit log showing: abbreviated hash, message, date, author.
20. Each commit shows which artifact IDs were affected (parsed from file paths in the commit).
21. Clicking a commit opens the diff tab showing that commit's changes.
22. Optional: filter by artifact ID or path to show history for a specific artifact.

### 4.4 Git Diff Tab (from PRD §6.7)
23. Show diff between two points: working tree vs HEAD, two commits, or two branches.
24. Rendered using diff2html in side-by-side or unified mode (toggle).
25. Dropdown/selector for choosing the "before" and "after" refs.
26. For artifact files, show the artifact ID and title in the diff header.

### 4.5 Branch Management (from PRD §6.7)
27. Current branch name displayed in header or sidebar.
28. Dropdown lists all branches.
29. "New Branch" button — prompts for name, creates and switches to it.
30. Clicking a different branch switches to it (with warning if uncommitted changes).
31. "Merge" option — select source branch to merge into current branch.
32. Merge result shows success message or conflict list.

---

## 5. Non-Functional Requirements

- Git operations should feel responsive for typical repo sizes.
- Status should load in under 500ms.
- Log should load first 50 commits in under 1 second.
- Diff rendering should handle files up to 10,000 lines.
- The tool MUST NOT perform destructive git operations (force push, rebase, reset --hard) without explicit confirmation.

---

## 6. UI/UX Notes

### Git Panel
- Collapsible panel at the bottom of the main content area (like VS Code's terminal/problems panel), or a dedicated full-page view accessible from the sidebar git icon.
- Three tabs: Status, History, Diff — styled consistently with the rest of the app.
- Status tab: file list as a simple table with checkbox, status badge, and relative path. Commit message as a textarea below.
- History tab: compact list, each row is a commit. Hash is monospace, message truncated with tooltip for full text. Date shown as relative ("2 hours ago").
- Diff tab: diff2html renders with syntax highlighting. Toggle between side-by-side and unified view.

### Branch Panel
- Small dropdown in the top-right of the header or at the top of the tree sidebar.
- Shows branch icon + current branch name. Click opens branch list.
- "New Branch" and "Merge" as action buttons within the dropdown.

---

## 7. Data Model Impact

No new database tables. GitService operates on the git repository directly via simple-git.

New IPC channels:
- `git:status`, `git:commit`, `git:log`, `git:diff`
- `git:branches`, `git:createBranch`, `git:switchBranch`, `git:merge`
- `git:fileAtCommit`, `git:suggestCommitMessage`

---

## 8. Integration Impact

- New dependency: diff2html (for diff rendering in the frontend)
- coreCallbacks.js gains git:* handler registrations
- main.js requires gitService
- preload.js needs git:* channels added to allowedChannels
- Header or sidebar gains branch display component

---

## 9. Acceptance Criteria

Feature is complete when:

- [ ] Git status shows changed files under docs/ with correct status indicators
- [ ] Files can be selected via checkboxes and committed with a message
- [ ] Auto-suggested commit messages reflect which artifacts changed
- [ ] After committing, status refreshes and committed files disappear from the list
- [ ] Commit history shows the 50 most recent commits with hash, message, date
- [ ] History entries show which artifact IDs were affected
- [ ] Clicking a history entry shows the diff for that commit
- [ ] Diff view renders correctly in both side-by-side and unified modes
- [ ] Diff can compare working tree vs HEAD, or two commits
- [ ] Current branch name is visible in the UI
- [ ] Branches can be listed, created, and switched
- [ ] Switching branches warns if there are uncommitted changes
- [ ] Merge can be initiated from the UI and shows success/conflict result
- [ ] No destructive git operations are performed without confirmation
- [ ] All git operations are scoped to the project root repository

---

## 10. Risks & Unknowns

- simple-git on Windows may have PATH issues if git is not in the system PATH — need to detect and show helpful error.
- diff2html is a large library — may increase bundle size. Consider lazy-loading the diff tab.
- Merge conflict UI is explicitly out of scope — the merge result will show conflict file paths but the developer resolves them externally. This may feel incomplete.
- Branch switching with uncommitted changes: simple-git will fail — need to catch and show a clear warning, not a raw error.
- suggestCommitMessage is a best-effort heuristic: parse file paths to extract artifact IDs, generate "Update X, Add Y, Archive Z" style messages.

---

## 11. Rollback Strategy

- GitService is a new stateless module — remove it and its IPC handlers.
- GitPanel/GitView component and gitStore can be deleted.
- No data migrations.

---

## 12. Dependencies

- **Requires features**: ELECTRON_APP_SHELL, ARTIFACT_CRUD
- **Specifically depends on**:
  - OMBUTO-010 (coreCallbacks.js) — for adding git:* handlers
  - OMBUTO-003 (Vue app shell + router) — for git view route
  - OMBUTO-011 (artifactStore) — for resolving artifact IDs from file paths
- References:
  - `docs/PRD.md` §6.7 (git operations UI)
  - `docs/PRD.md` §7.3 (non-destructive operations)
  - `docs/ARCHITECTURE.md` §5.2 (GitService API)

---

## 13. Implementation Notes (For Planning Agent)

### Scaffolding Files (shared across tickets — chain with depends_on)

- `frontend/src/main/coreCallbacks.js` — OMBUTO-023 adds git:* handlers
- `frontend/main.js` — OMBUTO-023 requires gitService
- `frontend/preload.js` — OMBUTO-023 adds git:* to allowedChannels
- `frontend/package.json` — OMBUTO-026 adds diff2html dependency

### Suggested Ticket Breakdown

1. **OMBUTO-023**: GitService backend — `gitService.js` with all 10 methods using simple-git. Register git:* IPC handlers in coreCallbacks.js. Add git:* channels to preload.js allowedChannels.
   - Depends on: OMBUTO-010
   - Touches: coreCallbacks.js, main.js, preload.js

2. **OMBUTO-024**: gitStore Pinia store — actions for fetchStatus, commit, fetchLog, fetchDiff, fetchBranches, createBranch, switchBranch, merge. State: status array, log array, currentDiff, branches array, currentBranch.
   - Depends on: OMBUTO-023

3. **OMBUTO-025**: Git Status tab — GitStatusPanel.vue component showing changed docs/ files with checkboxes, select all/deselect all, commit message textarea with auto-suggest, commit button. Refreshes on mount and after commit.
   - Depends on: OMBUTO-024

4. **OMBUTO-026**: Git History tab — GitHistoryPanel.vue showing commit log. Each entry: hash, message, date, affected artifact IDs. Click selects a commit for diffing. Add diff2html to package.json.
   - Depends on: OMBUTO-024
   - Touches: package.json (add diff2html)

5. **OMBUTO-027**: Git Diff tab — GitDiffPanel.vue showing diff rendered with diff2html. Toggle between side-by-side and unified. Ref selectors (working tree, HEAD, commits). Triggered from history tab click or manual selection.
   - Depends on: OMBUTO-026

6. **OMBUTO-028**: GitView page + Branch panel — GitView.vue as the full-page view with Status/History/Diff tabs. BranchSelector.vue component showing current branch, branch list dropdown, new branch, switch branch (with uncommitted changes warning), merge action.
   - Depends on: OMBUTO-025, OMBUTO-027

Expected complexity: M-L (medium-large) — 6 tickets. GitService is straightforward (simple-git wrapper). The UI has moderate complexity with three tabs and the branch panel.
Estimated total effort: 6 tickets, each 2-4 hours.
