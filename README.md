<p align="center">
  <img src=".ombutocode/src/src/assets/ombuto-logo-nobg.svg" alt="Ombuto Code" width="120" />
</p>

<h1 align="center">Ombuto Code</h1>

<p align="center">
  <strong>Agentic Software Engineering Workbench</strong>
</p>

<p align="center">
  An Electron-based desktop application that combines structured requirements engineering with automated AI-driven development.
  <br />
  From PRD to production &mdash; plan, build, and ship with AI coding agents.
</p>

<p align="center">
  <a href="https://ombutocode.com"><strong>ombutocode.com</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.2.2-blue" alt="Version 0.2.2" />
  <img src="https://img.shields.io/badge/status-beta-orange" alt="Beta" />
  <img src="https://img.shields.io/badge/Electron-25-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/Vue.js-3-4FC08D?logo=vuedotjs&logoColor=white" alt="Vue 3" />
  <img src="https://img.shields.io/badge/Pinia-State-ffd859?logo=pinia&logoColor=black" alt="Pinia" />
  <img src="https://img.shields.io/badge/SQLite-sql.js-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/License-Apache%202.0-blue" alt="License" />
</p>

---

> ## ⚠️ Beta — Not Released
>
> **Ombuto Code is currently in beta (v0.2.2) and has not been officially released.**
> APIs, data formats, and features may change without notice. Use at your own risk and
> expect breaking changes between versions until the 1.0.0 release. Feedback and bug
> reports are very welcome while we stabilise the product.

---

## Overview

Ombuto Code is a desktop workbench that bridges the gap between **requirements engineering** and **automated software development**. It provides two integrated modes:

- **Plan** &mdash; Structure your project with PRDs, use cases, class diagrams, ER diagrams, functional requirements, and a hierarchical file tree. AI agents can guide you through creating requirements documents interactively.

- **Build** &mdash; Manage development with a Kanban board, backlog, AI coding agents (Claude, Codex, Kimi), automated scheduling, and real-time logs. Agents pick up tickets and write code autonomously.

## Features

### Plan Mode
- Interactive **PRD creation** guided by AI coding agents — full and lightweight (PRD-BASIC) skill variants
- **Architecture authoring** with full and lightweight (Architecture-BASIC) skill variants
- **Initiate Stack** — bootstrap the source tree, install deps, write `.gitignore`, and author `docs/Test Strategy/test-strategy.md` from the PRD + Architecture in a single AI session. Safely re-runnable in refresh mode as the architecture evolves
- **Epic Creation** — bulk PRD-to-epic breakdown, single-epic add, and per-epic refine-with-AI; epics support epic-to-epic dependencies (`Depends On:` line) that the scheduler enforces
- **Ticket Generation** with mandatory closeout tickets (epic-level eval, regression tests, help docs update) appended automatically
- **Project Structure** editor for systems, subsystems, and components, with auto-save and Markdown-rendered descriptions
- **Use Case** document editor with Markdown preview and version history
- **Use Case Diagram** visual editor (actors, use cases, associations, extends, includes)
- **Class Diagram** visual editor (classes, attributes, operations, relationships)
- **ER Diagram** viewer from PostgreSQL DDL schemas
- **Functional & Non-Functional Requirements** matrix with Excel export/import
- **Mockup gallery** with lightbox viewing
- **Scratch Pad** for quick notes
- **File tree sidebar** with drag-and-drop, folder management, and hierarchical sorting
- **Version history** for all documents via Git integration

### Build Mode
- **Workspace** with Git status, commit graph, and integrated terminal (right-click in terminal to paste)
- **Kanban Board** for ticket workflow (backlog, todo, in-progress, review, done)
- **Ticket Doctor** &mdash; stethoscope icon on tickets that exceeded the retry threshold; opens an AI session using the Fix Ticket skill to diagnose, repair, and emit a `TICKET_DOCTOR_RESULT: SUCCESS` marker that unlocks "Move to Review"
- **Test-Driven Development workflow** baked into agent prompts &mdash; impl phase writes failing tests first, then implementation; test phase reads `docs/Test Strategy/test-strategy.md` for the project's exact test commands (stack-agnostic)
- **Epic-level dependencies** &mdash; epics can declare `Depends On: epic_NN_...` and the scheduler holds downstream tickets until prerequisite epics reach `DONE`
- **Backlog** management with ticket creation and dependency tracking
- **Coding Agents** &mdash; configure Claude (Opus 4.7, Sonnet 4.6, Haiku 4.5), Codex, and Kimi with per-agent model selection
- **Automated Scheduler** &mdash; assigns agents to todo tickets, manages concurrency, rate limits, and provider-pause detection
- **Automation** dashboard with active runs and evaluation queue
- **Logs** viewer with filtering by severity, event type, and ticket ID
- **Archive** for completed tickets

