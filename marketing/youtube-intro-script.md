# YouTube Script — "Meet Ombuto Code" (Product Introduction)

> Status: DRAFT for v0.2.4 (Beta)
> Target length: 6–7 minutes. Format: screen recording with voiceover; talking-head optional for intro/outro.
> Style: calm, concrete, show-don't-tell. Every claim is demonstrated on screen within seconds of being spoken.
> Recording prep: fresh project scaffolded with `npx create-ombutocode demo-notes-app`, dark theme, one agent (Claude) configured and tested, sample PRD half-written so the Plan demo moves fast. Have 6–8 tickets pre-generated in a second project for the Build demo so we're not waiting on live generation.

---

## COLD OPEN (0:00 – 0:25)

**[SCREEN: Build board, Auto ON, two tickets in "In Progress" with agent badges, one moving to Review. No intro branding yet.]**

**VO:**
What you're looking at is an AI engineering team working through a backlog. Two agents, on two tickets, scheduled automatically — and everything they finish lands in a review column that they cannot skip. I just review and approve.

The tool managing all of this is free, open source, and runs entirely on your machine.

**[TITLE CARD: Ombuto Code — Agentic Software Engineering Workbench — 2s]**

---

## THE PROBLEM (0:25 – 1:10)

**[SCREEN: a long, messy AI chat session, scrolling fast.]**

**VO:**
If you've used AI coding agents seriously, you know this scroll. The agent is genuinely good — but the *project* lives in a chat window. Requirements are in your head. Yesterday's decisions are forty screens up. And tomorrow's session starts from zero.

**[SCREEN: cut to a git repo file tree — `docs/` folder expanded: PRD, Architecture, Epics, Skills...]**

**VO:**
Ombuto Code starts from one idea: requirements are first-class citizens of the codebase. Your PRD, your architecture, your epics, your user stories — they're markdown files in your repo, versioned by the same git history as your code. Every agent reads them on every task. Nothing lives in scrollback.

---

## MODE 1: PLAN (1:10 – 2:45)

**[SCREEN: Plan tab. Click through sidebar: Core → Design → Requirements groups.]**

**VO:**
The workbench has three modes. First: Plan.

**[SCREEN: PRD page. Skill dropdown showing the PRD category. Click "Create PRD" — terminal opens, agent asks its first question. Type a short answer, agent continues.]**

**VO:**
You don't write these documents alone. Click Create PRD and an AI session walks you through it — section by section, one question at a time. The "skill" driving this conversation is itself a markdown file in your repo, so your team's way of writing requirements is versioned too. Skills are organised by category — the PRD page offers PRD skills, the Architecture page offers architecture skills.

**[SCREEN: jump-cut to finished PRD rendered. Then Architecture page, then Initiate Stack — show the seven-step list briefly.]**

**VO:**
Same flow for architecture. Then "Initiate Stack" turns those documents into a working skeleton — source tree, dependencies, gitignore, and a test-strategy playbook every future agent will follow.

**[SCREEN: Epic Creation → epics list → Ticket Generation → agent proposing tickets → tickets appearing in backlog.]**

**VO:**
Epics break the PRD into milestones. Ticket generation breaks epics into scoped, dependency-ordered work items — straight into the backlog. And for small features that don't need a full epic, BDD user stories: As-A, I-Want, So-That, with Given-When-Then acceptance scenarios, each generating a handful of tickets.

---

## MODE 2: BUILD (2:45 – 4:45)

**[SCREEN: Build tab → Backlog page with ~8 tickets.]**

**VO:**
Mode two: Build. Here's the backlog we just generated.

**[SCREEN: click Promote All → confirm dialog → tickets flow out. Cut to Board: tickets in todo with agent assigned.]**

**VO:**
Promote All moves the whole backlog to the board in ticket order — and with one setting flipped, every promoted ticket is auto-assigned to your default agent. You can also assign agents per ticket: Claude, Codex, Kimi — whatever CLIs you have. Ombuto Code is the manager, not the model.

**[SCREEN: click the Auto toggle. Scheduler picks up first ticket; terminal output visible in Automation page.]**

**VO:**
This is the moment. Auto, on. The scheduler assigns agents to tickets, respects dependencies — a ticket won't start until the tickets it depends on are reviewed — and runs each one through phases: implement, with tests written first… run the test suite… then an evaluation pass, where a separate agent session judges the work against the ticket's acceptance criteria.

**[SCREEN: board showing ticket moving test → eval → review. Hover the eval verdict on a ticket.]**

**VO:**
Pass — it moves to Review and waits for a human. Fail — it goes back, with the failure reasons attached. And there's a retry ceiling: an agent doesn't get to fail the same ticket forever. After the limit, it's unassigned and flagged.

**[SCREEN: ticket with stethoscope icon → click → Ticket Doctor dialog, diagnostic session starting.]**

**VO:**
That flag is the Ticket Doctor. One click opens a diagnostic AI session loaded with that ticket's full failure history. Diagnose, fix, move on.

**[SCREEN: Review a ticket — approve one, reject one with a comment, watch it return to todo.]**

**VO:**
And review is a real gate. Approve, or reject with a comment that goes straight back to the agent. You're the engineering manager. The board makes that an actual job instead of a metaphor.

---

## MODE 3: REVIEW (4:45 – 5:30)

**[SCREEN: Review tab → Epics page, change an epic's status via the dropdown. → Logs page, filter by severity. → Archive.]**

**VO:**
Mode three: Review — the audit trail. Every epic with live status you control. Every agent run, scheduler decision, and system event in a searchable log. Every completed ticket archived with its evaluation history. When someone asks "why does the app do this?" — you have a chain: commit, ticket, epic, PRD section. Not "the AI decided to."

---

## GETTING STARTED + OUTRO (5:30 – 6:30)

**[SCREEN: terminal. Type the command live.]**

```
npx create-ombutocode my-app
```

**VO:**
One command. It scaffolds the project, installs the workbench, seeds starter documents, and initialises git. You need Node 18, git, and at least one agent CLI — Claude Code, Codex, or Kimi.

**[SCREEN: GitHub repo page.]**

**VO:**
Ombuto Code is Apache 2.0 — free, open source, local-first. No account, no hosted service, no telemetry. It's in beta — version 0.2.4 — and that's exactly when your feedback shapes it most. The repo link is below, with the getting-started guide.

**[TALKING HEAD or final board shot:]**

**VO:**
The agents are ready to build. Give them something worth building from. Plan it. Let them build it. Review everything.

**[END CARD: logo · `npx create-ombutocode` · github.com/FrancoisBotha/ombutocode — 4s]**

---

## YouTube metadata

**Title options (A/B):**
1. I gave AI coding agents a project manager — meet Ombuto Code
2. Stop prompting. Start managing. AI agents on a real kanban board.
3. Ombuto Code: an open-source workbench for AI-driven software engineering

**Description (first 2 lines matter):**
Ombuto Code is a free, open-source workbench that turns AI coding agents (Claude Code, Codex, Kimi) into a managed engineering team: PRD → architecture → tickets → automated build → human review. Local-first, Apache 2.0.
Try it: npx create-ombutocode my-app · Repo: https://github.com/FrancoisBotha/ombutocode

**Chapters:**
0:00 An AI team working a backlog
0:25 The problem with chat-driven coding
1:10 Plan — PRD, architecture, epics, BDD stories
2:45 Build — scheduler, phases, retry limits, Ticket Doctor
4:45 Review — epics, logs, archive
5:30 Get started in one command

**Tags:** ai coding agents, claude code, codex, agentic engineering, open source dev tools, kanban, electron app, ai workflow, prd, software engineering
