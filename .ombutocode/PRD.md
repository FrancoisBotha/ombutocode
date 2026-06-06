# Ombuto Code — Product Requirements Document

Status: LIVING
Last Updated: 2026-06-06

## 1. Overview

Ombuto Code is an **Agentic Software Engineering Workbench** — an Electron desktop
application that supports the full development lifecycle of a software project:
from requirements definition and solution architecture, through automated
AI-driven development, to validation and review.

It treats **requirements as first-class citizens of the codebase**: all planning
documents live in a `docs/` directory at the project root, versioned by the same
git history as the source code. Tool configuration and runtime data live in a
`.ombutocode/` directory alongside it.

## 2. Vision

A single tool where a developer (or small team) can take a product idea from a
blank repository to working, tested software — with AI coding agents doing the
bulk of the implementation work under structured, reviewable human direction.
The human plans and reviews; the agents build.

## 3. Target Users

- **Solo developers / indie builders** who want to multiply their output by
  orchestrating AI coding agents instead of writing every line themselves.
- **Technical product owners** who can express requirements precisely and want
  a repeatable pipeline from spec to implementation.
- **Small engineering teams** adopting agentic workflows that still demand
  human review gates, traceability, and documents that live in git.

## 4. Goals

1. **Plan before build** — every project starts from a PRD and Architecture,
   decomposed into epics and well-scoped tickets before any agent writes code.
2. **Autonomous execution with guardrails** — a scheduler assigns agents to
   tickets and drives them through implementation, test, and evaluation phases
   with retry limits and explicit human review.
3. **Traceability** — every ticket links back to an epic; epics link to the PRD,
   requirements tables, and mockups. Documents and code share one git history.
4. **Agent-agnostic** — support multiple CLI coding agents (Claude, Codex, Kimi)
   behind a uniform configuration, with per-ticket assignment.
5. **Low setup friction** — `create-ombutocode` scaffolds a new project;
   `initombuto` seeds starter documents, skills, and a clean database.

## 5. Product Structure

The application has three modes, presented as sidebar tabs:

### 5.1 Plan
Structured requirements engineering. Key pages:
- **PRD / Architecture / Style Guide** — AI-guided document creation and
  refinement in an embedded agent terminal, driven by category-scoped skills.
- **Initiate Stack** — scaffolds the source tree, dependencies, `.gitignore`,
  and the test-strategy playbook from the PRD + Architecture.
- **Epic Creation & Ticket Generation** — break the PRD into epics
  (NEW → TICKETS → BUILDING → DONE) and epics into backlog tickets.
- **BDD User Stories** — lightweight As-A / I-Want / So-That stories with
  Given-When-Then scenarios; a faster path than full epics for small capabilities.
- **Design group** — Mockups (AI-generated SVG→PNG), Style Guide, Data Model.
- **Requirements group** — functional / non-functional requirement tables
  (Excel import/export) and use case diagrams.
- **Skills** — reusable Markdown system prompts in `docs/Skills/`, organised in
  category sub-folders (PRD, Architecture, Styling, Epics, BDD,
  Ticket Generation, Diagnostics, Bootstrapping, Other). Each Plan page offers
  only the skills from its own category.
- **Document Explorer** — a file tree over `docs/` with rename, drag-move,
  and folder management.

### 5.2 Build
Automated development workflow. Key pages:
- **Workspace** — git status, commit graph, integrated terminal.
- **Board** — kanban over the ticket lifecycle
  (backlog → todo → in_progress → test → eval → review → done), with per-ticket
  agent assignment and a Ticket Doctor for diagnosing failing tickets.
- **Backlog** — tabular backlog with promote (single or Promote All, in ticket
  number order), delete, and ad-hoc ticket creation. Optionally auto-assigns
  the default agent on promotion.
- **Requests** — lightweight intake that can be promoted into tickets.
- **Automation** — scheduler status, active agent runs, evaluation queue. The
  sidebar **Auto** toggle starts/stops the scheduler.

### 5.3 Review
Inspection of outcomes:
- **Epics** — epic specs with status (editable inline), start/evaluate actions,
  and dependency blockers mirroring the scheduler gate.
- **Logs** — searchable event log of agent runs, scheduler actions, and system
  events.
- **Archive** — completed tickets archived off the board.

## 6. Key Functional Requirements

- FR-1: All planning artefacts are Markdown files under `docs/`, editable both
  in-app and by any external editor.
- FR-2: The ticket database (`.ombutocode/data/ombutocode.db`, sql.js) is the
  canonical task list; agents read and write it through bundled CLI tools
  (`db-query`, `ticket-write`) rather than ad-hoc DB access.
- FR-3: The scheduler only picks up tickets with `status: todo` and an explicit
  agent assignee; dependencies must be in `review`/`done` before work starts.
- FR-4: Test and eval failures increment per-ticket counters; exceeding the
  configured retry limit unassigns the ticket to stop automation churn.
- FR-5: Agent terminals support interactive sessions (xterm + PTY) with
  clipboard paste (Ctrl+V / right-click, bracketed-paste safe).
- FR-6: Settings persist via electron-store with a headless fallback, covering
  default agents/models, refresh interval, retry limits, notifications, theme
  (dark default), title-bar colour (20-colour palette for multi-instance use),
  and workflow toggles such as auto-assign-on-promote.
- FR-7: The UI fully supports light and dark themes, including all Tabulator
  tables and the Help page.

## 7. Non-Goals

- Not a general-purpose IDE — code editing happens in the user's editor;
  Ombuto Code manages the workflow around it.
- Not a hosted/multi-tenant SaaS — it is a local desktop tool operating on a
  local git repository.
- Not an agent runtime of its own — it orchestrates existing CLI agents rather
  than shipping a bundled model.
- No fine-grained team permissions or role management.

## 8. Success Metrics

- A new user can go from empty repo to first agent-implemented ticket in under
  30 minutes using the Getting Started flow.
- ≥ 80 % of scheduler-driven tickets reach `review` without manual intervention
  on a well-specified project.
- Planning documents (PRD, Architecture, epics) exist for every project built
  with the tool — enforced by the workflow, not by discipline.

## 9. Technical Constraints

- Electron 25 + Vue 3 + Pinia + Vue Router (hash history); Vite for renderer
  builds; electron-builder for packaging.
- sql.js (SQLite compiled to JS) for the ticket database; electron-store for
  settings; node-pty + xterm.js for terminals.
- Windows is the primary platform; macOS and Linux supported via Git Bash /
  POSIX shims where scripts are involved.
- Agents are external CLIs configured in `.ombutocode/codingagents/codingagents.yml`.

## 10. Open Questions

- Should epics support sub-epics for larger programmes of work?
- Should the Review tab grow analytics (cycle time, failure rates per agent)?
- Multi-project switching from a single window vs. one window per project
  (currently: one instance per project, distinguished by title-bar colour).