### General
- **Light and dark themes** with green accent &mdash; switch any time from Settings
- **Multi-instance support** &mdash; run several projects side by side, each with its own `userData` directory and per-project single-instance lockfile
- **Custom title bar colour** &mdash; pick one of 10 swatches per project (or default) to distinguish multiple running instances at a glance
- Collapsible sidebar with Plan/Build tab switching
- Settings with agent connectivity testing
- Help page with comprehensive documentation
- About modal with OSS license listing

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Git](https://git-scm.com/)
- At least one AI coding CLI (optional, for Build mode):
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) &mdash; `npm install -g @anthropic-ai/claude-code`
  - [Codex](https://github.com/openai/codex) &mdash; `npm install -g @openai/codex`

### Quick Start (recommended)

The fastest way to create a new project is with the `create-ombutocode` installer:

```bash
npx create-ombutocode my-project
cd my-project
```

This will:
1. Clone the Ombuto Code repository
2. Install all dependencies
3. Create starter documents (PRD, Architecture, Use Cases, etc.)
4. Initialise a fresh Git repository

Then launch the app:

```bash
.ombutocode/buildandrun.bat          # Windows
bash .ombutocode/buildandrun         # macOS / Linux
```

### Manual Installation

If you prefer to set things up manually:

```bash
# Clone the repository
git clone https://github.com/FrancoisBotha/ombutocode.git
cd ombutocode

# Install dependencies
cd .ombutocode/src
npm install

# Initialise with sample data. By default this WIPES docs/ and recreates
# the starter content, alongside resetting the DB and runtime caches.
cd ../..
.ombutocode/initombuto.bat          # Windows
# or
bash .ombutocode/initombuto          # macOS / Linux

# To reset DB / runtime state but preserve existing docs/ content:
.ombutocode/initombuto.bat --keep-docs
```

### Running

```bash
# Build and launch (Windows)
.ombutocode/buildandrun.bat

# Or manually:
cd .ombutocode/src
npx vite build && npx electron .
```

### Configuring Coding Agents

1. Install a CLI agent (e.g. `npm install -g @anthropic-ai/claude-code`)
2. Authenticate: `claude login` or `export ANTHROPIC_API_KEY="sk-ant-..."`
3. Open Ombuto Code &rarr; **Settings** &rarr; **Coding Agents** tab
4. Click **Test** to verify connectivity
5. Select a default agent and configure max concurrent runs
6. Create backlog tickets with `assignee: claude` and enable the **Auto** scheduler

## Project Structure

```
ombutocode/
  .ombutocode/                 # Ombuto Code application
    src/                       # Electron + Vue source
      main.js                  # Electron main process
      preload.js               # IPC bridge
      src/
        main/                  # Backend services
        renderer/              # Vue 3 frontend
          components/          # UI components
          views/               # Plan mode view pages
          stores/              # Pinia state management
          assets/              # CSS, icons
    codingagents/              # Agent configuration (YAML)
    codingagent-templates.json # Agent command templates
    data/                      # SQLite database
    templates/                 # Backlog, skill & mockup templates
    planning/                  # Backlog YAML
    tools/                     # CLI tools for agents (db-query, ticket-write, svg-to-png)
    scripts/                   # One-shot maintenance scripts (template rewriters, etc.)
    initombuto                 # Project initialisation script (defaults to wiping docs/)
    initombuto.bat             # Windows wrapper for initombuto
    OMBUTOCODE_ENGINEERING_GUIDE.md  # Mandatory agent operating manual
  docs/                        # Requirements documents (Plan mode)
    Product Requirements Document/
    Architecture/
    Style Guide/
    Structure/
    Epics/
    Use Cases/
    Use Case Diagrams/
    Class Diagrams/
    Functional Requirements/
    Non-Functional Requirements/
    Data Model/
    Mockups/
    Skills/                    # Per-skill markdown that the Plan views auto-load
    Test Strategy/             # test-strategy.md written by the Initiate Stack flow
    ScratchPad/
  create-ombutocode/           # npx installer package
  migration-tool/              # Win32 C++ migrator that updates an existing
                               # project's .ombutocode/ from a newer repo
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 25 |
| Frontend | Vue 3, Pinia, Vue Router, Vite |
| Editor | CodeMirror 6 |
| Terminal | xterm.js + node-pty |
| Database | sql.js (SQLite in JS) |
| Markdown | marked + highlight.js |
| Tables | Tabulator |
| File watching | chokidar |
| Git | simple-git |
| Icons | Material Design Icons |
| Excel | xlsx-js-style |

## License

Licensed under the Apache License, Version 2.0. See [.ombutocode/LICENSE](.ombutocode/LICENSE) for details.

Copyright &copy; 2026 Francois Botha.

---

<p align="center">
  Built with Ombuto Code
</p>
