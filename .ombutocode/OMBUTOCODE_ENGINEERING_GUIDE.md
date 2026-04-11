# AI Engineering Operating Model

This repository is designed to be developed collaboratively by humans and AI coding agents.

All agents working in this repository MUST follow this document.

Agents MUST treat this document as a system-level instruction.

Failure to follow this workflow is considered a task error.

---

## 1. Source of Truth

Priority order:

1. `.ombutocode/data/ombutocode.db` (backlog_tickets table) ← CANONICAL task list
2. docs/Epics/  ← Epic specifications (one file per epic)
3. docs/architecture/architecture.md
4. .ombutocode/src/

### Repository Structure

```
.ombutocode/
├── planning/
│   └── archive.db             # Archived tickets (gitignored)
├── data/
│   ├── requests.db            # Requests database (gitignored)
│   └── ombutocode.db            # Consolidated database — backlog lives here (gitignored)
├── templates/
│   ├── backlog.yml            # Template for backlog ticket entries
│   └── epic.md                # Template for epic specifications
├── codingagents/
│   └── codingagents.yml       # Agent tool config
├── logs/                      # Run audit logs (gitignored)
├── run-output/                # stdout/stderr logs (gitignored)
├── tools/                     # CLI tools for agents
│   ├── tools.json             # Tool manifest (read this first)
│   ├── db-query.js            # Database query tool (Node.js)
│   └── svg-to-png.js          # SVG to PNG converter (Node.js + sharp)
└── OMBUTOCODE_ENGINEERING_GUIDE.md  # This file

docs/
└── architecture/
    └── architecture.md        # System architecture document
```

### Agent Tools

CLI tools are available at `.ombutocode/tools/`. Read `.ombutocode/tools/tools.json` for the full manifest.

**Database queries:** Use `node .ombutocode/tools/db-query.js` instead of Python or sqlite3. This tool uses the bundled sql.js package and requires no additional dependencies.

Common commands:
```bash
node .ombutocode/tools/db-query.js tickets              # List all tickets
node .ombutocode/tools/db-query.js tickets --status todo # Filter by status
node .ombutocode/tools/db-query.js ticket AUTH-001       # Single ticket detail
node .ombutocode/tools/db-query.js stats                 # Ticket counts by status
node .ombutocode/tools/db-query.js epics                 # List epics
node .ombutocode/tools/db-query.js tables                # List DB tables
```

Agents MUST NOT invent epics that are not present in the backlog.

If a discrepancy is found:
→ STOP and ask for clarification.

### Worktree Integrity Rule

The `.ombutocode/` directory is part of the repository contract for agent execution.
Worktrees created for ticket execution MUST contain the required `.ombutocode/` files,
including this guide, planning references, epic specs, and agent configuration.

Lesson learned:
- If `.ombutocode/` is excluded in `.gitignore`, git worktrees will not contain it.
- When that happens, agents fail early because their declared source of truth is missing.
- Do not ignore the top-level `.ombutocode/` directory.

Required `.gitignore` rule:

```gitignore
.ombutocode/src/node_modules/
```

Rule:
- Track `.ombutocode/` by default.
- Ignore only generated or dependency directories inside `.ombutocode/`, not the entire folder.
- If additional runtime-only files under `.ombutocode/` need to be excluded later, ignore them explicitly by path.

---

## 2. Mandatory Workflow

Agents operate in TWO distinct modes:

### Planning Mode
Triggered when the backlog has no tickets or epic specs change.

Steps:

1. Read the relevant epic spec in docs/Epics/
2. Generate atomic tickets (1–4 hours of work)
   - When creating tickets, planners SHOULD separate backend-focused and frontend-focused work into distinct tickets whenever practical.
   - Only combine backend and frontend changes in one ticket when the work is tightly coupled and cannot be validated independently.
3. Write/update the backlog in the database (using .ombutocode/templates/backlog.yml for field reference)
   - New tickets MUST be created with `status: backlog`
   - New tickets MUST have `assignee: null` (unassigned) unless the user explicitly specifies an assignee
   - Tickets are promoted to `todo` manually by a human when ready for execution
4. DO NOT implement code

Planning-mode language rule:
- If the user asks to "develop a feature" or "build a feature", treat this as planning/specification work only.
- Do not implement code unless the user explicitly asks for implementation.

---

### Execution Mode (Default)

1. Select exactly ONE ticket with:
   - status: todo
   - no unmet dependencies (a dependency in status `review` is considered met and does not block execution)
   - DO NOT pick up tickets in any other status (`backlog`, `in_progress`, `review`, `done`, `blocked`)

