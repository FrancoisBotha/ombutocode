# Getting Started with {{PROJECT_NAME}}

Welcome! This project was scaffolded with `npx create-ombutocode` and comes
pre-wired with the **Ombuto Code** workbench — an Electron desktop
application that helps you plan, specify, and build software with AI
coding agents.

This document walks you through:

1. [Where you are right now](#1-where-you-are-right-now)
2. [Prerequisites](#2-prerequisites)
3. [Launching Ombuto Code](#3-launching-ombuto-code)
4. [Linking the project to a GitHub repo](#4-linking-the-project-to-a-github-repo)
5. [Your first hour — the Plan → Build flow](#5-your-first-hour--the-plan--build-flow)
6. [Folder layout](#6-folder-layout)
7. [How `docs/` is handled in the app](#7-how-docs-is-handled-in-the-app)
8. [Where to go next](#8-where-to-go-next)

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

## 4. Linking the project to a GitHub repo

The installer already created a local Git repository and made an initial
commit, but it didn't push anywhere — you decide where this project's
remote lives. The recommended path is to create a brand-new empty repo
on GitHub and push to it.

### 4.1 Create an empty repo on GitHub

Easiest: use the GitHub CLI (`gh`) if you have it. From inside your
project directory:

```bash
gh repo create {{PROJECT_NAME}} --private --source=. --remote=origin --push
```

That single command creates the GitHub repo, wires it up as `origin`,
and pushes your initial commit in one go. Add `--public` instead of
`--private` if you want it open. Done — skip to §4.3.

If you don't have `gh`:

1. Open [github.com/new](https://github.com/new).
2. Set the repository name to `{{PROJECT_NAME}}` (or whatever you like).
3. **Do NOT** tick "Add a README", "Add .gitignore", or "Add a license" —
   your project already has those, and an initial commit on GitHub would
   force you to merge histories before your first push.
4. Click **Create repository**.
5. GitHub will show "…or push an existing repository from the command
   line." Use the commands from §4.2.

### 4.2 Wire up the remote and push

From your project directory:

```bash
git remote add origin <repo-url-from-github>
git branch -M main
git push -u origin main
```

`<repo-url-from-github>` looks like `https://github.com/<you>/{{PROJECT_NAME}}.git`
for HTTPS, or `git@github.com:<you>/{{PROJECT_NAME}}.git` for SSH.

If `git remote add origin …` says "remote origin already exists" (some
older `create-ombutocode` versions added one), set the URL instead:

```bash
git remote set-url origin <repo-url-from-github>
git push -u origin main
```

### 4.3 What gets pushed (and what doesn't)

Your `.gitignore` is already configured to keep heavy and stateful files
out of GitHub:

- **Pushed:** `docs/` (your spec — first-class, version-controlled),
  the `.ombutocode/` workbench source, configuration, templates, and
  agent setup.
- **Not pushed:** `.ombutocode/data/` (your local SQLite databases),
  `.ombutocode/logs/`, `.ombutocode/run-output/`, `node_modules/`, and
  build output. These are local-only — every developer regenerates them
  on first launch via `.ombutocode/buildandrun.bat`.

This means: collaborators cloning your repo get the same `docs/`,
tickets-as-spec, and workbench — but their own scheduler state, run
history, and database. Backlog content lives in the local DB, so if you
want teammates to start with the same tickets you'll need to either
re-generate them from the same epics or hand-export the DB separately.

### 4.4 Subsequent pushes

Standard Git workflow. Plan-mode edits (PRD, epics, mockups, etc.) and
any source code your project adds all live in the same repo, so a single
`git push` ships everything together. Ticket-level commits made by the
build-mode agents land on per-ticket worktrees first and merge to `main`
when the ticket reaches `done`.

---

## 5. Your first hour — the Plan → Build flow

The typical flow for a brand-new project looks like this. You don't have
to do every step — skip the ones that don't fit — but doing them in order
will give you the smoothest experience.

### 5.1 Define a PRD (Plan mode)

Open the **Product Requirements Document** view from the Plan sidebar.
Either write the PRD yourself, or — if you have a coding agent
authenticated — use the **interactive PRD assistant** to walk through
product name, purpose, target users, goals, constraints, and success
metrics. The assistant saves the result as
`docs/Product Requirements Document/PRD.md`.

Tip: a decent PRD gives every downstream step (architecture, epics,
tickets) much better context. An hour on the PRD is rarely wasted.

### 5.2 Sketch an architecture

Open **Architecture** and draft a short architecture spec at
`docs/Architecture/Architecture.md`. Components, data flow, boundaries,
and any technology decisions that would affect how tickets are broken
down.

### 5.3 Initiate the stack

Once the PRD and Architecture are in reasonable shape, open
**Plan → Initiate Stack** and click **Initialise Stack**. A coding
agent reads both documents and, in a single session:

- Scaffolds the source/test directory layout using idiomatic commands
  for the chosen stack (`dotnet new sln`, `cargo new`, `npm init`,
  `gradle init`, etc.).
- Installs dependencies declared in the architecture.
- Extends `.gitignore` with stack-appropriate patterns (build
  artifacts, dependency caches, OS / editor noise). Existing entries
  are preserved.
- Writes `docs/Test Strategy/test-strategy.md` — a 9-section playbook
  every future test-phase agent reads before running tests. It
  records the exact commands for unit tests, lint, type-check, and
  full-suite runs for your stack, so the test phase never has to
  guess.
- Verifies the project builds and the test runner works, then
  commits the scaffold.

Re-runnable safely. Run it again later (in **refresh mode**) when
the architecture evolves — adding a new component, a new dependency,
or a new test framework. Refresh mode only proposes deltas; it never
overwrites existing source or your hand-written prose in
`.gitignore` / `test-strategy.md`.

Skip this step at your peril: tickets generated against a missing
scaffold burn agent tokens trying to figure out where to put files.

### 5.4 Break work into epics

Epic specs live in `docs/Epics/`, one markdown file per epic
(`epic_AUTHENTICATION.md`, `epic_BILLING.md`, etc.). Each describes a
self-contained feature area with scope, acceptance criteria, and
references back to the PRD and architecture.

The easiest way to get started is to let the app do the first pass:
open the **Epics** view and use the **Generate epics from PRD and
architecture** action. A coding agent reads your `PRD.md` and
`Architecture.md` and proposes an initial set of epics covering the
product's main feature areas. Review what it produces, rename or
delete anything that doesn't fit, and edit each epic to sharpen the
scope and acceptance criteria.

You can also create epics by hand: use the template at
`.ombutocode/templates/epic.md` as a starting point and add the file
under `docs/Epics/`. Either approach produces the same on-disk
result — markdown files the rest of the workflow reads.

### 5.5 Generate tickets from an epic

Once an epic is well-specified, switch to **Build** mode, open the
**Backlog** view, and ask a coding agent to generate tickets for the
epic. Tickets are created with `status: backlog` and
`assignee: null` — they're waiting for you to review and promote.

Promote the tickets you want worked on to `status: todo` and assign
them to a coding agent (e.g. `claude`). Then enable the **Auto**
scheduler — agents will pick up `todo` tickets one by one, move them
through `in_progress` → `eval` → `review`, and leave you to approve
each one.

### 5.6 Watch it work

The **Automation** dashboard shows active runs, recent completions, and
the evaluation queue. Logs are captured under `.ombutocode/run-output/`
and surfaced in the **Logs** view.

---

## 6. Folder layout

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

## 7. How `docs/` is handled in the app

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

## 8. Where to go next

Open **Help** in the app — it's the canonical reference for every
feature, with walkthroughs, keyboard shortcuts, and troubleshooting.
Anything you need beyond this quick start lives there.

Happy building.
