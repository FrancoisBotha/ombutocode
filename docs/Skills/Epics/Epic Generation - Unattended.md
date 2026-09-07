---
system: true
---

# Epic Generation — Unattended

## Overview

This skill guides AI coding agents in turning **one reference specification** into **one epic** with no human in the loop. The caller (the headless CLI, `headless.js epic create`) passes the path of the reference specification in the prompt; the epic it produces is consumed literally by the Ticket Generation skill and by the automated evaluation stages, so it must be precise, grounded in the repository as it actually is, and written in a single pass.

The output of this skill is:
1. Exactly **one** Markdown file in `docs/Epics/` (file naming: `epic_NN_EPIC_NAME.md` — see "Epic Numbering" below).
2. New rows appended to `docs/Functional Requirements/FunctionalRequirements.md` and `docs/Non-Functional Requirements/NonFunctionalRequirements.md` **only if those files already exist**.

---

## Run to completion without prompting

**Do not ask the user anything. Decide, write the epic, verify it is on disk, commit, and finish.**

Nobody is watching this session. A question — about the epic name, the scope, whether a document exists, or permission to write — stops the run dead and nothing is written. An epic with a recorded assumption is worth far more than a perfect one that was never created.

Concretely:
- **Never** ask for confirmation of the name, the number, the scope, or the file contents.
- **Never** end a turn with a question and wait. Pick the most reasonable option and proceed.
- Resolve every ambiguity with your best judgement and **record each assumption in the epic's §10 Risks & Unknowns**, so the decision is visible in the file rather than lost in terminal scrollback.
- Only stop early if writing is genuinely impossible — the reference specification is missing or unreadable, or `docs/Epics/` cannot be written. Then explain briefly and finish with the FAILED marker below.

Still print the epic summary (title, working increment, capabilities, acceptance criteria) before writing. It is a record of what you are about to do, not a request for approval — do not pause after it.

### Finish with a machine-readable marker

The last line of your output MUST be exactly one of:

```
DONE - EPIC WRITTEN docs/Epics/<file>.md
```

```
FAILED - NO EPIC WRITTEN
```

Emit `DONE - EPIC WRITTEN` only after you have confirmed the file exists on disk, and name the file you wrote. If any part failed, emit `FAILED - NO EPIC WRITTEN` with a short explanation on the lines above it. The caller reads this line to decide whether the run succeeded, so never emit it speculatively and never emit both.

---

## Core principle — the epic describes the code that exists

The reference specification says what must become true. The repository says where you are starting from. The epic is the bridge, and it is only useful if both ends are real.

### Analyse the repository before writing

Before drafting a single section, establish from the code itself:
- **Build system and entry points** — how the project is built and run (`package.json` scripts, `Makefile`, `pyproject.toml`, `Cargo.toml`, `go.mod`, CI config, …).
- **Test layout and command** — where tests live, which runner they use, and the exact command that runs them. Every existing test that passes today must still pass when the epic is `DONE`; say so in §9.
- **Modules the specification touches** — the files, packages, and public interfaces the work will change or extend, and what already calls them.
- **Conventions** — language version, lint/format tooling, naming and layout patterns the new code must follow.

Scope (§3), integration impact (§8), acceptance criteria (§9), risks (§10) and dependencies (§11) must all reflect these findings. Do not describe a stack, a test framework, or a module that is not in the repository.

### Acceptance criteria must be externally verifiable

Every criterion in §9 is checked by a later stage that cannot ask you what you meant. Each one must name a concrete observation: a command that is run and its expected result, a test file or test name that passes, a file that exists with specific content, an HTTP request and its response, a CLI invocation and its output. Prefer the project's own test command over prose.

Wrong: "Search works correctly." Right: "`npm test` passes, including the new `test/search.test.js`, and `GET /api/notes?q=alpha` returns only notes whose title or body contains `alpha`."

If the specification states a behaviour you cannot make verifiable from the repository as it is, write the closest verifiable criterion you can and record the gap in §10.

### Decomposable, not decomposed

The Ticket Generation skill splits this epic into tickets; that decomposition is its job, not yours. Do **not** include a ticket list, a work breakdown, or a suggested sequence of implementation steps anywhere in the epic — not in §3, not in §13. Instead:
- §3 **Scope** enumerates the *capabilities* the epic delivers and the *constraints* it must respect, each as its own bullet.
- §9 **Acceptance Criteria** enumerates the *observable outcomes*, each independently checkable.

