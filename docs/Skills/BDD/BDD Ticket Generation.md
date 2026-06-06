---
system: true
---

# BDD Ticket Generation

## Overview

This skill generates implementation tickets from a **single BDD Use Case** file in `docs/BDD Use Cases/`. It is the lighter-weight counterpart of the standard **Ticket Generation** skill (which breaks down a whole epic). Use this when the source of truth is one focused user story rather than a multi-capability epic.

Outputs: a small batch of tickets (typically **1–3, not 3–8**) inserted into the backlog database, plus the BDD Use Case's `Status:` flipped from `NEW` to `TICKETS`.

---

## Differences from Ticket Generation

| | Standard Ticket Generation | BDD Ticket Generation |
|---|---|---|
| Source file | One epic (`docs/Epics/epic_NN_*.md`) | One BDD UC (`docs/BDD Use Cases/bdd_*.md`) |
| Tickets per source | 3-8 | 1-3 |
| ID prefix | Derived from epic name (4-6 letters) | Derived from BDD UC short name |
| Closeout tickets | 3 mandatory (epic-eval, regression, docs) | 1 mandatory (BDD-eval), no separate regression / docs |
| FR / NFR cross-reference | Yes | No (BDD UCs don't carry FR/NFR sections) |

Everything else — `id`, `title`, `status: backlog`, `assignee: null`, `references`, `acceptance_criteria`, `dependencies`, `notes` — is identical to the standard skill, and so are the ticket-write tool and database mechanics.

---

## Guidelines

- **Read the BDD UC in full** before proposing tickets. Each acceptance scenario typically maps to one or two acceptance criteria in the implementing ticket(s).
- **Read the engineering guide** (`.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md`) and the rest of the **Ticket Generation** skill for the ticket field shape, the canonical `ticket-write` workflow, and the database schema.
- **One ticket per concrete deliverable.** Common splits:
  - Backend / model / persistence ticket
  - UI / interaction ticket
  - Integration / wiring ticket
  Sometimes a single ticket covers all three for a small BDD UC — that's fine.
- **Never exceed 3 implementation tickets** for one BDD UC. If you need more, the BDD UC is too big — surface this to the user and offer to either split the BDD UC or escalate to a proper Epic.
- **No FR / NFR matrix updates.** BDD UCs intentionally don't carry those sections — if a non-functional concern is genuinely relevant, file it as a separate ticket against the relevant epic instead.

---

## Closeout Ticket (one, not three)

Every BDD UC ticket set MUST end with **one** closeout ticket:

```
title: "Evaluate BDD UC scenarios end-to-end"
dependencies: [all preceding tickets for this BDD UC]
acceptance_criteria:
  - [ ] Walk every acceptance scenario in the source BDD UC against the actual implementation
  - [ ] For each scenario, verify Given/When/Then behaviour matches exactly; flag deviations
  - [ ] Add an end-to-end test covering at least the happy path in the project's existing test suite (no new test framework)
  - [ ] If any scenario fails, raise a new ticket with the failure repro rather than silently fixing in this one
notes: "This is the safety net before the BDD UC's Status flips to DONE. Stricter than per-ticket auto-eval — verify against scenarios, not just per-ticket criteria."
```

(No separate regression-tests or help-docs closeout tickets. BDD UCs are small enough that the eval ticket covers the regression test, and help docs updates can ride on a related epic's docs closeout if the project also uses epics — or be skipped for very small projects.)

---

## ID Prefix Convention

Use the BDD UC's `<SHORT_NAME>` (the uppercase part after `bdd_` in the filename) as the prefix. Examples:

- File: `bdd_CREATE_BINDER.md` → IDs: `CREATE_BINDER-001`, `CREATE_BINDER-002`, …
- File: `bdd_SEARCH_PROMPTS.md` → IDs: `SEARCH_PROMPTS-001`, …

If the short name is long, shorten to a 4-8 letter mnemonic when proposing the prefix to the user, e.g. `bdd_CREATE_BINDER.md` → `CRBIND-001`. Confirm the chosen prefix with the user before writing.

Sequence numbers restart at 001 within each BDD UC's prefix.

---

## Workflow

1. **Read** the BDD UC file completely.
2. **Check existing tickets** — `node .ombutocode/tools/db-query.js tickets` — to avoid id collisions.
3. **Propose a summary table** with: ID, Title, Type, Dependencies, including the closeout eval ticket as the final row. Maximum 4 rows total (3 impl + 1 eval).
4. **Wait for user confirmation.**
5. **Insert** the tickets via `node .ombutocode/tools/ticket-write.js insert /tmp/<bdd>-tickets.json`. Each ticket's `epic_ref` field should point at the BDD UC file (e.g. `epic_ref: docs/BDD Use Cases/bdd_CREATE_BINDER.md`) — the backlog reads `epic_ref` as "source spec", and the BDD UC fills that role for ticket purposes.
6. **Verify** with `node .ombutocode/tools/db-query.js tickets --status backlog`.
7. **Update** the BDD UC's `Status:` line from `NEW` to `TICKETS`.

---

## Example Proposal

For `bdd_CREATE_BINDER.md`:

| # | ID | Title | Type | Depends On |
|---|---|---|---|---|
| 1 | CRBIND-001 | Add binder model and create-binder API endpoint | Core | — |
| 2 | CRBIND-002 | Build New Binder modal with name validation and submit | UI | CRBIND-001 |
| 3 | CRBIND-003 | Wire creation into the binder list view | Integration | CRBIND-002 |
| 4 | CRBIND-004 | Evaluate BDD UC scenarios end-to-end | Closeout — BDD Eval | CRBIND-001, CRBIND-002, CRBIND-003 |

Confirm the prefix `CRBIND` and the four-ticket breakdown with the user, then write to the database.

---

## References

- `.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md` — ticket workflow and conventions
- `docs/Skills/Ticket Generation.md` — full Ticket Generation skill (canonical field shape, ticket-write usage, db-query usage)
- `.ombutocode/tools/ticket-write.js` — canonical ticket insert tool
- `.ombutocode/tools/db-query.js` — canonical read-only query tool
