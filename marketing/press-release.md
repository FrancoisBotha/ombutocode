# Press Release — Ombuto Code Launch

> Status: DRAFT for v0.2.4 (Beta). Update version, date, and quotes before distribution.
> Format: standard launch release, ~500 words, with boilerplate and media contact.

---

FOR IMMEDIATE RELEASE

# Ombuto Code Launches Open-Source Workbench That Turns AI Coding Agents Into a Managed Engineering Team

**Free desktop tool gives developers a full requirements-to-review pipeline around Claude, Codex, and Kimi — with the structure and guardrails that ad-hoc AI prompting lacks**

**[CITY], [DATE]** — Ombuto Code, an open-source Agentic Software Engineering Workbench, is now available in public beta. The free desktop application gives software developers a structured pipeline for AI-assisted development: requirements and architecture documents, epic and ticket planning, automated agent scheduling, and human review — all operating on a local git repository.

While AI coding agents can now write substantial amounts of working software, most developers drive them through ad-hoc chat sessions where requirements live in scrollback and context evaporates between sessions. Ombuto Code replaces that with an engineering workflow: planning documents are first-class citizens of the codebase, versioned in git alongside the source they describe, and every agent task traces back to a ticket, an epic, and a product requirement.

"The agents are good enough to build real software. What's been missing is the management layer — the thing that turns 'prompting' into 'engineering,'" said Francois Botha, creator of Ombuto Code. "Ombuto Code is that layer. You plan like a product team, the agents build like an engineering team, and nothing ships without passing through a review column a human controls."

The workbench organises work into three modes:

- **Plan** — AI-guided creation of PRDs, architecture documents, BDD user stories, mockups, and requirements tables, driven by reusable, categorised "skills" (Markdown system prompts).
- **Build** — a kanban board over the full ticket lifecycle with an automated scheduler that assigns agents to tickets, enforces dependency ordering, runs test and evaluation phases, and applies retry ceilings before requesting human attention.
- **Review** — epic status tracking, a searchable log of every agent run and scheduler decision, and an archive of completed work.

Ombuto Code is agent-agnostic, supporting Anthropic's Claude Code, OpenAI's Codex CLI, and Moonshot's Kimi behind a single configuration, selectable per ticket. The tool is local-first: no hosted service, no account, and no fees beyond the agent subscriptions developers already hold.

Developers can create a new project with a single command:

```
npx create-ombutocode my-app
```

Ombuto Code is released under the Apache 2.0 license. The beta is available today for Windows, with macOS and Linux support via the included launcher scripts.

**Availability**
- GitHub: https://github.com/FrancoisBotha/ombutocode
- Installer: `npx create-ombutocode` (npm)
- License: Apache 2.0, free

**About Ombuto Code**
Ombuto Code is an independent open-source project building the engineering workbench for the agentic era — where humans plan and review, and AI agents build. The project treats requirements as code: versioned, diffable, and inseparable from the software they specify.

**Media contact**
Francois Botha
[email]
[social handle]

###