An epic written this way can be decomposed well; an epic that pre-plans its tickets steers the decomposition and hides the parts you did not think of.

### One epic

This skill writes exactly one epic per run, covering the whole reference specification. If the specification is large, the epic is large — do not split it, and do not leave parts of it out. Note in §10 if you judge that it would decompose into more than 8 tickets.

---

## Optional context documents

The PRD, Architecture document, Style Guide, Code Map (`docs/Code Map/codemap.json`) and the FR/NFR matrices are **optional** in this mode and frequently absent — the repository may have been adopted into Ombuto Code moments ago. Rules:
- Read each one if the prompt names it and the file exists; use it as context, never as a substitute for reading the code.
- **Never create** a PRD, Architecture document, Style Guide, Code Map, or FR/NFR matrix file. If a matrix file is absent, list the requirements in §4/§5 with `FR-`/`NFR-` IDs starting at 001 and skip the cross-referencing step; if the Code Map is absent, say so in §13 and read the affected code directly.
- In §12 References, list only files that exist. The reference specification is always listed first.

---

## Epic Numbering

Every epic file MUST be prefixed with a zero-padded sequence number so the epic list sorts in build order. This applies to both the filename and the title heading inside the file.

**Filename:** `epic_NN_EPIC_NAME.md`
- `NN` is a two-digit zero-padded sequence number starting at `01` (e.g. `01`, `02`, …, `09`, `10`, `11`).
- `EPIC_NAME` is uppercase with underscores, derived from the specification's subject.
- Example: `epic_01_APP_SHELL.md`, `epic_02_DATABASE_FOUNDATION.md`, `epic_03_DROPBOX_AUTH.md`.

**Title heading inside the file:** `# Epic N: <Name>`
- Use the unpadded number in the title for readability.
- Example: `# Epic 1: App Shell`, `# Epic 2: Database Foundation`.

**Epic-to-epic dependencies (`Depends On:` line):**

If this epic can only be built once another existing epic is finished, record the prerequisite as a top-level `Depends On:` line, alongside `Status:` and `Owner:`:

```
Depends On: epic_02_DATABASE_FOUNDATION, epic_03_DROPBOX_AUTH
```

Rules:
- Values are comma-separated **epic stems** (the filename without `.md`).
- Omit the line entirely if the epic has no prerequisites — the usual case in unattended mode.
- The scheduler reads this line and **will not start tickets** belonging to an epic whose dependencies aren't all at status `DONE`. Over-declaring stalls the pipeline; declare a dependency only on an epic listed in the prompt whose output this epic genuinely needs.
- The free-form §11 *Dependencies* section captures the *why*, plus external dependencies. The `Depends On:` top-line is what the machine reads.

**Numbering rules:**
- **Continue from the highest existing number.** List `docs/Epics/` and find the largest `NN` already in use; the new epic is `NN + 1`. Start at `01` if there are none.
- **Never renumber existing epics.**
- **Gaps are allowed.** If a number is missing, do not fill it.

The epic file's `## 12. References` section uses the full filename including the numeric prefix.

---

## Epic File Structure

The epic file MUST follow this structure with numbered sections:

```
# Epic N: <Name>

Status: NEW
Owner: human
Created: YYYY-MM-DD
Last Updated: YYYY-MM-DD
Depends On: epic_01_APP_SHELL   (omit the line if none)

---

## 1. Purpose
What this epic delivers and why, in terms of the reference specification.

**Working increment:** (REQUIRED) One sentence stating what can be done end to
end once this epic is DONE that could not be done before — through the real
interface of the project (UI, API, CLI, library call), against real data.

## 2. User Story
As a [role], I want [capability], So that [benefit].

## 3. Scope
- **Capabilities:** one bullet per capability the epic delivers
- **Constraints:** one bullet per rule the implementation must respect —
  compatibility, performance ceilings, conventions found in the repository,
  existing tests that must keep passing. A file-protection constraint governs
  *modifying* existing files ("existing files under X are not to be modified");
  it does not forbid adding new files alongside them.
- **Out of Scope:** …

## 4. Functional Requirements
1. FR-001 — …
2. FR-002 — …

## 5. Non-Functional Requirements
1. NFR-001 — performance / security / availability / etc.

## 6. UI/UX Notes
Key interface elements and interactions, or "None — no user interface" for
API/CLI/library work.

## 7. Data Model Impact
Entities, fields, schemas, file formats, migrations — as found in the repository.

## 8. Integration Impact
Modules, packages, services and public interfaces the work touches, with the
paths as they exist in the repository.

## 9. Acceptance Criteria
- [ ] (REQUIRED, first) The project builds and its existing test suite passes
      with `<exact command from the repository>`
- [ ] (REQUIRED, second) <the working increment from §1>, verified by
      `<command / test / request>` producing `<expected result>`
- [ ] Criterion 3 — one observable outcome, externally verifiable
- [ ] …

## 10. Risks & Unknowns
Every assumption made in this run, one bullet each, prefixed "Assumption:".
Then genuine risks and open questions the specification does not settle.

## 11. Dependencies
Other epics (with the rationale for any `Depends On:` entry) and external
dependencies — services, credentials, tooling.

## 12. References
- reference_spec: <path passed in the prompt>
- prd: docs/Product Requirements Document/PRD.md (only if present)
- architecture: docs/Architecture/Architecture.md (only if present)
- style_guide: docs/Style Guide/StyleGuide.md (only if present)
- code_map: docs/Code Map/codemap.json (only if present)

## 13. Implementation Notes
Repository facts an implementer needs: build and test commands, the modules
involved and their callers, conventions to follow. No ticket breakdown.
```

