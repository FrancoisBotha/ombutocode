# Feature: TREE_AND_DASHBOARD

Status: TICKETS
Owner: human
Created: 2026-04-04
Last Updated: 2026-04-04

---

## 1. Purpose

Implement the hierarchical tree sidebar and dashboard view — the two primary navigation and overview surfaces of ombutoplan. The tree sidebar makes the requirement hierarchy visible and navigable (PRD > COMP > EPIC > US > AC). The dashboard provides summary cards, coverage gap warnings, and component health overviews.

Both surfaces depend on a new TreeService in the backend that builds the tree structure, walks ancestor/descendant chains, and computes coverage reports.

Why does it exist?
The flat artifact list (from ARTIFACT_CRUD) lets the developer browse all artifacts, but the whole point of ombutoplan is **traceability through hierarchy**. Without the tree sidebar, the developer can't see how requirements relate to each other. Without the dashboard, they can't spot gaps (epics with no stories, stories with no ACs). These are the features that make ombutoplan more than a Markdown file editor.

What problem does it solve?
- **Tree sidebar**: visual hierarchy navigation — see the full structure at a glance, click to drill down
- **Dashboard**: health check — which parts of the system have gaps in requirements coverage

---

## 2. User Story

As a solo developer,
I want to see my requirements arranged in a hierarchy in a sidebar tree and get a dashboard overview of coverage gaps,
So that I can navigate the requirement structure intuitively and catch missing requirements before they become bugs.

---

## 3. Scope

### In Scope
- **Backend — TreeService**: `treeService.js` — buildTree, ancestors, descendants, children, breadcrumb, coverageReport, componentSummary
- **Backend — IPC handlers**: tree:* channels registered in coreCallbacks.js
- **Frontend — Tree sidebar component**: replaces the TreeView placeholder from OMBUTO-003. Collapsible tree rooted at PRDs, expanding through COMPs > EPICs > USs > ACs. FRs and NFRs as children of their PRD alongside COMPs. Nodes show type icon, ID, truncated title, color-coded status dot. Components visually emphasized (bold/distinct icon). Real-time search/filter bar. Click navigates to artifact detail.
- **Frontend — Dashboard view**: replaces the DashboardView placeholder (or ArtifactListView takes over the list, dashboard becomes a separate view). Summary cards per artifact type (count by status). Component-level breakdown. Coverage gap warnings. Quick links to recently updated artifacts.
- **Frontend — Tree sidebar always visible**: the tree replaces the current sidebar navigation (SidebarNav menu items move to header or integrate into the tree sidebar top)
- **Frontend — Pinia store updates**: extend artifactStore or create a treeStore for tree data and coverage

### Out of Scope
- Git panel and version history (separate feature)
- Mockup gallery (separate feature)
- Validation engine beyond coverage gaps (separate feature)
- Cross-reference link parsing (future)
- Drag-and-drop reordering in the tree

---

## 4. Functional Requirements

### 4.1 TreeService (from Architecture §5.2)
1. `buildTree()` — parse all artifacts, resolve parent references, return a tree structure rooted at PRDs. Components are the next level under PRDs, alongside FRs and NFRs. EPICs under COMPs, USs under EPICs, ACs under USs.
2. `ancestors(id)` — return the ordered chain from the artifact up to its root PRD.
3. `descendants(id)` — return all artifacts below the given one, recursively.
4. `children(id)` — return direct children only.
5. `breadcrumb(id)` — return the ancestor chain formatted for breadcrumb display (same data as ancestors but optimized for UI).
6. `coverageReport()` — return lists of: COMPs with no EPICs, EPICs with no USs, USs with no ACs, PRDs with no COMPs.
7. `componentSummary(compId)` — return aggregate counts of EPICs, USs, ACs under a component, broken down by status.
8. TreeService is stateless — it reads from artifactDb on every call.

### 4.2 Tree Sidebar (from PRD §6.2)
9. The tree sidebar MUST always be visible on the left side of the application (replacing or incorporating SidebarNav).
10. The tree is collapsible — nodes can be expanded/collapsed individually.
11. Nodes display: type-specific icon, artifact ID, truncated title (with tooltip for full title), color-coded status dot.
12. Component nodes MUST be visually distinct (bold label or distinct icon) to emphasize architectural grouping.
13. A search/filter bar at the top of the tree filters nodes in real time by ID or title. Matching nodes and their ancestors remain visible; non-matching branches collapse.
14. Clicking a tree node navigates to `/artifact/:id` in the main content area.
15. The currently selected artifact is highlighted in the tree.
16. The tree refreshes when artifacts are created, updated, or archived (listen for store changes).
17. Navigation items (Dashboard, Mockups, Git, Validate, Settings) remain accessible — either as pinned items at the top/bottom of the tree sidebar or moved to a header bar.

