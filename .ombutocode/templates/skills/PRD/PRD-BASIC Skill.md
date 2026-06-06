# PRD-BASIC Skill

## Overview

This is a **deliberately lightweight** alternative to the full PRD Skill. Use it when the goal is a small, focused product — a personal tool, a hobby project, a utility, a single-purpose app — and the heavy-weight multi-role PRD template would just generate ceremony you don't need.

A PRD written with this skill should be **one to two pages**, readable in under five minutes, and enough to start building.

If you find yourself wanting more structure (multiple personas, formal risks, KPIs, phased roadmaps), switch to the full **PRD Skill** instead. Don't try to grow this one into a heavyweight document.

---

## Bias Against Over-Engineering

The single most important guideline. Apply it ruthlessly:

- **Default to *not* including a feature.** Every feature must justify its existence with a clear, concrete user need.
- **One persona, not many.** Most small products serve one clear user; don't invent secondary or anti-personas to look thorough.
- **No vision section.** A 1–3 year vision is wasted effort for a tool that may not exist in 6 months. Cut it.
- **No success metrics section** unless the product genuinely has a feedback loop you'll measure (most personal tools don't).
- **No risks-and-mitigations table** unless there's a real risk (data loss, money handling, regulated data). For a CLI utility, "the code might have bugs" isn't a risk worth documenting.
- **No phased roadmap.** Phase 1 is what you're building. Phase 2+ is speculation — cut it.
- **No buzzwords.** "Leverages", "synergies", "AI-powered", "enterprise-grade" — out. Plain English.
- **Cut sections that don't apply.** A 5-section PRD covering exactly what's needed beats a 12-section template with empty placeholders.

When in doubt, the answer is: **less, smaller, simpler, fewer.**

---

## Process

1. **Ask one clarifying question if the brief is unclear** — typically "what's the single thing this product helps someone do?". One question. Not a clarification questionnaire.
2. **Propose a one-line product description.** Confirm before going further.
3. **Draft the PRD using the structure below.** Skip sections that don't apply rather than filling them with placeholders.
4. **Show the draft and ask for one round of edits** before saving. Resist the urge to expand on feedback — usually feedback can be addressed by removing words, not adding them.

---

## Output Structure (Minimal)

Only these sections. Skip any that don't apply.

### 1. What It Is *(required)*
One paragraph. What the product is, who it's for, and the single problem it solves.

### 2. Who Will Use It *(required)*
One paragraph describing one user. Their context (technical level, when/where they use the product), and the specific pain point that motivates the product. No formal persona template, no demographic detail unless it matters.

### 3. Must-Have Features *(required)*
A short bulleted list — typically 3 to 7 items. Each item is one line. Format: `- Feature name — what it does in plain English.`

If the list is longer than 7, you are probably over-scoping. Push items into "Won't Build" or cut them.

### 4. Won't Build *(required)*
A short bulleted list of features deliberately left out. This section is **as important as Must-Have Features** — it's how you protect the scope.

Include things that sound reasonable but you've decided against (with a 5-word reason if non-obvious): `- Mobile app — desktop only`, `- Multi-user accounts — single-user tool`, `- Plugin system — not worth the complexity`.

### 5. How It Works *(required if there's any non-trivial tech)*
A few sentences sketching the technical approach. Programming language, framework, where data lives, key external dependencies. No architecture diagrams, no component lists, no "scalability considerations" unless the product genuinely needs to scale.

Skip this section entirely if the product is a single-file script or trivially obvious to build.

### 6. Open Questions *(optional)*
Only include if there are actual unresolved decisions. Each one a single line. No section if there's nothing to ask.

---

## Quality Bar

A good basic PRD is:
- **Short.** One to two pages of Markdown.
- **Specific.** "Lets the user back up Dropbox folders" not "provides backup capabilities".
- **Decisive.** Says what *will* be built and what *won't*. Avoids "TBD" and "to be decided".
- **Tech-aware.** Mentions the actual tech stack, not abstract architecture.
- **Boring.** Reads like a plain product description, not a sales pitch.

A bad basic PRD:
- Tries to look thorough by adding sections that don't apply.
- Uses buzzwords or marketing language.
- Lists features without saying what's *not* in scope.
- Mentions "phases" or "roadmaps" for a project that doesn't have a real timeline.
- Hedges every commitment with "could" / "might" / "may".

---

## Worked Example

```
# PRD: Dropbox Folder Backup CLI

## 1. What It Is
A small command-line tool that backs up a chosen local folder to a Dropbox folder
on a schedule. For people who already use Dropbox and want one more folder backed
up without using the Dropbox desktop client.

## 2. Who Will Use It
A developer or sysadmin who's comfortable with the command line and has a folder
(e.g. `~/projects/notes`) they want backed up to Dropbox alongside everything
else. They don't want to drag the folder into the Dropbox sync directory because
that changes how their local tools find it.

## 3. Must-Have Features
- One-time auth — log in via Dropbox OAuth, store a token in the user's keychain.
- Manual sync — `dropbox-backup sync <local-path> <dropbox-path>` uploads what's
  changed since the last run.
- Diff detection — skip files that haven't changed (by size + mtime).
- Schedule via OS cron / Task Scheduler — the tool itself doesn't run a daemon.
- Simple log — last run timestamp and file count to a known location.

## 4. Won't Build
- GUI — CLI only.
- Two-way sync — uploads only, no downloads.
- File versioning — Dropbox already does that.
- Encryption — Dropbox's own encryption is enough for this use case.
- Multi-user / team support — single-user tool.

## 5. How It Works
Rust binary using the official Dropbox SDK. Token is stored in the system
keychain via the `keyring` crate. State (file hashes, last sync time) lives in a
SQLite DB at `~/.dropbox-backup/state.db`. No background process — the user
schedules it via cron or Task Scheduler.

## 6. Open Questions
- Should deletes be mirrored to Dropbox, or treated as ignored? (Default: ignored.)
```

That's the whole PRD. Six sections, fits on one screen, no roadmap, no risks
table, no success metrics. If the product grows, the PRD can grow with it — but
start here.
