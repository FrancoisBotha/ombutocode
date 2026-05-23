# {{PROJECT_NAME}}

Scaffolded with [Ombuto Code](https://ombutocode.com) via `npx create-ombutocode`.

> Replace this README with one that describes your actual product when you
> have one. Until then, this file documents what you just installed and how
> to get it onto GitHub.

## Launch Ombuto Code

From this folder:

**Windows**

```cmd
.ombutocode\buildandrun.bat
```

**macOS / Linux**

```bash
bash .ombutocode/buildandrun
```

First launch takes a little longer — it installs Electron + Vue dependencies
and builds the renderer. Subsequent launches are quick.

## Link this project to a GitHub repo

The installer initialised a local Git repository and made an initial commit,
but it didn't push anywhere. Push to a new GitHub repo of your own:

### Option 1 — GitHub CLI (one-liner)

If you have [`gh`](https://cli.github.com) installed and authenticated:

```bash
gh repo create {{PROJECT_NAME}} --private --source=. --remote=origin --push
```

That creates the repo, wires it up as `origin`, and pushes your initial
commit in one step. Use `--public` instead of `--private` if you want it open.

### Option 2 — Web + Git

1. Open <https://github.com/new>.
2. Repository name: `{{PROJECT_NAME}}` (or any name you like).
3. **Do NOT** tick "Add a README", "Add .gitignore", or "Add a license" —
   your project already has those, and an initial commit on GitHub would
   force you to merge histories before your first push.
4. Click **Create repository**.
5. Back in this folder:

   ```bash
   git remote add origin <repo-url>
   git branch -M main
   git push -u origin main
   ```

   `<repo-url>` is what GitHub shows after creation — HTTPS or SSH form,
   either works.

If `git remote add origin …` says "remote origin already exists" (some
older `create-ombutocode` versions added one), use this instead:

```bash
git remote set-url origin <repo-url>
git push -u origin main
```

### What gets pushed (and what doesn't)

The `.gitignore` is already configured so:

- **Pushed:** `docs/` (your spec, first-class), the `.ombutocode/`
  workbench source + templates + config, and any application source
  code you add.
- **Not pushed:** `.ombutocode/data/` (your local SQLite databases),
  `.ombutocode/logs/`, `.ombutocode/run-output/`, `node_modules/`, and
  build output. These are local-only — every developer regenerates them
  on first launch.

This means collaborators cloning your repo get the same `docs/` and
workbench, but their own scheduler state and database. If you want
teammates to start with the same backlog of tickets, you'll need to
either regenerate them from the shared epics or hand-export the DB
separately.

## Next steps

Open the app and read [GettingStarted.md](GettingStarted.md) — it walks
through the Plan → Build flow end to end: defining a PRD, sketching an
architecture, initiating the project stack, generating epics, and letting
coding agents work the backlog.
