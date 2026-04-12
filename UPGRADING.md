# Upgrading Ombuto Code

This guide explains how to upgrade the **Ombuto Code workbench** inside an
existing project — the `.ombutocode/` directory that was scaffolded into
your repo when you ran `npx create-ombutocode`.

> **Automated upgrades are not yet implemented.** The in-app update notification
> ("⬆ UPDATE vX.Y.Z" in the status bar) currently just tells you a new
> release is available and links you here — it does not modify your
> `.ombutocode/` directory. The upgrade steps below are manual. An
> in-app "Update Now" button that performs the upgrade atomically,
> preserves your database, and runs schema migrations is on the roadmap
> as a follow-up epic.

---

## Who needs this guide?

- **Existing projects** — if your repo already has `.ombutocode/` at an
  older version and you want to pull in a newer workbench release, read
  on.
- **New projects** — you do **not** need this guide. `npx create-ombutocode`
  always scaffolds the latest released version of the workbench
  (the installer is pinned to a specific release tag, and the maintainer
  bumps that pin with every release, so `npx create-ombutocode@latest`
  always gives you the current workbench). Just run the installer and
  you're done.

---

## Before you start

1. **Commit everything in your repo first.** The upgrade will overwrite
   files inside `.ombutocode/`; a clean Git working tree means you can
   diff, revert, or cherry-pick if anything surprises you.
2. **Back up `.ombutocode/data/ombutocode.db`.** This SQLite database
   holds your backlog tickets, runs, logs, and archived tickets. It is
   the one file you cannot afford to lose.
   ```bash
   cp .ombutocode/data/ombutocode.db .ombutocode/data/ombutocode.db.pre-upgrade
   ```
3. **Close the running workbench app.** Leaving it open during an
   upgrade can cause file-lock errors on Windows when the new code
   tries to replace `.ombutocode/src/node_modules/`.
4. **Read the release notes** for the version you're upgrading to:
   https://github.com/FrancoisBotha/ombutocode/releases — there may be
   version-specific migration steps or breaking changes called out
   there. Always read these *before* running the upgrade, not after.

---

## What to preserve, what to replace

Inside `.ombutocode/`, some files are **workbench code** (safe to overwrite
with the new release) and some are **your project's state** (must be
preserved).

### Overwrite with the new release

- `.ombutocode/src/` — the workbench Electron/Vue source code
- `.ombutocode/tools/` — CLI tools used by coding agents
- `.ombutocode/templates/` — epic/backlog/skill templates
- `.ombutocode/scripts/` — migration and seed scripts
- `.ombutocode/buildandrun*`, `.ombutocode/initombuto*` — launcher scripts
- `.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md`
- `.ombutocode/README.md`
- `.ombutocode/LICENSE`
- `.ombutocode/codingagent-templates.json`

### Preserve (do **not** overwrite)

- `.ombutocode/data/` — your SQLite database (`ombutocode.db`), request
  data, and any archive DBs. **Everything under here is yours.**
- `.ombutocode/logs/` — run audit logs (gitignored; keep or delete as
  you see fit)
- `.ombutocode/run-output/` — agent stdout/stderr logs (gitignored; same
  as above)
- `.ombutocode/codingagent-state.json` — runtime state for active agents
- `.ombutocode/codingagents/codingagents.yml` — **if you customised it.**
  If you only ever edited it through the in-app Settings UI, the edits
  live in this file and must be preserved. If you never touched it, the
  new release's copy is fine.
- `.ombutocode/features/` — project feature state (if present)
- `.ombutocode/planning/` — backlog YAML (if present; most is now in the DB)

### Do **not** run `.ombutocode/initombuto --clear`

It will delete `docs/` content and wipe the database. `initombuto` is
for setting up a **brand new** project, not for upgrading an existing
one.

---

## Upgrade method A (recommended): scaffold a scratch project and copy

This is the lowest-risk approach. You scaffold a fresh project with the
new release in a scratch directory, then copy the new `.ombutocode/`
contents over yours (skipping the preserved paths above). The installer
already handles `npm install` and all the fiddly bits.