Before marking a ticket `in_progress`, agents MUST re-read the backlog and verify the selected ticket is still `todo`.
If the status is not `todo`, STOP and select a different eligible ticket.

2. Mark it:
   status: in_progress

`Pickup` command rule (explicit):
- If a user says "pickup <ticket-id>" (or equivalent), agents MUST both:
- move the ticket to `in_progress`, and
- execute the ticket implementation work in the same turn (not status-only).

3. Produce a short implementation plan.

4. Implement ONLY what is required for that ticket.

5. Update the backlog ticket:
   - status → eval
   - files_touched
   - notes

Note: When agents are launched by the Ombuto Code scheduler, the scheduler
handles status transitions automatically. Agents invoked manually should
update ticket fields directly.

Status transition rule (strict):
- `todo` → `in_progress` when work starts
- `in_progress` → `eval` when implementation is complete and checks are finished
- `eval` → `review` only after evaluation passes
- `eval` → `todo` when evaluation fails (with failure reason documented in ticket notes)
- Agent run metadata (for example `agent.state: completed`) does NOT replace ticket workflow status
- A ticket MUST NOT remain `in_progress` solely because an agent process ended

### Evaluation Responsibility (EVAL)

Tickets in `eval` are owned by an evaluation agent workflow.

The evaluation agent MUST:

1. Re-read the ticket acceptance criteria from the backlog
2. Re-read the referenced epic spec in `docs/Epics/` when `epic_ref` is present
3. Run relevant validation (tests/build/manual checks as appropriate)
4. Decide pass/fail against the ticket's stated requirements

Evaluation outcomes:

- Pass: move `eval` → `review` and add notes summarizing evidence
- Fail: append clear failure reason(s) to notes and move `eval` → `todo`

6. STOP after completing the ticket.

Agents MUST NOT automatically begin another ticket.

---

## 3. Scope Control (CRITICAL)

If new work is discovered:

✅ CREATE a new ticket  
❌ DO NOT expand the current ticket  

Uncontrolled scope expansion is a task failure.

---

## 4. Ticket Size Rules

Tickets must be:

✅ Independently deployable
✅ Testable
✅ Small

Target: 1–4 hours of human work.

If a ticket is too large:
→ split it.

---

## 4a. Dependency & Conflict Prevention

Parallel tickets that modify the same files cause repeated merge failures, even when
the features are semantically independent. The following rules MUST be applied during
ticket breakdown to prevent this.

### Identify Scaffolding Files

Some files are structurally coupled — every new feature must add code to shared
sections (imports, globals, init/shutdown, registration). These are **scaffolding files**.

Common examples in this repository:
- `ombuto_api.pyx` — imports, globals, `ombuto_init()`, `ombuto_shutdown()`
- `ombuto_api.pxd` — public declarations
- `conftest.py` — ctypes signature registration
- `ombutocode.db` (backlog_tickets table) — ticket metadata

During ticket breakdown, explicitly list which scaffolding files each ticket will touch.

### Chain Tickets That Touch the Same Scaffolding Files

If two or more tickets modify the same scaffolding file, they MUST be serialised
with `depends_on` links so they merge one at a time:

```
Ticket A  →  Ticket B  →  Ticket C
            depends_on: A  depends_on: B
```

Do NOT allow parallel tickets that both add to `ombuto_init()`, `ombuto_shutdown()`,
or similar shared sections — automated merge will fail.

### Prefer More, Smaller Tickets

When in doubt, split further. A ticket that only adds one domain (e.g. budget CRUD)
to the scaffolding file is easier to merge than a ticket that adds three domains at once.

Guideline: if a ticket touches more than one scaffolding file AND introduces more than
one conceptual domain, it should be split.

---

## 5. Definition of Done

A ticket is only complete when:

- Acceptance criteria are satisfied
- Tests exist (if applicable)
- Documentation updated
- Backlog ticket updated in the database

For agent-invoked tickets, "backlog updated" specifically includes:
- ticket `status` set to `eval` when implementation is complete
- `agent` metadata updated with run outcome (`completed` or `failed`)
- notes include a short verification summary

---

## 6. Forbidden Behaviors

Agents MUST NOT:

- Rewrite large portions of the codebase without a ticket
- Introduce new frameworks without approval
- Perform broad refactors without a refactor ticket
- Guess architectural intent

When uncertain:
→ ASK.

---

## 7. Preferred Engineering Behavior

Agents should behave like senior engineers:

- Make minimal, precise changes
- Preserve existing patterns
- Prefer clarity over cleverness
- Avoid over-engineering