§13 must also carry this rule, verbatim:

> Before modifying a module, use `docs/Code Map/codemap.json` to answer three questions:
>
> 1. What calls it?
> 2. What does it affect?
> 3. Which tests cover it?
>
> Do NOT regenerate the code map inside a feature ticket. Mid-epic the map is expected to lag the code, and that drift is normal. If the map is missing, stale, or cannot answer the three questions, read the affected code directly and record in the ticket notes which questions it could not answer. The epic's final closeout ticket regenerates `codemap.html`, `codemap.json`, and `codemap.lock` together.

---

## Functional & Non-Functional Requirements Cross-Referencing

When the project-wide requirements matrices **already exist**, record the epic's requirements in them so they are traceable. Never create the matrix files.

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

Each requirement listed in the epic's §4 / §5 includes its FR/NFR ID — e.g. `FR-014 — User can sign in with email and password.` — whether or not a matrix file exists.

---

## Process

1. **Read the reference specification** in full, then any optional context documents the prompt names that exist on disk, then the engineering guide at `.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md`.
2. **Analyse the repository** — build system, test command, modules touched, conventions (see "Core principle"). Run the test command once if it is cheap, so §9's first criterion states a command that is known to pass today; if it fails today, record that in §10.
3. **Determine the number and name** — list `docs/Epics/`, take the highest `NN` + 1, derive `EPIC_NAME` from the specification's subject. Check the existing epics listed in the prompt for overlapping scope; if there is overlap, narrow this epic to what is not yet covered and note it in §10.
4. **Print the summary** — title, working increment, capabilities, constraints, acceptance criteria. Do not pause.
5. **Write** `docs/Epics/epic_NN_<NAME>.md` using the structure above, with today's date in `Created:` and `Last Updated:`.
6. **Append matrix rows** for §4/§5 requirements — only to matrix files that already exist.
7. **Verify** the epic file exists on disk and its title, number and `Status: NEW` line are correct.
8. **Commit** — see below — unless the prompt says not to.
9. **Finish** with `DONE - EPIC WRITTEN docs/Epics/epic_NN_<NAME>.md` as the last line, or `FAILED - NO EPIC WRITTEN`.

Do NOT create backlog tickets — that is the Ticket Generation skill's job, run separately by the caller.

---

## Commit what you wrote — agents cannot see uncommitted files

Implementation, test and eval agents run inside **git worktrees**, which contain committed content only. An epic that exists solely in the working tree is invisible to them, and the eval stage silently falls back to the ticket's inline acceptance criteria — so the epic never governs the build.

Unless the prompt says not to commit, the final step is always:

```bash
git add "docs/Epics/epic_NN_<NAME>.md" \
        "docs/Functional Requirements/FunctionalRequirements.md" \
        "docs/Non-Functional Requirements/NonFunctionalRequirements.md"
git commit -m "docs: add epic_NN_<NAME>"
```

Rules:

- Stage **only the files this session wrote or edited**. Never `git add -A` or `git add .`.
- Drop the matrix paths from the `git add` if this session did not touch them.
- If the commit fails — not a git repo, a hook rejects it, nothing staged — the epic is still written: say so explicitly on the lines above the marker and still emit `DONE - EPIC WRITTEN` with the path. Only a missing file is a failure.
