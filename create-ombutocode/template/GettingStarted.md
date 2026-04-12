# Getting Started with {{PROJECT_NAME}}

Welcome! This project was scaffolded with `npx create-ombutocode` and comes
pre-wired with the **Ombuto Code** workbench — an Electron desktop
application that helps you plan, specify, and build software with AI
coding agents.

This document walks you through:

1. [Where you are right now](#1-where-you-are-right-now)
2. [Prerequisites](#2-prerequisites)
3. [Launching Ombuto Code](#3-launching-ombuto-code)
4. [Your first hour — the Plan → Build flow](#4-your-first-hour--the-plan--build-flow)
5. [Folder layout](#5-folder-layout)
6. [How `docs/` is handled in the app](#6-how-docs-is-handled-in-the-app)
7. [Where to go next](#7-where-to-go-next)

---

## 1. Where you are right now

Your project directory contains:

- **`.ombutocode/`** — the Ombuto Code workbench itself (Electron + Vue app,
  SQLite database, backlog, scheduler, tools, and configuration). This is
  a ready-to-run copy of the tool, licensed under Apache 2.0.
- **`docs/`** — an **empty set of requirements folders** (Product
  Requirements Document, Architecture, Use Cases, Epics, Data Model, etc.).
  This is where your product specification will live.
- **`CLAUDE.md`** — project-level instructions for AI coding agents (Claude
  Code, Codex, Kimi). It currently just points agents at the engineering
  guide — add your own conventions as the project grows.
- **`GettingStarted.md`** — this file.
- **`README.md`** — a minimal project README. Replace it with your own
  once you know what this project is.

What you do **not** yet have:

- A product requirements document
- An architecture spec
- Epics, use cases, or tickets in the backlog
- Any product source code of your own

That's all normal. The first phase of an Ombuto Code project is defining
*what you're building*. Only after that does code get written.

---

## 2. Prerequisites

You need:

- **[Node.js](https://nodejs.org/) 18 or newer** — Ombuto Code is an
  Electron app and uses npm dependencies.
- **[Git](https://git-scm.com/)** — Ombuto Code versions your requirements
  documents with Git just like source code. The installer has already
  initialised a fresh repo for you.

Optional (but recommended — this is what makes the Build phase interesting):

- **At least one AI coding CLI**, installed globally and authenticated:
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) —
    `npm install -g @anthropic-ai/claude-code`, then `claude login`
  - [Codex](https://github.com/openai/codex) —
    `npm install -g @openai/codex`
  - [Kimi](https://github.com/moonshotai/kimi-cli) (optional)

You can always add these later — Ombuto Code's Plan mode works fine
without any coding agent installed.

---

## 3. Launching Ombuto Code

From your project root:

**Windows:**
```cmd
.ombutocode\buildandrun.bat
```

**macOS / Linux:**
```bash
bash .ombutocode/buildandrun
```

That script builds the renderer and launches the Electron app. The first
launch takes a little longer because it compiles the Vue frontend.

The app window will open on the **Dashboard**. The left sidebar has two
groups — **Plan** and **Build** — which you can toggle between. Plan
mode is where you define *what* the system should do; Build mode is where
you let coding agents make it real.

---

## 4. Your first hour — the Plan → Build flow

The typical flow for a brand-new project looks like this. You don't have
to do every step — skip the ones that don't fit — but doing them in order
will give you the smoothest experience.

### 4.1 Define a PRD (Plan mode)

Open the **Product Requirements Document** view from the Plan sidebar.
Either write the PRD yourself, or — if you have a coding agent
authenticated — use the **interactive PRD assistant** to walk through
product name, purpose, target users, goals, constraints, and success
metrics. The assistant saves the result as
`docs/Product Requirements Document/PRD.md`.

Tip: a decent PRD gives every downstream step (architecture, epics,
tickets) much better context. An hour on the PRD is rarely wasted.

### 4.2 Sketch an architecture

Open **Architecture** and draft a short architecture spec at
`docs/Architecture/Architecture.md`. Components, data flow, boundaries,
and any technology decisions that would affect how tickets are broken
down.

### 4.3 Capture use cases and a data model

- Add use cases under `docs/Use Cases/` — one markdown file per use case.
- Draw a use case diagram in the **Use Case Diagrams** editor.
- If your system has meaningful persistence, describe the schema in
  `docs/Data Model/Schema.ddl` (plain SQL DDL works best). Ombuto Code
  can render it as an ER diagram directly from the DDL.

### 4.4 Break work into epics

Create epic specs under `docs/Epics/`, one markdown file per epic
(`epic_AUTHENTICATION.md`, `epic_BILLING.md`, etc.). Each epic describes
a self-contained feature area with scope, acceptance criteria, and
references back to the PRD and architecture.

Use the template at `.ombutocode/templates/epic.md` as a starting point
(or use the **Epics** view in the app to create one interactively).

### 4.5 Generate tickets from an epic

Once an epic is well-specified, switch to **Build** mode, open the
**Backlog** view, and ask a coding agent to generate tickets for the
epic. Tickets are created with `status: backlog` and
`assignee: null` — they're waiting for you to review and promote.

Promote the tickets you want worked on to `status: todo` and assign
them to a coding agent (e.g. `claude`). Then enable the **Auto**
scheduler — agents will pick up `todo` tickets one by one, move them
through `in_progress` → `eval` → `review`, and leave you to approve
each one.

### 4.6 Watch it work

The **Automation** dashboard shows active runs, recent completions, and
the evaluation queue. Logs are captured under `.ombutocode/run-output/`
and surfaced in the **Logs** view.

---

## 5. Folder layout

```
{{PROJECT_NAME}}/
├── .ombutocode/                  # The Ombuto Code workbench (Apache 2.0)
│   ├── OMBUTOCODE_ENGINEERING_GUIDE.md  # The workflow agents MUST follow
│   ├── LICENSE                   # Apache 2.0 license for the workbench
│   ├── src/                      # Electron + Vue source for the app
│   ├── data/                     # SQLite database (backlog, runs, logs)
│   ├── codingagents/             # Agent configuration (YAML)
│   ├── templates/                # Epic / backlog / skill templates
│   ├── tools/                    # CLI tools for agents (db-query, etc.)
│   ├── scripts/                  # Seed + migration scripts
│   ├── logs/                     # Run audit logs (gitignored)
│   ├── run-output/               # Agent stdout/stderr logs (gitignored)
│   ├── buildandrun.bat           # Windows launcher
│   └── buildandrun               # macOS / Linux launcher
│
├── docs/                         # ← Your product specification (versioned)
│   ├── Product Requirements Document/
│   ├── Architecture/
│   ├── Epics/
│   ├── Use Cases/
│   ├── Use Case Diagrams/
│   ├── Class Diagrams/
│   ├── Data Model/
│   ├── Functional Requirements/
│   ├── Non-Functional Requirements/
│   ├── Structure/
│   ├── Style Guide/
│   ├── Mockups/
│   ├── References/
│   ├── Skills/
│   └── ScratchPad/
│
├── CLAUDE.md                     # Agent instructions for this project
├── GettingStarted.md             # This file
└── README.md                     # Your project README
```

Your own product source code can live anywhere you like — a common
layout is `src/`, `app/`, or per-service subdirectories at the repo root
alongside `.ombutocode/` and `docs/`. Ombuto Code does not enforce a
specific layout.

---

## 6. How `docs/` is handled in the app

`docs/` is **first-class** in Ombuto Code. It is not a static folder on
disk — the workbench treats it as a live, editable knowledge base that
drives everything else.

- **Plan mode views are views over `docs/`.** The PRD view reads and
  writes `docs/Product Requirements Document/PRD.md`. The Use Cases
  view reads each file in `docs/Use Cases/`. The ER Diagram view
  renders `docs/Data Model/Schema.ddl`. And so on. Editing a document
  in the app is the same as editing the file on disk.

- **Changes are versioned with Git.** Because `docs/` lives inside your
  Git repository, every edit the app (or you, or an agent) makes can
  be committed. The app shows per-document version history via Git,
  so you can see who changed what and when. No separate CMS or wiki.

- **Agents read `docs/` for context.** When a coding agent picks up a
  ticket, it reads the epic the ticket belongs to, and the epic
  references PRD / architecture / data model sections. The better your
  `docs/` content, the better the agents behave — think of `docs/` as
  the agents' long-term memory.

- **The file tree in the sidebar mirrors `docs/`.** You can drag-drop
  to reorganise, rename files, and create new entries directly from
  the sidebar. Changes hit disk immediately.

- **Nothing under `docs/` is gitignored.** All of it ships with your
  project. Only `.ombutocode/logs/`, `.ombutocode/run-output/`, and
  similar runtime-only paths are excluded.

In short: **`docs/` is the project's specification, and the app is a
UI for editing it.** Treat it like source code, commit often, and let
agents build from it.

---

## 7. Where to go next

- **Read `.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md`.** Even if you
  never write a coding agent yourself, this document explains the
  ticket lifecycle, scheduler rules, and what agents are and aren't
  allowed to do. It's short.
- **Explore `.ombutocode/templates/`.** The `backlog.yml` and `epic.md`
  templates show you the fields agents expect, which is useful when
  you write tickets or epics by hand.
- **Check `.ombutocode/codingagents/codingagents.yml`.** That's where
  you configure which CLIs are available, which models they use, and
  concurrency limits.
- **Settings → Coding Agents (inside the app)** has a **Test** button
  that verifies each agent is reachable and authenticated. Run it
  before you enable the scheduler.

Happy building.
