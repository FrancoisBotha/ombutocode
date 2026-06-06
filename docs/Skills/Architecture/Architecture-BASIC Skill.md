---
system: true
---

# Architecture-BASIC Skill

## Overview

This is a **deliberately lightweight** alternative to the full Architecture Skill. Use it when the project is small enough that the comprehensive multi-tier template would just produce ceremony — a personal tool, a hobby app, a CLI utility, a small internal service, a weekend prototype that grew up.

An architecture document written with this skill should be **one to three pages**, readable in five minutes, and enough for the developer building it (or a new collaborator) to start work without asking "but how?".

If you find yourself wanting more structure (formal threat models, ADRs, deployment topology, scalability targets, observability strategy), switch to the full **Architecture Skill** instead. Don't try to grow this one into a heavyweight document.

---

## Bias Against Over-Engineering

The single most important guideline. Apply it ruthlessly:

- **Default to *not* documenting something.** Every section, every diagram, every paragraph must justify its existence. Empty placeholders are worse than a missing section.
- **No formal ADRs.** A one-line "we picked X because Y, considered Z" is enough for small projects. Save the Context/Decision/Alternatives/Consequences template for decisions that future maintainers will genuinely question.
- **No formal threat model.** A sentence in the security section about "trust boundary is the user's machine" beats a STRIDE table for a single-user tool.
- **No environment / CI / observability / disaster-recovery sections** unless the project genuinely has any of those. A CLI tool doesn't need an environment strategy.
- **No performance targets in numbers** unless the user has specific requirements. "Should feel fast on a normal laptop" is fine for most personal projects.
- **No future-roadmap or evolution section.** YAGNI applies. If V2 isn't committed, don't architect for it.
- **No diagrams** unless one would genuinely clarify a non-obvious data flow. A diagram of three boxes connected with arrows adds nothing.
- **No technology-as-decoration.** Every named library or framework must earn its place by solving a stated problem.

When in doubt, the answer is: **less, smaller, simpler, fewer.**

---

## Inputs

- **The PRD** — usually a basic one written via the PRD-BASIC skill. If the PRD itself is short and focused, this architecture doc should match its weight.
- **The chosen tech stack** — if the user already has a language / framework / runtime in mind, capture it. If not, ask one targeted question (e.g. "What language are you most comfortable building this in?") and propose.
- **Any hard constraints** — desktop-only, no servers, single-user, must work offline, must run on Windows, no internet at runtime, etc.

If something significant is missing, ask **one** clarifying question. Not a questionnaire.

---

## Process

1. **Read the PRD.** Understand what's being built and the scope boundaries it has set.
2. **Propose a one-paragraph technical summary.** Confirm with the user before writing the full document.
3. **Draft the document in the order below.** Skip sections that don't apply rather than filling them with placeholders.
4. **Show the draft and ask for one round of edits.** Resist the urge to expand on feedback — usually feedback can be addressed by trimming rather than adding.

---

## Output Structure (Minimal)

Only these sections. Skip any that don't apply.

### 1. What We're Building *(required)*
One paragraph. The product in technical terms — what kind of application it is (CLI, desktop, web, etc.), the runtime environment, and the single most important architectural property (offline-only, local-first, single-user, embedded, whatever).

Reference the source PRD by filename. One sentence. No "purpose / audience / status" subsections.

### 2. Tech Stack *(required)*
A short table or bullet list. For each layer that matters: the choice and a one-line reason. Format:

```
- Language: Rust — performance for hashing, single-binary distribution
- Storage: SQLite via rusqlite — embedded, transactional, zero-config
- UI: native CLI via clap — no GUI needed for V1
```

Don't list every transitive dependency. Just the choices that shape the architecture.

### 3. How It's Put Together *(required)*
A few paragraphs sketching the runtime structure. What are the main components/modules, how do they talk to each other, and where does data live?

If — and only if — a diagram would clarify a non-obvious flow, use a small Mermaid diagram. Three boxes connected by arrows is not a non-obvious flow.

Cover:
- The main components or modules (a flat list is usually enough)
- How they communicate (function calls? IPC? messages?) — one sentence is plenty
- Where the source of truth lives (a database? a file? the network?)

### 4. Key Decisions *(required)*
A short bulleted list of choices that shape the architecture and could reasonably have been made differently. Each entry is one line.

