---
system: true
---

# Epic Generation — Vertical Slice

## Overview

This skill guides AI coding agents in breaking a project's requirements (as captured in the PRD, Architecture, Data Model, and Style Guide) into a coherent set of **epics**. Each epic represents a deliverable milestone that can be independently developed and verified, and is sized so it can be further decomposed into 3–8 implementation tickets by the Ticket Generation skill.

The output of this skill is:
1. One Markdown file per epic in `docs/Epics/` (file naming: `epic_NN_EPIC_NAME.md` — see "Epic Numbering" below).
2. Updated `docs/Functional Requirements/FunctionalRequirements.md` and `docs/Non-Functional Requirements/NonFunctionalRequirements.md` matrices, with new rows cross-referencing each epic.

---

## Core principle — every epic ships a working product

This is the **vertical slice** variant. **At the end of every epic the application must build, run, and let a real user do something useful end to end.** Not a layer. Not a component waiting to be wired up later. A working product that is a little more capable than it was before.

Epic 1 is the thinnest complete slice of the product a user could actually use. Epic 2 is that same product with one more capability, still fully working. And so on. The project is an MVP from the end of Epic 1 onward, growing in capability — never a construction site that only becomes usable at the end.

### The test

Before accepting any epic, answer this out loud:

> When this epic is `DONE` and nothing else is built, what can a user sit down and *do* that they could not do before — through the real UI, against real data, start to finish?

If the answer contains "nothing yet, but it enables…", "the API is ready for…", "the schema supports…", or "once epic N is built…", the epic is **wrong** for this strategy. Rework it.

### Vertical slices, not horizontal layers

Slice through every layer the feature touches — UI, application logic, persistence, integration — and take only the depth this slice needs.

**Wrong (horizontal layers):**
1. Database schema for the whole product
2. All API endpoints
3. Shared UI component library
4. Wire it together; the product finally works

Nothing is usable until epic 4, every epic is unverifiable on its own terms, and integration risk is banked to the end.

**Right (vertical slices):**
1. A user can create a note and see it in a list — real screen, real table, real persistence (schema only for notes)
2. A user can edit and delete those notes
3. A user can search their notes
4. A user can share a note with another user (auth and sharing arrive together, because this is the slice that needs them)

Each epic ends with a product someone could demo. The schema, the endpoints and the components grow as the slices that need them arrive.

### Foundations

Genuinely shared groundwork — app shell, build setup, base schema, auth scaffolding — is **not its own epic**. Fold the minimum a slice needs into that slice. The first epic legitimately carries more plumbing than the rest; that is fine, as long as it still ends with a user-visible capability that works.

Two exceptions, both of which must be called out explicitly when proposing:
- Stack bootstrap performed by the **Initiate Stack** or **Bootstrap Prototype** workflows — that is tooling, not an epic.
- A migration or refactor epic on an existing system, where the deliverable is "the same product, still fully working, on new foundations". The working-product test still applies: the app must run and behave correctly at the end.

### Sequencing

Order epics by **user value first**, not architectural convenience. The earliest epics deliver the capabilities the PRD treats as the product's core purpose; supporting and edge capabilities come later. Where a genuine technical prerequisite exists, it belongs *inside* the slice that first needs it, not in front of it as its own epic.

### The trade-off you are accepting

Slices stack up rather than fan out: later slices extend code earlier slices created, so fewer epics can be built concurrently and agents are more likely to touch the same files. You are buying a demoable product at every step, early feedback, and early integration risk, at the cost of raw parallel throughput. If throughput matters more — stable requirements, settled architecture, a platform or back-end where "what the user can do" is not the unit of progress — use the *Epic Generation - Layered* skill instead.

Whichever variant you use, be consistent across a project's epic set — mixing the two produces an epic list where "done" means different things from one row to the next.

---

## Epic Numbering

Every epic file MUST be prefixed with a zero-padded sequence number so the epic list sorts in build order. This applies to both the filename and the title heading inside the file.

**Filename:** `epic_NN_EPIC_NAME.md`
- `NN` is a two-digit zero-padded sequence number starting at `01` (e.g. `01`, `02`, …, `09`, `10`, `11`).
- `EPIC_NAME` is the existing convention — uppercase with underscores.
- Example: `epic_01_APP_SHELL.md`, `epic_02_DATABASE_FOUNDATION.md`, `epic_03_DROPBOX_AUTH.md`.

**Title heading inside the file:** `# Epic N: <Name>`
- Use the unpadded number in the title for readability.
- Example: `# Epic 1: App Shell`, `# Epic 2: Database Foundation`.

**Epic-to-epic dependencies (`Depends On:` line):**

Some epics can only be built once another epic is finished — e.g. the OAuth epic needs the database schema epic in place first. Record these prerequisites as a top-level `Depends On:` line, alongside `Status:` and `Owner:`:

```
Depends On: epic_02_DATABASE_FOUNDATION, epic_03_DROPBOX_AUTH
```

Rules:
- Values are comma-separated **epic stems** (the filename without `.md`).
- Omit the line entirely if the epic has no prerequisites.
- The scheduler reads this line and **will not start tickets** belonging to an epic whose dependencies aren't all at status `DONE`. So get this right — over-declaring dependencies will stall the pipeline; under-declaring will let downstream work start against incomplete foundations.
- The free-form §11 *Dependencies* section can still capture the *why* (the human-readable rationale, external dependencies, etc.). The `Depends On:` top-line is what the machine reads.

