---
system: true
---

# Epic Refinement

## Overview

This skill guides AI coding agents in working with **one epic at a time** — either refining an existing epic file or proposing a single new epic to add to a project that already has an epic set in place.

It is the natural companion to **Epic Generation**: that skill is for breaking a fresh PRD into the initial epic set; this skill is for everything after, when scope changes, gaps emerge, or an existing epic needs tightening up.

The output of this skill is:
1. Edits to a single existing epic file in `docs/Epics/`, **or**
2. A single new epic file added to `docs/Epics/`, with the next available numeric prefix.
3. Corresponding updates to `docs/Functional Requirements/FunctionalRequirements.md` and `docs/Non-Functional Requirements/NonFunctionalRequirements.md` only for *new* requirements introduced by your edits — never renumber or remove existing rows.

You are working with a human collaborator. **Be conversational and propose before writing.**

---

## When to Use This Skill (Two Modes)

### Mode A — Refine an existing epic

The user has selected one epic and wants to improve it. Typical reasons:
- Acceptance criteria are vague or missing.
- Scope has drifted (in/out lists no longer match reality).
- A dependency on another epic was discovered.
- FR/NFR cross-references are stale or absent.
- The original epic was too large and should be split.

### Mode B — Add a single new epic

The user has an existing epic set and wants to add one more. Typical reasons:
- A new feature emerged from feedback that doesn't fit any current epic.
- A foundational piece (auth, observability, migration) was originally missed.
- The PRD was updated and a new milestone is now in scope.

---

## Guidelines

- **Work on exactly one epic per session.** If the user describes work that spans more than one epic, surface that and ask whether it should be one larger epic or split into two — don't silently expand scope across multiple files.
- **Read first, write last.** Always read the source documents (PRD, Architecture, Data Model, Style Guide if linked) and the existing epic files before proposing changes. Stale assumptions about what's already in scope cause duplicated or contradictory epics.
- **Propose every significant edit before writing.** Show a diff-style summary ("changing §3 In Scope from X to Y", "adding criterion: …") and ask the user to confirm or revise. Small wording fixes are fine to apply directly; structural changes (new sections, new criteria, new dependencies) need confirmation.
- **Never renumber existing epics.** If you discover a logical re-ordering, leave numbering alone — renumbering breaks ticket `epic_ref` links and orphans FR/NFR matrix rows. Note your observation for the user instead.
- **Never change an epic's `Status:` field** without the user explicitly asking. Status is driven by the workflow (NEW → TICKETS → BUILDING → DONE) and your job is content, not workflow.
- **Preserve the 13-section structure** from the Epic Generation skill. If a section is empty in the existing file, fill it; don't reorder or rename sections.

---

## Mode A — Refining an Existing Epic (Process)

1. **Read the epic file** the user has opened. Note its current `Status:`, numeric prefix, title, and which sections are filled vs empty.
2. **Read the source documents** (PRD plus any linked Architecture / Data Model / Style Guide). These tell you what the epic *should* deliver.
3. **Read sibling epic stems** in `docs/Epics/` (filenames only; you don't need full content unless verifying overlap). This prevents proposing scope that belongs in another epic.
4. **Ask the user what they want refined**, unless they've told you up front. Useful prompts:
   - "I see §9 Acceptance Criteria is sparse — should I propose a fuller checklist based on the requirements in §4?"
   - "The epic doesn't list any dependencies. Looking at the PRD it seems to need `epic_02_DATABASE_FOUNDATION` — should I add that to the `Depends On:` line?"
   - "Is there anything specific you'd like me to focus on, or should I do a general structural review?"
5. **Propose a list of targeted edits** (numbered, with section references). Wait for confirmation. Iterate.
6. **Apply confirmed edits** to the file. Update `Last Updated:` to today's date.
7. **Touch FR/NFR matrices only for new requirements** you've added — append rows with the next sequential ID. Never remove or renumber existing rows; reword them only with explicit permission.
8. **Report back** with a concise summary of what changed, organised by section.

---

## Mode B — Adding a Single New Epic (Process)

1. **Read the source documents** (PRD plus any linked context). Understand what the project as a whole is supposed to deliver.
2. **List the existing epic stems** in `docs/Epics/` and read their titles/purposes (§1) to understand current coverage.
3. **Identify the gap** the new epic should fill, and confirm with the user before writing anything:
   - "Looking at the PRD and the existing epics, I see no epic covering [X]. Is that what you'd like the new epic to address, or did you have something else in mind?"
4. **Determine the next numeric prefix** by finding the highest existing `epic_NN_` and adding one. Zero-pad to two digits.
5. **Propose a summary** of the new epic: title, one-line purpose, in/out scope at a glance, likely dependencies, ticket-count estimate. Ask the user to confirm or revise.
6. **Write the epic file** at `docs/Epics/epic_NN_<NAME>.md` using the 13-section structure from the Epic Generation skill. Start with `Status: NEW`.
7. **Cross-reference FR/NFR** by appending rows to the matrices for any requirements the new epic introduces. Use the next sequential IDs; do not renumber.
8. **Report back**: the new filename, its prefix, and the FR/NFR IDs that were added.

---

## What This Skill Does NOT Do

- It does not break a PRD into an initial epic set. Use **Epic Generation** for that.
- It does not generate implementation tickets from an epic. Use **Ticket Generation** for that.
- It does not change `Status:` values. The workflow does that.
- It does not delete epics or files. Ask the user to delete files manually if they want to remove an epic.

---

## Reference

For the exact epic file structure, section list, numbering rules, FR/NFR matrix format, and `Depends On:` semantics, see [`Epic Generation`](./Epic%20Generation.md) — this skill follows the same conventions; the difference is *scope of work per session*, not output format.