Format: `- <decision>: <one-line reason>. Considered <alternative> and rejected because <reason>.`

Examples:
- `- SQLite, not Postgres: single-user desktop app has no need for a server.`
- `- Tauri, not Electron: 50MB binaries vs 150MB; team is comfortable with Rust.`
- `- No background daemon: scheduled via OS cron, keeps the binary tiny.`

If a decision is genuinely obvious, leave it out. The list should contain the choices that future-you might second-guess.

### 5. Security & Data *(required if non-trivial)*
A short section covering only what's actually relevant:
- Where secrets live (OS keychain? env vars? config file with appropriate permissions?)
- Whether data is encrypted at rest, and why or why not
- The trust boundary (one sentence — usually "the user's machine" for personal tools)
- Any compliance constraint that actually applies (most personal projects: none)

If the project handles no secrets and stores no sensitive data, this section is **two sentences** total. Don't pad it.

### 6. Open Questions *(optional)*
Only include if there are actual unresolved decisions. Each one a single line with an owner if relevant. No section if there's nothing to ask.

---

## Quality Bar

A good basic architecture doc is:
- **Short.** One to three pages of Markdown.
- **Specific.** Names the actual libraries and frameworks, not "a web framework".
- **Decisive.** Says what *will* be used and what *won't*. Avoids hedging.
- **Honest about scope.** Says "single-user desktop" not "scalable cross-platform solution".
- **Boring.** Reads like an engineer's notes, not a marketing pitch.

A bad basic architecture doc:
- Includes empty sections marked "TBD".
- Has diagrams that show three boxes.
- Discusses scalability for a single-user tool.
- Has a threat model for a CLI that reads local files.
- Includes a deployment section for a script the user runs by hand.
- Has an evolution / future / roadmap section listing speculative work.

---

## Worked Example

```
# Architecture: Dropbox Folder Backup CLI

## 1. What We're Building
A small command-line tool that backs up a chosen local folder to a Dropbox folder
on a schedule. See PRD at `docs/Product Requirements Document/PRD.md`. The
defining architectural property is that it runs as a stateless one-shot
invocation — no daemon, no background process — and is scheduled by the OS.

## 2. Tech Stack
- Language: Rust — fast, single-binary distribution, great Dropbox SDK story.
- Dropbox client: `dropbox-sdk` crate — official-feeling, actively maintained.
- Keychain: `keyring` crate — cross-platform OS-native secure storage.
- State: SQLite via `rusqlite` — embedded, transactional, zero-config.
- CLI parsing: `clap` — the standard choice.

## 3. How It's Put Together
Three modules, called in sequence on each invocation:
- **auth** — loads the OAuth token from the OS keychain; if missing, runs the
  interactive login flow and stores the result.
- **diff** — reads the previous file hashes from SQLite, walks the local folder,
  and produces a list of changed/new files.
- **upload** — sends the changed files to Dropbox via the SDK, updates the
  hashes in SQLite on success, logs the result.

All communication is synchronous function calls — there's no message bus, no
async runtime beyond what the Dropbox SDK needs internally. The source of
truth is the local SQLite file at `~/.dropbox-backup/state.db`.

## 4. Key Decisions
- No background daemon: scheduled via cron / Task Scheduler. Keeps the binary
  small and the failure mode obvious (it ran, or it didn't).
- SQLite over a flat-file hash list: needed transactional writes so a crash
  mid-run doesn't corrupt the state file.
- Synchronous uploads, no parallelism: simplicity over throughput. Most users
  will sync a small folder; parallel uploads aren't worth the bug surface.
- File metadata (size + mtime) as the change-detection signal, not full
  content hashes: fast, good enough for the use case.

## 5. Security & Data
The trust boundary is the user's machine. The OAuth refresh token is stored in
the OS keychain (Keychain on macOS, Credential Manager on Windows, Secret
Service on Linux via the `keyring` crate). The SQLite state file contains only
file paths and metadata, no secrets — stored in cleartext at standard user
permissions. No compliance requirements apply.

## 6. Open Questions
- Should deletes be mirrored to Dropbox? (Default proposal: no — uploads only.)
```

That's the whole architecture document. Six short sections, fits on one screen,
no diagrams, no ADRs, no deployment topology, no scalability targets. If the
project grows, the doc can grow with it — but start here.