**Numbering rules:**
- **Continue from the highest existing number.** Before assigning new numbers, list `docs/Epics/` and find the largest `NN` already in use. New epics start at the next integer (e.g. if the highest is `epic_07_…`, the next new epic is `epic_08_…`).
- **Number reflects build order** — the sequence is a series of increasingly capable working products, ordered by user value (see "Core principle" above). Earlier numbers carry more of the shared plumbing simply because they get there first, but every number still ends with a usable product. When proposing the epic list, sort by intended build order before assigning numbers.
- **Never renumber existing epics** — if you discover a new epic that "should" come earlier, give it the next available number anyway. Renumbering would break ticket `epic_ref` links and orphan FR/NFR matrix rows.
- **Gaps are allowed but discouraged.** If an epic is later deleted, leave the gap rather than re-shuffling.

The epic file's `## 12. References` section should still use the full filename including the numeric prefix (e.g. `epic_01_APP_SHELL.md`).

---

## Guidelines

- **Read the source documents first** — PRD, Architecture, Data Model, Style Guide — before proposing epics. The epics must trace back to documented requirements, not invented scope.
- **Read the engineering guide** at `.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md` to understand the project's conventions, ticket workflow, and status lifecycle.
- **Size epics to fit the ticket pipeline** — each epic should be decomposable into 3–8 development tickets. If an epic would need more, split it into two epics along a natural seam — but split it *vertically*, into two smaller working slices, never into "the back end" and "the front end". If it would need fewer, consider merging it with a neighbour.
- **One epic = one working product** — when this epic is complete the application builds, runs, and a user can complete a real task through it end to end. See "Core principle" above; this is the rule that overrides the others when they conflict.
- **Propose first, write second** — always present the proposed list of epics with a one-line summary for each, and ask the user to confirm before creating any files.
- **Follow the status lifecycle** — every new epic starts at `Status: NEW`. The lifecycle is: `NEW` → `TICKETS` → `BUILDING` → `DONE`.

---

## Epic File Structure

Each epic file MUST follow this structure with numbered sections:

```
# Epic N: <Name>

Status: NEW
Owner: human
Created: YYYY-MM-DD
Last Updated: YYYY-MM-DD
Depends On: epic_01_APP_SHELL, epic_02_DATABASE_FOUNDATION

---

## 1. Purpose
What this epic delivers and why.

**Working increment:** (REQUIRED) One sentence stating what a user can do end to
end once this epic is DONE that they could not do before. A real task through the
real UI — not "the API supports…" or "the schema is ready for…".

## 2. User Story
As a [role], I want [capability], So that [benefit].

## 3. Scope
- **In Scope:** …
- **Out of Scope:** …

## 4. Functional Requirements
1. FR-001 — …
2. FR-002 — …

## 5. Non-Functional Requirements
1. NFR-001 — performance / security / availability / etc.

## 6. UI/UX Notes
Key UI elements, layouts, interactions.

## 7. Data Model Impact
Entities, fields, migrations.

## 8. Integration Impact
Affected systems, APIs, services.

## 9. Acceptance Criteria
- [ ] (REQUIRED, first) The application builds and runs, and a user can <the
      working increment from §1> end to end without any other epic being complete
- [ ] Criterion 2
- [ ] Criterion 3

## 10. Risks & Unknowns

## 11. Dependencies
Other epics or external dependencies.

## 12. References
- prd: docs/Product Requirements Document/PRD.md
- architecture: docs/Architecture/Architecture.md (if present)
- data_model: docs/Data Model/Schema.ddl (if present)
- style_guide: docs/Style Guide/StyleGuide.md (if present)

## 13. Implementation Notes
Suggested ticket breakdown, complexity estimate.
```

---

## Functional & Non-Functional Requirements Cross-Referencing

When an epic contains functional or non-functional requirements, you MUST also record them in the project-wide requirements matrices so they are traceable.

### Functional Requirements

- File: `docs/Functional Requirements/FunctionalRequirements.md`
- Table format: `| ID | Sub-System | Description | Status | Epic |`
- Assign sequential IDs `FR-001`, `FR-002`, … — read the existing file first and continue from the highest current ID. Do not restart numbering.
- The `Epic` column references the epic file stem **including the numeric prefix** (e.g. `epic_04_USER_AUTH`).

### Non-Functional Requirements

- File: `docs/Non-Functional Requirements/NonFunctionalRequirements.md`
- Same table format, with IDs `NFR-001`, `NFR-002`, …
- Same "read first, continue numbering" rule.

### Inline Reference Within the Epic

Each requirement listed in the epic's §4 / §5 should include its FR/NFR ID for two-way traceability — e.g. `FR-014 — User can sign in with email and password.`

---

## Process

1. **Read all source documents** the user provides (PRD always; Architecture, Data Model, Style Guide if available).
2. **Determine the starting number** — list `docs/Epics/` and find the highest existing `epic_NN_…` prefix. New epics begin at `NN + 1`.
3. **Propose the epic list** as a numbered summary table — proposed sequence number, title, and, for each epic, **what a user can do end to end once it is DONE**. Order by user value, thinnest usable product first. Before presenting the table, apply "The test" above to every row and rework any epic that fails it; if you kept an epic that fails the test (see "Foundations" for the two exceptions), say so and explain why. Ask the user to confirm or revise before writing any files.
4. **For each confirmed epic**:
   - Create the `docs/Epics/epic_NN_<NAME>.md` file using the structure above, with the title `# Epic N: <Name>` (unpadded N inside the file, zero-padded NN in the filename).
   - Append rows to the FR / NFR matrices for any requirements introduced, referencing the full prefixed epic stem.
5. **Report what was written** — list the new epic files (with their numeric prefixes) and the FR/NFR IDs that were added.

Do NOT create the backlog tickets themselves — that is the job of the Ticket Generation skill, run separately once the epic is finalised.
