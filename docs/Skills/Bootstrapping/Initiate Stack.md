---
system: true
---

# Initiate Stack

## Overview

This skill bootstraps — or refreshes — the technical foundation of a project from its PRD and Architecture documents. It is **user-triggered** from the Plan → Initiate Stack menu and **safe to re-run** at any point in the project's life.

After this skill runs, the project should be in a state where:
- The repository's source tree matches the architecture's intended layout (additively; existing source is never overwritten).
- Dependencies declared in the architecture are present and installed.
- `.gitignore` covers the stack's build artifacts, dependency caches, and local state. Existing entries are preserved; new patterns are appended.
- `docs/Test Strategy/test-strategy.md` exists and accurately describes how unit + regression tests are run. Existing manual content is preserved; only stale or missing sections are updated.
- `npm install` / `dotnet restore` / `pip install` / equivalent succeeds, confirming the project builds on this machine.

This is **not** an epic-generation skill. It does not create files in `docs/Epics/`. It does not write to the backlog. It writes to the repository root, the source tree, `.gitignore`, and `docs/Test Strategy/`.

### Two modes — auto-detected, not user-selected

The skill behaves differently depending on what it finds:

- **First-run mode (empty or near-empty repo):** scaffold the source tree, write a new `.gitignore` and `test-strategy.md` from scratch, install deps, verify build.
- **Refresh mode (existing project):** diff what the architecture currently says against what already exists, then propose **only the deltas** — a new package reference, an updated `.gitignore` line, a freshly relevant section in `test-strategy.md`. Never overwrite existing source files. Never replace user-authored prose.

You decide the mode after Step 0 (State Detection); the user does not need to choose.

---

## Inputs (mandatory reading before you do anything)

Read these in order:

1. **`docs/Product Requirements Document/PRD.md`** — the product itself, scope, constraints.
2. **`docs/Architecture/Architecture.md`** — the chosen stack, components, deployment target, data store.
3. **`docs/Style Guide/StyleGuide.md`** (if present) — naming conventions, formatting rules.
4. **`docs/Data Model/Schema.ddl`** (if present) — the data model.

If the architecture document is empty or doesn't name a stack, **stop and ask the user** rather than guessing. The choice of language/framework cascades into every subsequent ticket.

---

## Process

### Step 0 — State Detection (MANDATORY first action)

Before anything else, take inventory of what already exists. Report it to the user in plain prose, then state which mode (first-run vs refresh) you've decided on and why.

