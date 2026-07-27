# X (Twitter) Engagement Prompts — Ombuto Code

> Status: DRAFT. A bank of ready-to-post tweets and threads for the v0.2.4 beta launch window and the weeks after.
> Voice: builder talking to builders. Confident, concrete, zero hype-words ("revolutionary", "game-changing" are banned).
> Cadence suggestion: 1 launch thread, then 3–4 singles/week, 1 thread/week. Reply to every comment for the first 48h of each post.

---

## Launch thread (pin this)

**1/**
AI agents can write real software now. So why does working with them still feel like managing a goldfish?

Every session starts from zero. Requirements live in chat scrollback. Nothing is traceable.

I built Ombuto Code to fix that. 🧵

**2/**
Ombuto Code is an open-source desktop workbench that wraps a real engineering workflow around AI coding agents:

Plan → Build → Review

PRDs, architecture, epics, tickets — all in `docs/`, all in git, all read by the agents on every task.

**3/**
The Build mode is a kanban board with an automated scheduler.

Flip on Auto and it assigns agents (Claude / Codex / Kimi) to tickets, enforces dependency order, runs test + eval phases, and stops at a human review column it cannot skip.

**4/**
My favourite small feature: the Ticket Doctor 🩺

When a ticket fails its retry ceiling, you get a stethoscope icon. Click it and an AI diagnostic session opens *on that ticket* with all its failure context loaded.

**5/**
It's local-first and agent-agnostic. No hosted service, no account, no fees. It orchestrates the agent CLIs you already use.

Apache 2.0. One command to try it:

npx create-ombutocode my-app

⭐ https://github.com/FrancoisBotha/ombutocode

**6/**
It's beta (v0.2.4). Things will break. If you file good bug reports, I will love you forever.

What's the first project you'd point an agent team at?

---

## Single posts (rotate over launch weeks)

**The hot take**
Unpopular opinion: "vibe coding" isn't an AI problem, it's a project-management problem. The model is fine. Your requirements live in your head. Write them down where the agent can read them — every session, automatically. That's the whole idea behind Ombuto Code.

**The demo hook**
Watched three AI agents work through a backlog of 12 tickets this morning while I reviewed the first two PRs. The scheduler did the assigning, the dependency ordering, and the test phase. I did the judging. This is the division of labour that actually works. [attach board screen-capture]

**The docs-as-code angle**
Your PRD should live in git. Next to the code it describes. Diffable, reviewable, readable by every AI agent that touches the repo. If your requirements aren't versioned, your agents are guessing.

**The promote-all moment**
New in 0.2.4: "Promote All" + auto-assign. Generate your tickets, hit one button, and the whole backlog flows to the agents in dependency order. It's the closest thing to a "build my app" button I'm willing to ship — because everything still lands in a review column.

**The skills feature**
Skills = reusable Markdown system prompts, organised in category folders (PRD, Architecture, BDD, Diagnostics…). The PRD page only offers PRD skills. Your team's way of writing requirements becomes a file in the repo, not tribal knowledge.

**The honest-beta post**
Ombuto Code is in beta and I'm not pretending otherwise. What works: the full plan → build → review loop, three agent CLIs, the scheduler. What's rough: [current known issue]. Early users who file issues are shaping this thing. npx create-ombutocode

**The traceability post**
Ticket → epic → PRD section → git commit. Every line an agent writes in Ombuto Code traces all the way up. When someone asks "why does the app do X?", you have an answer that isn't "the AI decided to."

---

## Question posts (engagement bait, use sparingly)

- How many AI coding agents do you run in parallel today? 1? 2? More? At what number did coordination become the bottleneck?
- What's in your repo right now: a real PRD, a README that lies, or vibes?
- If an AI agent team shipped a feature and nobody reviewed it... would you deploy it? (Be honest.)
- What's your retry policy when an agent fails a ticket — re-prompt forever, or stop and diagnose?

---

## Reply snippets (for common responses)

**"How is this different from [agent product]?"**
→ Those are agents. This is the workbench *around* agents — planning docs, scheduling, dependency gates, review. It runs Claude Code / Codex / Kimi rather than competing with them.

**"Is it free?"**
→ Yes — Apache 2.0, local-first, no account. You only pay for whichever agent CLIs you already use.

**"Mac/Linux?"**
→ Windows is primary today; macOS/Linux run via the bash launcher. File an issue if something's rough — that's what the beta is for.

**"Can I see it?"**
→ 5-min intro video: [link] · or just `npx create-ombutocode demo` — it scaffolds with sample docs to poke at.