### 4.3 Dashboard View (from PRD §6.2, §6.6)
18. Summary cards per artifact type showing count by status (e.g., "User Stories: 12 draft, 8 active, 3 implemented").
19. Component-level breakdown: for each COMP, show counts of EPICs, USs, ACs broken down by status.
20. Coverage gap warnings highlighted prominently:
    - COMPs with 0 EPICs
    - EPICs with 0 USs
    - USs with 0 ACs
    - PRDs with 0 COMPs
21. Each gap item is a clickable link to the artifact that has the gap.
22. Quick links section showing recently updated artifacts (sorted by `updated` date, top 10).
23. Dashboard data loads from treeStore/artifactStore.

---

## 5. Non-Functional Requirements

- `buildTree()` must complete in under 200ms for 500 artifacts.
- Tree sidebar must render smoothly with up to 500 nodes (consider virtual scrolling only if performance issues arise).
- Search/filter must feel instant (debounce 100ms max).
- Dashboard cards must load in under 500ms.

---

## 6. UI/UX Notes

### Tree Sidebar
- Width: ~250px default, resizable via drag handle on the right edge.
- Collapse all / Expand all buttons at the top.
- Type icons using Material Design Icons:
  - PRD: `mdi-file-document` (blue)
  - COMP: `mdi-puzzle` (purple, bold)
  - FR: `mdi-format-list-checks` (teal)
  - NFR: `mdi-shield-check` (orange)
  - EPIC: `mdi-flag` (green)
  - US: `mdi-account-circle` (default)
  - AC: `mdi-check-circle` (default)
- Status dots: draft=gray, active=green, implemented=blue, deferred=yellow, deprecated=red (same as list view).
- Indent levels: each child type indents 16px deeper than its parent.
- Navigation items (Dashboard, Mockups, Git, Validate, Settings) as small icon-buttons in a horizontal bar at the top of the sidebar, above the search bar.

### Dashboard
- Grid of summary cards (2-3 columns).
- Each card has a header (artifact type name), a large count number, and a mini status breakdown.
- Coverage gaps section in a warning-colored panel below the cards.
- Recently updated section as a compact list with ID, title, type badge, and relative time ("2 hours ago").

---

## 7. Data Model Impact

No new database tables. TreeService reads from the existing `artifacts` table (from ARTIFACT_CRUD).

New IPC channels:
- `tree:build`, `tree:ancestors`, `tree:descendants`, `tree:children`, `tree:breadcrumb`
- `tree:coverage`, `tree:componentSummary`

---

## 8. Integration Impact

- coreCallbacks.js gains tree:* handler registrations
- main.js requires treeService (no initialization needed — stateless)
- preload.js tree:* channels were already whitelisted as placeholders in OMBUTO-002
- SidebarNav.vue either significantly changes or is replaced by TreeSidebar.vue
- App.vue layout changes: sidebar becomes the tree sidebar instead of a simple menu

---

## 9. Acceptance Criteria

Feature is complete when:

- [ ] Tree sidebar displays the full artifact hierarchy rooted at PRDs
- [ ] Nodes show type icon, ID, truncated title, and color-coded status dot
- [ ] Component nodes are visually bold/distinct from other types
- [ ] Nodes can be expanded and collapsed individually
- [ ] Collapse All / Expand All buttons work
- [ ] Search bar filters the tree in real time by ID or title
- [ ] Clicking a tree node navigates to the artifact detail view
- [ ] The currently active artifact is highlighted in the tree
- [ ] Navigation items (Dashboard, Mockups, Git, Validate, Settings) remain accessible
- [ ] Tree refreshes automatically when artifacts are created, updated, or archived
- [ ] Dashboard shows summary cards with artifact counts by type and status
- [ ] Dashboard shows component-level breakdown (EPICs, USs, ACs per COMP by status)
- [ ] Coverage gaps are listed with clickable links to the gapped artifact
- [ ] Recently updated artifacts section shows the 10 most recent
- [ ] buildTree() returns correct hierarchy for all 7 artifact types
- [ ] ancestors() and breadcrumb() return correct chains
- [ ] coverageReport() correctly identifies all gap categories
- [ ] componentSummary() returns accurate per-component breakdowns

---

## 10. Risks & Unknowns

