# Reddit Engagement Prompts — Ombuto Code

> Status: DRAFT. Reddit punishes marketing-speak and rewards substance. Every post here is written as a builder sharing work, not a brand campaigning. Read each subreddit's self-promo rules before posting; many require participation history first.
> Golden rules: lead with the problem, show real screenshots/output, disclose you're the author, answer every comment, never argue.

---

## Target subreddits

| Subreddit | Angle | Notes |
|---|---|---|
| r/ChatGPTCoding | agent orchestration workflow | most receptive to tooling posts |
| r/ClaudeAI / r/Anthropic | Claude Code orchestration | focus on multi-instance + scheduler |
| r/LocalLLaMA | local-first, no telemetry, agent-agnostic | they care about ownership/control |
| r/ExperiencedDevs | process/traceability angle | NO tool pitch in title; discussion first |
| r/SideProject / r/opensource | open-source launch post | straightforward Show-style post |
| r/programming | only with a substantial write-up link | low tolerance; blog post, not tool ad |
| r/vuejs / r/electronjs | tech-stack case study | "what I learned building X with Electron+Vue" |

---

## Post 1 — r/SideProject / r/opensource (launch "Show" post)

**Title:** I built an open-source workbench that turns AI coding agents into a managed engineering team (PRD → tickets → agents → review)

**Body:**
After months of driving Claude Code through chat sessions and losing my requirements in scrollback, I built the tool I wanted: a desktop workbench where the *plan* lives in git and the agents work a real backlog.

How it works:
- You write a PRD + architecture with AI guidance (documents land in `docs/`, versioned with your code)
- Epics get broken into dependency-ordered tickets in a local SQLite backlog
- A scheduler assigns agents (Claude Code / Codex / Kimi — your choice, per ticket) and runs impl → test → eval phases
- Everything stops at a human review column. Agents can't skip it.

It's local-first (Electron, no hosted service, no account), Apache 2.0, and free — it orchestrates the agent CLIs you already pay for.

Try it: `npx create-ombutocode my-app`
Repo: https://github.com/FrancoisBotha/ombutocode

It's beta (v0.2.4) — Windows is the primary platform, macOS/Linux via bash launcher. Honest about the rough edges; bug reports very welcome. Happy to answer anything about how the scheduler/retry/eval loop works.

---

## Post 2 — r/ChatGPTCoding / r/ClaudeAI (workflow post, tool second)

**Title:** My workflow for running multiple coding agents through a real backlog instead of one giant chat session

**Body:**
Sharing the workflow that finally made multi-agent coding productive for me. The short version: stop treating the agent like a pair programmer and start treating it like a team you manage.

1. **Write the PRD first, in the repo.** Not in chat. A markdown file the agent reads at the start of every task. Same for architecture.
2. **Tickets, not prompts.** Each unit of work is a scoped ticket with acceptance criteria and explicit dependencies. Agents only pick up tickets whose dependencies are done.
3. **Phases per ticket:** implement (tests-first) → run the test suite → an *eval* pass where a second agent session judges the work against the acceptance criteria → human review.
4. **Retry ceilings.** An agent gets N attempts at a failing ticket, then it's unassigned and flagged for diagnosis instead of burning tokens in a loop.

I ended up building an open-source workbench around this (disclosure: I'm the author — Ombuto Code, link in comments to respect sub rules). But the workflow works with any tooling: the load-bearing part is requirements-in-git + scoped tickets + a review gate the agent can't cross.

What does everyone else do for the "agent failed three times" case? That was the hardest part to get right.

---

## Post 3 — r/ExperiencedDevs (discussion post — NO link in post)

**Title:** Those of you using AI agents for real feature work: what does your review/traceability story look like?

**Body:**
Genuine question for people shipping production code with agent assistance. The codegen is no longer the bottleneck for us — the process around it is:

- When an agent writes a feature, what links the diff back to the requirement? Anything?
- Do you gate agent output behind the same PR review as human code, or something stricter?
- Has anyone formalised retry policies (agent fails task N times → escalate to human) rather than just re-prompting?

I've been building toward "requirements live in git next to the code, every agent task traces to a ticket, hard review gate at the end" and it's working well, but I'm curious what shapes other teams have landed on — especially at larger team sizes.

*(If anyone wants to see my setup I can share in comments — it's open source — but I'm mostly here for how others are handling this.)*

---

## Post 4 — r/LocalLLaMA (ownership angle)

**Title:** Open-source, local-first workbench for orchestrating coding agents — your docs, tickets, and DB never leave your repo

**Body:**
Posting here because this sub cares about the thing most agent tooling gets wrong: ownership.

Ombuto Code is a desktop workbench (Electron, Apache 2.0) that manages planning docs, a ticket backlog, and an agent scheduler — entirely on your machine. Planning documents are markdown in your git repo. The backlog is SQLite in a dot-folder. No account, no hosted service, no telemetry. The only network traffic is whatever the agent CLIs you configure (Claude Code / Codex / Kimi today) make themselves.

The agent layer is a YAML config, so adding another CLI-driven agent is straightforward — the tool shells out to a command and watches the run. If folks here want a local-model agent CLI wired in, the config is the extension point and I'd genuinely welcome the PR.

Repo: https://github.com/FrancoisBotha/ombutocode · `npx create-ombutocode my-app` · beta, Windows-first.

---

## Comment-section prep (all posts)

**"Why not just use [Cursor/Copilot/Devin/etc.]?"**
→ Different layer. Those are agents/editors. This is the management layer that schedules agents and keeps requirements + review in the loop. It runs the agent CLIs rather than replacing them.

**"Electron, ugh."**
→ Fair. It needs embedded terminals (xterm + PTY) per agent session, a file tree, and a kanban over SQLite — Electron made that shippable by one person. It's Apache 2.0 if anyone wants to prove a lighter shell works.

**"This is overkill, I just prompt and it works."**
→ For an afternoon project, agreed — don't use this. It earns its keep when a project outlives your context window: multiple sessions, multiple agents, requirements that need to stay true over weeks.

**"Windows-first? In 2026?"**
→ Author's daily driver. macOS/Linux work via the bash launchers and CI for them is improving — file an issue with your platform and I'll prioritise by actual users.

**"How do you stop agents from breaking each other's work?"**
→ Dependency gates (a ticket only starts when its dependencies reach review/done), worktree isolation per ticket, and a merge step with conflict handling. Plus the retry ceiling so failures stop instead of compounding.
