---
system: true
---

# Epic Generation

## Overview

This skill guides AI coding agents in breaking a project's requirements (as captured in the PRD, Architecture, Data Model, and Style Guide) into a coherent set of **epics**. Each epic represents a deliverable milestone that can be independently developed and verified, and is sized so it can be further decomposed into 3–8 implementation tickets by the Ticket Generation skill.

The output of this skill is:
1. One Markdown file per epic in `docs/Epics/` (file naming: `epic_NN_EPIC_NAME.md` — see "Epic Numbering" below).
2. Updated `docs/Functional Requirements/FunctionalRequirements.md` and `docs/Non-Functional Requirements/NonFunctionalRequirements.md` matrices, with new rows cross-referencing each epic.

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
- **Number reflects build order** — earlier numbers should be foundational (scaffold, database, auth) and later numbers should build on them. When proposing the epic list, sort by intended build order before assigning numbers.
- **Never renumber existing epics** — if you discover a new epic that "should" come earlier, give it the next available number anyway. Renumbering would break ticket `epic_ref` links and orphan FR/NFR matrix rows.
- **Gaps are allowed but discouraged.** If an epic is later deleted, leave the gap rather than re-shuffling.

The epic file's `## 12. References` section should still use the full filename including the numeric prefix (e.g. `epic_01_APP_SHELL.md`).

---

## Guidelines

- **Read the source documents first** — PRD, Architecture, Data Model, Style Guide — before proposing epics. The epics must trace back to documented requirements, not invented scope.
- **Read the engineering guide** at `.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md` to understand the project's conventions, ticket workflow, and status lifecycle.
- **Size epics to fit the ticket pipeline** — each epic should be decomposable into 3–8 development tickets. If an epic would need more, split it into two epics along a natural seam. If it would need fewer, consider merging it with a neighbour.
- **One epic = one deliverable milestone** — when this epic is complete, something meaningful and testable has been shipped (a working feature slice, a foundational subsystem, an integration end-to-end).
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
- [ ] Criterion 1
- [ ] Criterion 2

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
3. **Propose the epic list** as a numbered summary table — proposed sequence number, title, and one-line description for each. Order by intended build sequence (foundations first). Ask the user to confirm or revise before writing any files.
4. **For each confirmed epic**:
   - Create the `docs/Epics/epic_NN_<NAME>.md` file using the structure above, with the title `# Epic N: <Name>` (unpadded N inside the file, zero-padded NN in the filename).
   - Append rows to the FR / NFR matrices for any requirements introduced, referencing the full prefixed epic stem.
5. **Report what was written** — list the new epic files (with their numeric prefixes) and the FR/NFR IDs that were added.

Do NOT create the backlog tickets themselves — that is the job of the Ticket Generation skill, run separately once the epic is finalised.
