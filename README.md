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
  <img src="https://img.shields.io/badge/Electron-25-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/Vue.js-3-4FC08D?logo=vuedotjs&logoColor=white" alt="Vue 3" />
  <img src="https://img.shields.io/badge/Pinia-State-ffd859?logo=pinia&logoColor=black" alt="Pinia" />
  <img src="https://img.shields.io/badge/SQLite-sql.js-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/License-Proprietary-blue" alt="License" />
</p>

---

## Overview

Ombuto Code is a desktop workbench that bridges the gap between **requirements engineering** and **automated software development**. It provides two integrated modes:

- **Plan** &mdash; Structure your project with PRDs, use cases, class diagrams, ER diagrams, functional requirements, and a hierarchical file tree. AI agents can guide you through creating requirements documents interactively.

- **Build** &mdash; Manage development with a Kanban board, backlog, AI coding agents (Claude, Codex, Kimi), automated scheduling, and real-time logs. Agents pick up tickets and write code autonomously.

## Features

### Plan Mode
- Interactive **PRD creation** guided by AI coding agents
- **Project Structure** editor for systems, subsystems, and components
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
- **Workspace** with Git status, commit graph, and integrated terminal
- **Kanban Board** for ticket workflow (backlog, todo, in-progress, review, done)
- **Backlog** management with ticket creation and dependency tracking
- **Coding Agents** &mdash; configure Claude, Codex, and Kimi with model selection
- **Automated Scheduler** &mdash; assigns agents to todo tickets, manages concurrency and rate limits
- **Automation** dashboard with active runs and evaluation queue
- **Logs** viewer with filtering by severity, event type, and ticket ID
- **Archive** for completed tickets

### General
- Dark mode by default with green accent theme
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

### Installation

```bash
# Clone the repository
git clone https://github.com/FrancoisBotha/ombutocode.git
cd ombutocode

# Install dependencies
cd .ombutocode/src
npm install

# Initialise with sample data (resets DB + creates docs/ starter content)
cd ../..
.ombutocode/initombuto.bat          # Windows
# or
bash .ombutocode/initombuto          # macOS / Linux

# For a complete reset (wipes docs/ and recreates):
.ombutocode/initombuto.bat --clear
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
    templates/                 # Backlog & mockup templates
    planning/                  # Backlog YAML
    features/                  # Feature specifications
  docs/                        # Requirements documents (Plan mode)
    Product Requirements Document/
    Architecture/
    Structure/
    Use Cases/
    Use Case Diagrams/
    Class Diagrams/
    Functional Requirements/
    Non-Functional Requirements/
    Data Model/
    Mockups/
    ScratchPad/
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

Copyright &copy; 2026 Francois Botha. All rights reserved.

---

<p align="center">
  Built with Ombuto Code
</p>