- The tree sidebar replaces the SidebarNav from OMBUTO-003 — this is a significant layout change. Need to preserve access to non-artifact views (Dashboard, Mockups, Git, Validate, Settings).
- Tree rendering performance with many nodes — if >200 visible nodes cause jank, may need virtual scrolling (vue-virtual-scroller or similar). Start simple.
- Search/filter logic for trees is non-trivial: matching nodes must show their ancestor chain to maintain context. Need a recursive filter that keeps parent paths to matching leaves.
- The sidebar width may conflict with narrow screens — resizable handle adds complexity.

---

## 11. Rollback Strategy

- TreeService is a new stateless module — remove it and its IPC handlers.
- TreeSidebar component can be reverted to SidebarNav.
- Dashboard view can be reverted to the placeholder.
- No data migrations.

---

## 12. Dependencies

- **Requires feature**: ARTIFACT_CRUD (OMBUTO-008 through OMBUTO-016) — artifacts table, artifactService, artifactStore must be in place.
- **Specifically depends on**:
  - OMBUTO-008 (artifactDb) — TreeService queries the artifacts table
  - OMBUTO-010 (artifact IPC + coreCallbacks) — for adding tree:* handlers
  - OMBUTO-011 (artifactStore) — Dashboard and tree consume artifact data
  - OMBUTO-013 (ArtifactDetailView) — tree click navigates to detail view
- References:
  - `docs/PRD.md` §6.2 (tree view, list view, dashboard view)
  - `docs/PRD.md` §6.6 (traceability — breadcrumb, children, coverage)
  - `docs/ARCHITECTURE.md` §5.2 (TreeService API)

---

## 13. Implementation Notes (For Planning Agent)

### Scaffolding Files (shared across tickets — chain with depends_on)

- `frontend/src/main/coreCallbacks.js` — OMBUTO-017 adds tree:* handlers
- `frontend/main.js` — OMBUTO-017 requires treeService
- `frontend/src/renderer/App.vue` — OMBUTO-019 replaces sidebar layout (major change)
- `frontend/src/renderer/components/SidebarNav.vue` — OMBUTO-019 refactors or replaces

### Suggested Ticket Breakdown

1. **OMBUTO-017**: TreeService backend — `treeService.js` with buildTree, ancestors, descendants, children, breadcrumb, coverageReport, componentSummary. Register tree:* IPC handlers in coreCallbacks.js.
   - Depends on: OMBUTO-008, OMBUTO-010
   - Touches: coreCallbacks.js, main.js

2. **OMBUTO-018**: Tree store — Pinia `treeStore.js` with actions: fetchTree, fetchAncestors, fetchBreadcrumb, fetchCoverage, fetchComponentSummary. Manages tree data and expanded/collapsed state per node.
   - Depends on: OMBUTO-017

3. **OMBUTO-019**: Tree sidebar component — `TreeSidebar.vue` replaces SidebarNav in App.vue. Renders recursive tree nodes. Node component with icon, ID, title, status dot. Expand/collapse per node. Collapse All/Expand All buttons. Click navigates to /artifact/:id. Active artifact highlight. Move nav items (Dashboard, Mockups, Git, Validate, Settings) to icon bar at top of sidebar.
   - Depends on: OMBUTO-018
   - Touches: App.vue (replace sidebar), SidebarNav.vue (refactor or delete)

4. **OMBUTO-020**: Tree search/filter — Add search input to TreeSidebar. Real-time filter that shows matching nodes + their ancestor chains. Debounced input (100ms). Clear button.
   - Depends on: OMBUTO-019

5. **OMBUTO-021**: Dashboard view — `DashboardView.vue` with summary cards per artifact type (counts by status), component breakdown section, coverage gap warnings (from tree:coverage), recently updated artifacts list. Replaces the ArtifactListView at "/" or gets its own "/dashboard" route.
   - Depends on: OMBUTO-018
   - Note: ArtifactListView from OMBUTO-012 should remain accessible (e.g., at "/list" or as a tab). Route the default "/" to Dashboard and add "/list" for the flat table.

6. **OMBUTO-022**: Component summary cards — Extend dashboard or component detail view to show per-component breakdown: EPIC/US/AC counts by status. Uses tree:componentSummary IPC. Clickable to navigate to the component.
   - Depends on: OMBUTO-021

Expected complexity: M-L (medium-large) — 6 tickets. TreeService is algorithmic but straightforward. The tree sidebar UI is the most complex piece (recursive component rendering, search filter logic, layout restructuring).
Estimated total effort: 6 tickets, each 2-4 hours.