```bash
# 1. From anywhere OUTSIDE your project, scaffold a scratch project
cd /tmp    # or anywhere you like
npx create-ombutocode@latest ombutocode-upgrade-scratch

# 2. From your real project root, back up your data
cd /path/to/your-project
cp .ombutocode/data/ombutocode.db .ombutocode/data/ombutocode.db.pre-upgrade

# 3. Remove the parts of .ombutocode/ that should be overwritten.
#    This keeps data/, logs/, run-output/, codingagent-state.json, and
#    any .gitignored paths intact.
rm -rf .ombutocode/src
rm -rf .ombutocode/tools
rm -rf .ombutocode/templates
rm -rf .ombutocode/scripts
rm -f  .ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md
rm -f  .ombutocode/README.md
rm -f  .ombutocode/LICENSE
rm -f  .ombutocode/codingagent-templates.json
rm -f  .ombutocode/buildandrun .ombutocode/buildandrun.bat .ombutocode/buildandrun.sh
rm -f  .ombutocode/initombuto  .ombutocode/initombuto.bat

# 4. Copy the fresh workbench from the scratch project
cp -R /tmp/ombutocode-upgrade-scratch/.ombutocode/src         .ombutocode/
cp -R /tmp/ombutocode-upgrade-scratch/.ombutocode/tools       .ombutocode/
cp -R /tmp/ombutocode-upgrade-scratch/.ombutocode/templates   .ombutocode/
cp -R /tmp/ombutocode-upgrade-scratch/.ombutocode/scripts     .ombutocode/
cp    /tmp/ombutocode-upgrade-scratch/.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md .ombutocode/
cp    /tmp/ombutocode-upgrade-scratch/.ombutocode/README.md   .ombutocode/
cp    /tmp/ombutocode-upgrade-scratch/.ombutocode/LICENSE     .ombutocode/
cp    /tmp/ombutocode-upgrade-scratch/.ombutocode/codingagent-templates.json .ombutocode/
cp    /tmp/ombutocode-upgrade-scratch/.ombutocode/buildandrun* .ombutocode/
cp    /tmp/ombutocode-upgrade-scratch/.ombutocode/initombuto*  .ombutocode/

# 5. If you never customised codingagents.yml, also copy it:
# cp /tmp/ombutocode-upgrade-scratch/.ombutocode/codingagents/codingagents.yml .ombutocode/codingagents/

# 6. Delete the scratch project
rm -rf /tmp/ombutocode-upgrade-scratch
```

On Windows PowerShell, substitute `Copy-Item -Recurse -Force` /
`Remove-Item -Recurse -Force` for the `cp -R` / `rm -rf` lines, and pick
any scratch directory (e.g. `$env:TEMP\ombutocode-upgrade-scratch`).

After this, `.ombutocode/data/ombutocode.db` is still your old one. If the
new release introduced schema changes, see the [Database migrations](#database-migrations)
section below.

---

## Upgrade method B: clone the release tag directly

If you prefer not to go through the npx installer:

```bash
# From anywhere OUTSIDE your project
cd /tmp
git clone --depth 1 --branch v0.2.0 https://github.com/FrancoisBotha/ombutocode.git ombutocode-upgrade-scratch

# Then follow steps 2–6 from method A above, using the cloned
# directory as the source instead of the npx scratch project.
```

Replace `v0.2.0` with the tag you're upgrading to. Check the available
tags at https://github.com/FrancoisBotha/ombutocode/tags.

---

## Finalise: reinstall dependencies and restart

After copying the new files into place:

```bash
cd .ombutocode/src
npm install --no-audit --no-fund
cd ../..
```

Then relaunch the app:

- **Windows:** `.ombutocode\buildandrun.bat`
- **macOS / Linux:** `bash .ombutocode/buildandrun`

The About dialog and status bar should now show the new version.

---

## Database migrations

Until there is an automated migration system, the policy is:

- **Patch releases** (`0.1.0` → `0.1.1`) never change the database schema.
  Safe to upgrade with no migration steps.
- **Minor releases** (`0.1.x` → `0.2.0`) *may* change the schema. The
  release notes will call out any required migration and link to a
  migration script (if one exists).
- **Major releases** (`0.x.y` → `1.0.0`) will have a documented migration
  path.

If a release requires a manual migration, the release notes will tell
you exactly what to run. If in doubt, your `ombutocode.db.pre-upgrade`
backup lets you roll back by swapping the file in place and relaunching.

---

## Rolling back a failed upgrade

If something goes wrong:

1. Close the app.
2. Restore the old database:
   ```bash
   mv .ombutocode/data/ombutocode.db .ombutocode/data/ombutocode.db.failed
   mv .ombutocode/data/ombutocode.db.pre-upgrade .ombutocode/data/ombutocode.db
   ```
3. Roll the workbench files back via Git:
   ```bash
   git checkout -- .ombutocode/
   ```
   (Only works if you committed before upgrading — which is why step 1
   of *Before you start* matters.)
4. Reinstall dependencies if `node_modules/` looks inconsistent:
   ```bash
   rm -rf .ombutocode/src/node_modules
   cd .ombutocode/src && npm install --no-audit --no-fund
   ```

---

## Roadmap: automated upgrades

An in-app "Update Now" button that performs the upgrade for you is
planned but not yet implemented. The design needs to handle:

- Preserving the database and any other stateful files atomically
- Running schema migrations between workbench versions
- Safely replacing `.ombutocode/src/node_modules/` on Windows where
  files are often file-locked by running processes
- Recovering cleanly from mid-upgrade failures
- Restarting the Electron app once the new code is in place

Until that ships, the in-app status-bar notification will continue to
link you back to this guide.

---

## Got stuck?

File an issue at https://github.com/FrancoisBotha/ombutocode/issues and
include:

- The version you're upgrading from and to (About dialog shows the
  current version)
- The exact error message
- Your OS (Windows / macOS / Linux)
- Whether you were following method A or method B above
