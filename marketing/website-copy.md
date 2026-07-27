# Website Copy — Ombuto Code

> Status: DRAFT for v0.2.4 (Beta) launch
> Tone: developer-first, plain-spoken, no AI hype. We sell the workflow, not the model.

---

## Hero

**Headline:**
# Plan it. Let the agents build it. Review everything.

**Subhead:**
Ombuto Code is an open-source Agentic Software Engineering Workbench. Write your PRD, architecture, and tickets — then let AI coding agents (Claude, Codex, Kimi) work through your backlog while you stay in control.

**Primary CTA:** `npx create-ombutocode my-app`
**Secondary CTA:** [View on GitHub] · [Watch the 5-minute intro]

**Hero footnote:** Free and open source (Apache 2.0). Runs locally on your machine. Your code never leaves your repo except through the agent CLIs you already use.

---

## The problem (section 2)

**Vibe coding doesn't scale.**

Prompting an AI agent to "build my app" works for an afternoon. Then the context runs out, the requirements live in your head, and every new session starts from zero.

Real software needs what it has always needed: requirements, architecture, scoped work items, and review. The difference now is that agents can do the building — if you give them the structure to build inside.

---

## The answer (section 3)

**Requirements as first-class citizens of your codebase.**

Ombuto Code puts every planning document — PRD, architecture, epics, user stories, mockups, requirements tables — in a `docs/` folder versioned by the same git history as your source code. Agents read those documents on every ticket. You get traceability from product vision down to the individual commit.

---

## Three modes (feature section)

### Plan
AI-guided document creation in an embedded terminal. Write your PRD and architecture interactively, scaffold your stack, break work into epics and tickets — or use lightweight BDD user stories (As-A / I-Want / So-That with Given-When-Then scenarios) for smaller capabilities. Skills — reusable Markdown system prompts organised by category — shape how the AI works on every page.

### Build
A kanban board over the full ticket lifecycle: backlog → todo → in progress → test → eval → review → done. Assign agents per ticket or flip on the **Auto** scheduler and let it dispatch the backlog — with retry limits, dependency gates, test-driven prompts, and an evaluation pass before anything reaches you for review. Promote tickets one at a time, or hit **Promote All** and watch the board move.

### Review
Epics with live status control, searchable logs of every agent run and scheduler decision, and an archive of completed work. When something fails repeatedly, the **Ticket Doctor** opens a diagnostic AI session right on the ticket.

---

## How it works (4 steps)

1. **Scaffold** — `npx create-ombutocode my-app` gives you a ready workbench in a fresh git repo.
2. **Plan** — an AI session walks you through your PRD, architecture, and stack setup. Documents land in `docs/`, in git.
3. **Generate tickets** — epics become scoped, dependency-ordered tickets in the backlog.
4. **Build on Auto** — the scheduler assigns agents, runs impl → test → eval phases, and queues finished work for your review.

---

## Differentiators (checklist section)

- **Local-first.** An Electron desktop app working on your local repo. No hosted service, no account, no telemetry.
- **Agent-agnostic.** Claude Code, Codex, and Kimi behind one configuration. Pick per ticket. Switch any time.
- **Docs and code share one history.** Requirements drift is a `git diff` away from being caught.
- **Guardrails, not vibes.** Dependency gates, retry ceilings, eval verdicts, and a human review column that agents cannot skip.
- **Open source.** Apache 2.0. Read the code, file issues, send PRs.

---

## Honest beta banner

⚠️ **Ombuto Code is in beta (v0.2.4).** Expect rough edges and breaking changes before 1.0. If you're the kind of developer who files good bug reports, we'd love to have you early.

---

## FAQ

**Do I need API keys / a subscription?**
You need at least one AI coding CLI installed and authenticated (Claude Code, Codex, or Kimi). Ombuto Code orchestrates the CLIs you already pay for — it adds no fees of its own.

**What platforms?**
Windows is the primary platform today; macOS and Linux work via the bash launcher. Node 18+ and git required.

**Does it write code itself?**
No. Ombuto Code is the workbench — planning, scheduling, terminals, review. The agents you configure do the building.

**What happens to my data?**
Everything lives in your repo: documents in `docs/`, tickets in a local SQLite database under `.ombutocode/`. Nothing is sent anywhere except through the agent CLIs you run.

**Is it really free?**
Yes — Apache 2.0. The workbench is free and open source.

---

## Footer CTA

**Stop re-explaining your project to an AI every morning.**
`npx create-ombutocode my-app`
[GitHub] · [Getting Started] · [Report a bug]
