---
system: true
---

# Bootstrap Prototype

## Overview

This skill takes an **existing prototype** — a folder of working code the user built or generated outside this project — and folds it into the repository as the **first increment of the real application**. It is the evolutionary-prototyping path: the prototype is not thrown away and re-specified, it becomes the seed of the product.

It is **user-triggered** from the Plan → Bootstrap Prototype menu and runs as an **interactive session**. It is safe to re-run, but re-runs should be rare — this is a one-time transition from "prototype on disk" to "prototype living in the repo".

After this skill runs, the project should be in a state where:
- The prototype's behaviour, UI, and interaction model are reproduced in the repository — **as faithfully as the architecture allows**.
- The code sits in the directory layout the architecture document prescribes, using the architecture's language, framework, and package manager.
- Dependencies the prototype needs are declared in the project's manifest and installed.
- The application **builds and runs**, and the user has confirmed with their own eyes that it behaves like the prototype.
- Every place the prototype was deliberately deviated from is written down, so downstream epics inherit the reasoning rather than re-litigating it.

This is **not** an epic-generation skill. It does not create files in `docs/Epics/` and does not write to the backlog.

### Relationship to Initiate Stack

`Initiate Stack` establishes the empty skeleton (source tree, dependencies, `.gitignore`, test strategy). `Bootstrap Prototype` puts the first real code inside it.

- If **Initiate Stack has already run**, work inside the layout it created. Do not re-scaffold.
- If it **has not run**, say so and offer to do the minimum scaffolding needed to host the prototype — but recommend the user run Initiate Stack first, since it also writes `docs/Test Strategy/test-strategy.md`.

---

## Inputs (mandatory reading before you do anything)

1. **The prototype folder** — the path is given to you in the session prompt. Read it thoroughly before touching the repository.
2. **`docs/Architecture/*.md`** — the chosen stack, components, layering rules, deployment target, data store. This is the constraint set.
3. **`docs/Product Requirements Document/*.md`** (if present) — what the product is actually for.
4. **`docs/Style Guide/*.md`** (if present) — naming and formatting conventions the ported code must follow.
5. **`.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md`** — project conventions.

**Never modify anything inside the prototype folder.** It is a read-only reference. All writes go into the repository.

---

## The governing principle

> **Stay as true to the prototype as possible, while respecting the constraints in the architecture document.**

The prototype is the specification of *behaviour and experience*. The architecture is the specification of *structure and technology*. When they agree, copy the prototype. When they collide, the architecture wins on structure and technology — but you must preserve the prototype's observable behaviour through whatever structure the architecture demands, and you must tell the user about every such collision.

Concretely:

| Aspect | Source of truth |
| --- | --- |
| Screens, layout, visual design, copy | Prototype |
| User flows, interaction, keyboard/mouse behaviour | Prototype |
| Business rules, calculations, validation | Prototype |
| Sample/seed data and fixtures | Prototype |
| Language, framework, runtime version | Architecture |
| Directory layout, module boundaries, layering | Architecture |
| State management, data access, persistence approach | Architecture |
| Build tooling, package manager, test framework | Architecture |
| Security, auth, logging, config conventions | Architecture |

**Do not "improve" the prototype while porting it.** No renamed labels, no re-flowed layouts, no extra features, no removed rough edges — unless the architecture forces it, or the user asks. Improvements are follow-up tickets. A faithful port the user recognises is the deliverable.

---

## Process

### Step 0 — Inventory both sides (MANDATORY first action)

Before writing anything, take inventory and report it to the user in plain prose.

**The prototype:**
- What is it built with? (framework, language, build tool — read its manifest: `package.json`, `index.html`, `*.csproj`, `requirements.txt`, …)
- How is it run? Find its dev/build/start command.
- What are its entry points, screens/routes, and components?
- What data does it use — hard-coded, fixtures, a local file, a live API?
- What third-party libraries does it depend on, and what does each one do for it?
- Is it a single-file mockup, a full SPA, a design-tool export, or a working end-to-end app?

**The repository:**
- Has Initiate Stack run? Is there a source tree and a manifest?
- What does the architecture say the stack is?
- Is there existing application source that the prototype would collide with?

### Step 1 — Report the fit, then confirm with the user

