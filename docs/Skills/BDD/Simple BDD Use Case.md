---
system: true
---

# Simple BDD Use Case

## Overview

This skill guides a human collaborator through writing a **BDD Use Case** — a small, behaviour-focused user story plus a handful of Gherkin-style acceptance scenarios. It is the lighter alternative to the formal Use Case document (`UC-001`-style template) and the heavyweight Epic.

A BDD Use Case is meant to describe **one user-facing capability** at a granularity where it can be implemented in roughly 1-3 tickets. Think "Create a Binder", "Search saved prompts", "Export a conversation" — not "Authentication subsystem".

When this skill runs you are working interactively with a human. **Ask one targeted question at a time, write the file incrementally as answers come in, and confirm before each section is committed to disk.**

---

## When to use a BDD Use Case vs an Epic

- **BDD Use Case** (this skill): one concrete user action, 1-3 tickets, no FR/NFR cross-references, no scope/in-scope/out-of-scope sections. Optimised for speed.
- **Epic** (Epic Generation skill): a feature area covering multiple related capabilities, 3-8 tickets, full 13-section structure with dependencies and FR/NFR matrices.

If the user describes work that doesn't fit in one BDD Use Case, surface that and offer to either split into multiple BDD UCs or escalate to a proper Epic.

---

## Output Format

Write to `docs/BDD Use Cases/bdd_<SHORT_NAME>.md`, where `<SHORT_NAME>` is an uppercase mnemonic of the action (e.g. `CREATE_BINDER`, `SEARCH_PROMPTS`, `EXPORT_CONVERSATION`).

The file MUST follow this structure exactly — future Ticket Generation reads it and expects these sections:

```
# BDD UC: <Title>

Status: NEW
Owner: human
Created: YYYY-MM-DD
Last Updated: YYYY-MM-DD

---

## Story

As a <role>
I want <capability>
So that <outcome / business value>

---

## Acceptance Scenarios

### Scenario 1: <happy path summary>
Given <precondition>
When <action>
Then <observable outcome>
And <additional observable outcome>

### Scenario 2: <alternative or error case>
Given ...
When ...
Then ...

(Aim for 2-5 scenarios — happy path, one or two important alternatives, key error case. Resist the urge to enumerate every edge case; the implementation tickets will surface those.)

---

## Notes

Free-text section for anything the implementer needs that doesn't fit in the
scenarios — references to specific UI elements, data constraints, links to
related BDD UCs or epics, etc. Keep it tight.

---

## References

- prd: docs/Product Requirements Document/PRD.md
- architecture: docs/Architecture/Architecture.md
- style_guide: docs/Style Guide/StyleGuide.md (if present)
```

The `Status:` line follows the lifecycle `NEW → TICKETS → BUILDING → DONE`, identical to epics. The Ticket Generation step flips it to `TICKETS`; the scheduler / closeout tickets carry it through the rest.

---

## Process

1. **Read the PRD** (and Architecture if helpful) to anchor terminology. Don't quote them, just internalise the vocabulary so your acceptance scenarios match the product language.

2. **Ask the user for the one-line capability** — the verb + object that this BDD UC represents. Example exchange:
   > Agent: "What's the single user-visible capability this BDD UC describes?"
   > User: "Creating a new binder."

3. **Propose the Story (As-A / I-Want / So-That)** based on the answer and the PRD's personas. Show it back to the user. Iterate once if needed.

4. **Propose the first happy-path scenario.** Ask for confirmation, then move to the next.

5. **Ask "any important alternative or error scenarios?"** Add them. Stop at 5 max — defer the rest to ticket-level testing.

6. **Show the full draft.** Ask for confirmation. Edit anything the user pushes back on.

7. **Write the file** to `docs/BDD Use Cases/bdd_<NAME>.md` with `Status: NEW`.

8. **Report back**: the filename, the title, and a one-line summary of what it covers.

---

## Guidelines

- **Use the user's words** for actions and objects. If they say "binder" don't translate to "container"; if they say "save" don't translate to "persist".
- **Scenarios are observable**, not implementation-detail. *"A new row appears in the binder list"* is observable; *"a new row is inserted in the `binders` table"* is not.
- **One BDD UC = one capability**. If you find yourself writing scenarios for two distinct user actions, split into two BDD UCs.
- **Don't pad**. A 5-scenario, 30-line BDD UC is the goal, not the floor. Three scenarios is fine if that's enough.
- **Don't number the BDD UC files**. Unlike epics, BDD UCs don't carry an ordering — they're independent units of behaviour. The `<SHORT_NAME>` is the identifier.

---

## Anti-patterns to avoid

- Writing more than ~5 scenarios — that's epic territory, redirect.
- Using technical jargon in scenarios ("the API returns a 201") — keep them user-facing.
- Repeating PRD content verbatim — the scenarios should ADD specificity, not restate the brief.
- Inventing constraints the user didn't ask for ("scenario: handles 10,000 binders without lag") — those go in NFRs or performance tickets, not BDD UCs.

---

## Worked Example

```
# BDD UC: Create a Binder

Status: NEW
Owner: human
Created: 2026-05-23
Last Updated: 2026-05-23

---

## Story

As an application user
I want to create a new binder
So that I can group and manage LLM interactions

---

## Acceptance Scenarios

### Scenario 1: Create a binder with a unique name
Given I am on the main view with no binder selected
When I click "New Binder" and enter "My First Binder"
Then a binder called "My First Binder" appears at the top of the binder list
And the new binder is selected
And the conversation pane is empty and ready for input

### Scenario 2: Reject duplicate binder names
Given a binder called "Notes" already exists
When I click "New Binder" and enter "Notes"
Then I see an error message: "A binder with this name already exists"
And the binder list is unchanged
And no new binder is selected

### Scenario 3: Trim leading and trailing whitespace
Given I am on the main view
When I click "New Binder" and enter "   Drafts   "
Then a binder called "Drafts" is created (no surrounding whitespace)

### Scenario 4: Reject empty name
Given I am on the main view
When I click "New Binder" and leave the name field empty
Then the Create button is disabled until I type at least one non-whitespace character

---

## Notes

The "New Binder" affordance is the `+` icon in the binder list header. Empty
state shows the same affordance enlarged in the centre of the binder list pane.

---

## References

- prd: docs/Product Requirements Document/PRD.md
- architecture: docs/Architecture/Architecture.md
```

That's the full BDD UC. Five sections, four scenarios, fits on a screen. Ticket generation from this file would propose 1-3 tickets (e.g. *"Implement binder model + creation API"*, *"Add New Binder modal and form validation"*, *"Wire creation into the binder list view"*).