Check for:
- **Existing source tree.** Are there any source files outside `docs/` and `.ombutocode/`? Are there language-specific manifests at the repo root (`*.csproj`, `*.sln`, `package.json`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`, `pyproject.toml`, `requirements.txt`, `Gemfile`)? List them.
- **Existing `.gitignore`.** Does one exist? Read it. Note the categories already covered (Ombuto Code's own, language-specific entries, OS/editor entries).
- **Existing `docs/Test Strategy/test-strategy.md`.** Does it exist? If so, read it. Identify which of the 9 mandatory sections are filled, which are stub/empty, and which look hand-authored vs auto-generated.
- **Existing dependency lock state.** Has a build/install ever run successfully? (Look for `package-lock.json`, `obj/project.assets.json`, `Cargo.lock`, `go.sum`, `Pipfile.lock`, etc.)
- **Existing test scaffolds.** Any test directories or test files at all? Note their location and what framework they appear to use.

Then announce your decision:
- *"Empty / near-empty project — running in FIRST-RUN mode."*  → proceed with full scaffolding (Steps 1–6 below).
- *"Existing project detected — running in REFRESH mode."* → only propose deltas. **Never delete or overwrite existing source. Never replace user-written content in `.gitignore` or `test-strategy.md`.**

In refresh mode, every step below changes meaning: instead of *creating* a thing, you *diff* against what's there and propose the smallest additive change. The user confirms each delta before you write.

---

### Step 1 — Confirm the stack

State out loud (in the terminal) what you read in the architecture document:
- Primary language and version
- Application framework(s) (e.g. Avalonia, React + Vite, Spring Boot, FastAPI, Rails)
- Test framework(s)
- Build / package manager (e.g. dotnet CLI, npm, Maven, Gradle, pip + venv, poetry)
- Deployment target (desktop, web, CLI, library, mobile)

Then ask the user to confirm before proceeding. Do not assume — even an obvious stack choice should be reflected back.

### Step 2 — Create or reconcile the source tree

**First-run mode:** lay out the project's directory structure to match the architecture document. Be specific to the stack:

- **.NET solution** → `src/<AppName>/<AppName>.csproj`, `tests/<AppName>.Tests/<AppName>.Tests.csproj`, `<SolutionName>.sln`
- **Node/TypeScript app** → `src/`, `tests/` or `__tests__/`, `tsconfig.json`, `package.json`, optionally a framework-specific scaffold (e.g. `vite create`, `next init`)
- **Python service** → `<package_name>/`, `tests/`, `pyproject.toml` (preferred) or `setup.py + requirements.txt`
- **Java/Gradle** → `src/main/java/<package>`, `src/test/java/<package>`, `build.gradle`
- **Go module** → `cmd/<binary>/main.go`, `internal/`, `go.mod`
- **Rust crate** → `src/main.rs` or `src/lib.rs`, `tests/`, `Cargo.toml`

Initialise the project using the **stack's idiomatic command** rather than hand-writing manifests where possible:
- `.NET`: `dotnet new sln` + `dotnet new <template> -o src/<AppName>` + `dotnet sln add ...`
- `Node`: `npm init -y` then add deps and tsconfig
- `Python`: `python -m venv .venv && .venv\Scripts\activate` (Windows) or `source .venv/bin/activate`, then `pip install`
- `Java/Gradle`: `gradle init --type <type>`
- `Go`: `go mod init <module-path>`
- `Rust`: `cargo new --bin <name>` or `--lib`

Source files at this stage should be **minimal scaffolds**, not feature implementations. The first epic's tickets will fill them in.

**Refresh mode:** do not run any `<framework> new` / `init` command that would overwrite existing files. Instead:
- Compare the architecture's intended layout against what's on disk. List components/folders that the architecture now mentions but that don't yet exist.
- For each missing top-level component, propose creating it (e.g. "Architecture now lists `services/notification/` but it's absent — should I scaffold a minimal project there?"). Wait for the user to confirm before adding anything.
- Never delete or rename existing files, even if their names no longer match the architecture. Surface mismatches as a note in the final report; the user decides what to do with them in a follow-up ticket.

### Step 3 — Install or refresh dependencies

**First-run mode:** run the install command for the stack:
- `dotnet restore`
- `npm install`
- `pip install -e .` (or `pip install -r requirements.txt`)
- `gradle build` / `mvn dependency:resolve`
- `cargo fetch` (Cargo fetches lazily but this validates)

Confirm the install completed without errors. If it failed, fix the manifest and retry once; if it still fails, surface the error to the user rather than papering over it.

**Refresh mode:**
- Run the install command anyway — it's almost always a no-op if everything is in sync, and it surfaces drift if something changed (e.g. a new package was declared in the manifest but not yet locked).
- If the architecture now mentions a dependency that isn't yet in the manifest, propose adding it (`dotnet add package`, `npm install --save`, `pip install` + manifest edit, etc.) and wait for confirmation before running. Do not silently add deps.
- Do not remove existing deps even if the architecture no longer mentions them — that's a deliberate decision the user should make in a follow-up.

### Step 4 — Extend `.gitignore` (never replace)

The rule is **always extend, never replace**, regardless of mode. Even on a first run, the file already exists with Ombuto Code's own entries — your job is to add patterns, not overwrite them.

Procedure:
1. Read the current `.gitignore` in full.
2. Identify which stack-appropriate patterns from the table below are NOT already present (exact-line match — be tolerant of trailing slashes and whitespace).
3. Append only the missing patterns under a clearly labelled section header that names the stack, so future readers can tell which entries came from this skill vs which the user added themselves. Example header: `# .NET (added by Initiate Stack)`.
4. Do not remove or reorder any existing entries, even if they look redundant.

Standard ignore patterns for common stacks (apply whichever match — do not blindly paste all of them):

```
# .NET
**/bin/
**/obj/
*.user
.vs/

# Node / TypeScript
node_modules/
dist/
.next/
.nuxt/
.vite/

# Python
__pycache__/
*.pyc
.venv/
.pytest_cache/
.mypy_cache/
*.egg-info/

# Java / JVM
target/
.gradle/
build/

# Go
*.exe
*.test
/vendor/

# Rust
target/
Cargo.lock      # only for libraries — keep for binaries

# OS / editor
.DS_Store
Thumbs.db
.idea/
.vscode/
```

After updating `.gitignore`, run `git rm -r --cached <paths>` for anything that's already tracked but should now be ignored (e.g. `bin/`, `obj/`, `node_modules/`) — see the Architecture or test strategy of the project for what's relevant. If there are no commits yet, this step is a no-op.

### Step 5 — Write or update `docs/Test Strategy/test-strategy.md`

This file is the **single source of truth** for how every subsequent ticket's test phase validates work. Future test-phase agents read it first.

Procedure depends on the mode you decided in Step 0:

**First-run mode (file does not exist):**
- Create the `docs/Test Strategy/` folder.
- Write `test-strategy.md` with all 9 sections below, fully populated with specific, runnable commands.

**Refresh mode (file already exists):**
- Read the existing file in full.
- For each of the 9 mandatory sections:
  1. If the section is missing entirely, add it (with a comment marker `<!-- added by Initiate Stack refresh on <date> -->` immediately under the section heading).
  2. If the section is present but its commands are stale (e.g. the manifest now declares a different test framework), propose the replacement to the user and wait for confirmation before editing. Preserve any prose the user has added around the commands.
  3. If the section is present and current, leave it alone.
- Never delete user-authored content. If you think something the user wrote is no longer accurate, flag it in the report at the end — do not silently rewrite it.

The 9 mandatory sections:

```
# Test Strategy

## 1. Stack and frameworks
- Language and version:
- Test framework(s):
- Lint tool(s):
- Type-check tool(s):
- Code formatter(s):

## 2. Test directory layout
Where unit tests, integration tests, and regression tests live. Exact paths.

## 3. How to run tests for a specific file or test class
The literal command(s) the test-phase agent should run to verify a single
ticket's tests, e.g. `dotnet test --filter "FullyQualifiedName~<class>"` or
`npx jest <path>` or `pytest <path>::TestClass`.

## 4. How to run the full project test suite
The single command that runs every test in the project. Used by the
regression-test closeout ticket and by epic-level evaluations.

## 5. Lint and type-check commands
Exact commands. Note any project-specific config files (eslintrc, pyproject,
etc.).

## 6. Coverage and reporting
If the project tracks coverage, the command to generate and view a report.
Otherwise note "coverage not tracked".

## 7. Conventions tests must follow
- Naming: e.g. `*.test.ts`, `*Test.cs`, `test_*.py`
- Directory: where new tests for new code should be placed
- Style: arrange-act-assert vs given-when-then, fixture conventions, etc.

## 8. What NOT to test in the per-ticket TDD cycle
Things that belong in regression tests instead (end-to-end UI, slow
integrations, etc.) so the per-ticket agent doesn't blow its budget on them.

## 9. Known pitfalls on this project
e.g. "MSBuild keeps file handles open — `dotnet build-server shutdown`
before exit", "tests must run with HOME=<workdir> on macOS", etc.
```

Fill every section with **specific, runnable commands**, not abstract advice. If a section legitimately has nothing to say (e.g. no coverage tracking), write that explicitly — the file is the agent's playbook, and "TBD" is not a playbook entry.

### Step 6 — Verify the stack builds

Run the project's build command end-to-end:
- `dotnet build`
- `npm run build` (if a build script exists) or just `tsc --noEmit`
- `python -m compileall .`
- `gradle build` / `mvn compile`
- `go build ./...`
- `cargo build`

Then run the test-runner command (which at this stage should find zero tests or one trivial scaffold test) to confirm the test runner itself works:
- `dotnet test`
- `npm test`
- `pytest`
- etc.

If anything fails, fix it before declaring the stack initialised. The whole point of this skill is that downstream agents inherit a working environment.

### Step 7 — Commit the changes

Run a single git commit that captures what this run changed. Tailor the message to the mode:

- **First-run mode:** `git commit -m "Initial stack scaffold: <language>, <framework>"`
- **Refresh mode:** `git commit -m "Refresh stack: <one-line summary of what changed>"` — be specific (e.g. "added xUnit dependency, updated .gitignore for Avalonia, refreshed test-strategy.md §3 with the new --filter command").

Stage only the files you actually touched (`git add <files>`) rather than `git add -A` so an unrelated working-tree change doesn't sneak in.

Then report:
- Files created or modified (with paths)
- Dependencies added (with counts where relevant)
- `.gitignore` additions (which patterns, under which header)
- `test-strategy.md` changes (which sections were added/updated/untouched)
- The exact build + test commands that pass right now
- Any mismatches between architecture and existing code you noticed but did NOT silently fix — the user can decide whether to file follow-up tickets

---

## What this skill does NOT do

- Does not generate any epics.
- Does not write to the backlog.
- Does not create application features — only scaffolding.
- Does not modify the PRD or the Architecture document.
- Does not pick a language for you. If the architecture is silent on stack, ask.

## When to re-run

Designed to be safely re-runnable at any point in the project's life. Typical reasons to invoke it again:

- The architecture has been updated to add a new component or service — you want the scaffold (and `.gitignore`, and `test-strategy.md`) to reflect that.
- A new dependency has been agreed in the architecture and you want it installed + manifested without authoring a dedicated ticket.
- The test strategy needs an extra section because the project now has integration tests / browser tests / a load harness.
- You're auditing whether `.gitignore` still covers everything the build produces.

In every case, the State Detection step (Step 0) routes to refresh mode, which means: **no overwrites of existing source, no rewrites of user-authored prose, only proposed deltas**. The user confirms every change before it lands.

What you should NOT use this skill for:
- Replacing the application's core framework (e.g. Avalonia → WPF) — that's an architecture revision + a migration epic, not a refresh.
- Restructuring directory layout in a way that requires moving existing files — also a migration epic.
- Removing dependencies — also a deliberate cleanup ticket.

These are deliberate exclusions because they require the kind of careful per-file decisions that don't fit a "scaffold or refresh" model.