State clearly:
1. What the prototype is and what it does.
2. What the architecture requires.
3. **The delta** — every point where the prototype's technology or structure does not match the architecture, and what you propose to do about each.

Classify each delta as one of:
- **Direct port** — same stack, drops in with only path/layout changes.
- **Translation** — different framework or language; behaviour is reproduced, code is rewritten.
- **Restructure** — same technology, but the code must be split/moved to satisfy the architecture's layering.
- **Conflict** — the prototype does something the architecture forbids (e.g. calls a database straight from the UI). Propose the smallest change that satisfies the architecture while preserving observable behaviour.

Then **stop and ask the user to confirm the plan.** Do not write any code until they have. If the architecture is silent or ambiguous on something the prototype needs, ask rather than guessing.

### Step 2 — Port the prototype

Work in visible increments, narrating what you are doing:

1. Bring across static assets first — images, fonts, icons, CSS/tokens, sample data. These are pure fidelity and rarely conflict.
2. Port the shell — app entry point, routing, top-level layout.
3. Port screen by screen, in the order the user would encounter them. Keep the prototype open beside you and match it element by element: text, spacing, colours, ordering, empty states, error states.
4. Port the logic behind each screen into whichever layer the architecture designates.
5. Port the prototype's seed/sample data so the running app looks like the prototype on first launch.

Rules while porting:
- Prefer copying the prototype's own markup/styles verbatim over re-authoring them, whenever the target stack can accept them.
- Keep the prototype's naming for user-facing strings exactly. Internal identifiers may be renamed to match the style guide.
- If the prototype has dead code, unused files, or half-built screens, leave them out and list what you skipped.
- Add each dependency the port genuinely needs to the project manifest — do not vendor copies of libraries.
- Do not add tests for ported behaviour in this session unless the user asks; the port is the deliverable, and test coverage follows in epic tickets against `docs/Test Strategy/test-strategy.md`.

### Step 3 — Build and install

- Run the project's install command for any dependency added (`npm install`, `dotnet restore`, `pip install -r requirements.txt`, …).
- Run the build. Fix build errors caused by the port.
- If the build fails for a reason rooted in the architecture's stack choice rather than your port, stop and surface it to the user — do not work around the architecture on your own initiative.

### Step 4 — Run it for the user (MANDATORY — you are not done until this passes)

You must actually launch the application and hand it to the user for verification.

1. Start the app with the project's run command (`npm run dev`, `dotnet run`, `python -m <pkg>`, …).
2. Report the exact URL or window to look at, and the command you used.
3. Walk the user through what to check: each screen the prototype had, the main flow, the sample data.
4. **Ask them explicitly: "Does this match your prototype?"** and wait.
5. If they report differences, fix them and re-run. Repeat until they confirm. Fidelity gaps found here are the whole point of this step — treat each one as a defect in the port, not as a preference to debate.
6. When the user confirms, **shut down the dev server / running app** before continuing. Leaving it running holds file handles and blocks later automation.

### Step 5 — Write the port record

Create or update `docs/Architecture/prototype-port.md` with:
- The prototype's original location and what it was built with.
- A screen-by-screen / module-by-module map: prototype file → repository file.
- **Every deviation from the prototype**, with the architectural constraint that forced it.
- Anything deliberately not ported, and why.
- The build and run commands verified in Step 4.
- Known gaps or rough edges that should become follow-up tickets.

This document is how downstream epics learn what is intentional. Without it, a later agent will "fix" a deliberate deviation.

### Step 6 — Commit

Commit the ported code and the port record as a single clear commit, e.g.
`Bootstrap application from prototype (<prototype name>)`.

Then report to the user:
- What was ported and where it landed.
- The deviations list (short form).
- The verified build and run commands.
- Suggested follow-up tickets for the gaps — **describe them, do not create them.** Ticket creation is a separate flow.

---

## Guardrails

- **Read-only prototype.** Never write to, move, or delete anything in the prototype folder.
- **No scope expansion.** Features the prototype does not have do not get added here, however obvious they seem.
- **No silent deviation.** Every difference between the prototype and the port is either confirmed by the user or recorded in `prototype-port.md`. Preferably both.
- **No epics, no tickets, no backlog writes.**
- **No new frameworks.** If the port seems to need a library the architecture does not mention, ask first.
- **Release long-lived processes.** Any dev server, watcher, or build daemon you start must be stopped before the session ends.
