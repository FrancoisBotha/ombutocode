# Upgrading Ombuto Code

This guide explains how to upgrade the **Ombuto Code workbench** inside an
existing project — the `.ombutocode/` directory that was scaffolded into
your repo when you ran `npx create-ombutocode`.

> **The short version:** close the app, commit, then run
> `npx create-ombutocode@latest --upgrade` from your project root. The
> installer backs up your database and configuration to a zip, replaces
> only the workbench code, reinstalls its dependencies, and leaves the rest
> of your project alone. Everything below is the detail.
>
> The in-app update notification ("⬆ UPDATE vX.Y.Z" in the status bar)
> tells you a new release is available and links you here — it does not
> modify your `.ombutocode/` directory itself. An in-app "Update Now"
> button that runs the same upgrade and restarts the app is on the roadmap.

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
2. **Close the running workbench app.** The installer refuses to upgrade
   while the app holds `.ombutocode/.instance.lock`, and for good reason:
   an open app causes file-lock errors on Windows when the upgrade replaces
   `.ombutocode/src/node_modules/`, and it may be mid-write to the
   database.
3. **Read the release notes** for the version you're upgrading to:
   https://github.com/FrancoisBotha/ombutocode/releases — there may be
   version-specific migration steps or breaking changes called out
   there. Always read these *before* running the upgrade, not after.
4. **Upgrading by hand (method B)?** Back up
   `.ombutocode/data/ombutocode.db` yourself first. This SQLite database
   holds your backlog tickets, runs, logs, and archived tickets. It is
   the one file you cannot afford to lose. (Method A does this for you.)
   ```bash
   cp .ombutocode/data/ombutocode.db .ombutocode/data/ombutocode.db.pre-upgrade
   ```

---

## What to preserve, what to replace

Inside `.ombutocode/`, some files are **workbench code** (safe to overwrite
with the new release) and some are **your project's state** (must be
preserved). These two lists are the contract that `--upgrade` implements:
it deletes or writes *only* the paths in the first list, never wipes the
directory, and leaves anything not named here exactly as it found it.

### Overwrite with the new release

- `.ombutocode/src/` — the workbench Electron/Vue source code (deleted
  entirely, including `node_modules/`, and replaced)
- `.ombutocode/tools/` — CLI tools used by coding agents
- `.ombutocode/templates/` — epic/backlog/skill templates
- `.ombutocode/scripts/` — migration and seed scripts
- `.ombutocode/bench/` — the benchmark harness (newer releases)
- `.ombutocode/buildandrun*`, `.ombutocode/initombuto*` — launcher scripts
- `.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md`
- `.ombutocode/README.md`
- `.ombutocode/LICENSE`
- `.ombutocode/codingagent-templates.json`

### Preserve (do **not** overwrite)

- `.ombutocode/data/` — your SQLite database (`ombutocode.db`), per-ticket
  JSON files, headless settings, request data, and any archive DBs.
  **Everything under here is yours.**
- `.ombutocode/logs/` — run audit logs (gitignored; keep or delete as
  you see fit)
- `.ombutocode/run-output/` — agent stdout/stderr logs (gitignored; same
  as above)
- `.ombutocode/codingagent-state.json` — runtime state for active agents
- `.ombutocode/codingagents/codingagents.yml` — your agent configuration.
  Edits made through the in-app Settings UI live in this file. Method A
  never overwrites it; if the new release ships a different default it is
  written alongside as `codingagents.yml.new` for you to compare and
  merge. Doing it by hand, copy the release's file over only if you never
  touched yours.
- `.ombutocode/profiles/` — run profiles. Method A only *adds* profiles
  the release ships that you do not have; existing ones are never touched.
- `.ombutocode/features/` — project feature state (if present)
- `.ombutocode/planning/` — backlog YAML (if present; most is now in the DB)

### `docs/`

Your `docs/` are never modified by an upgrade. The only thing method A
writes there is a skill file under `docs/Skills/` that the new release
ships and your project does not have yet — the same file-by-file rule
`initombuto` uses — so a new skill shows up on the Plan pages without
touching anything you have edited.

### Do **not** run `.ombutocode/initombuto`

Not even with `--keep-docs`. It resets the database, ticket files, feature
specs and agent state before it seeds anything, and without `--keep-docs`
it also deletes `docs/`. `initombuto` is for setting up a **brand new**
project, not for upgrading an existing one.

---

## Upgrade method A (recommended): `npx create-ombutocode --upgrade`

```bash
cd /path/to/your-project
npx create-ombutocode@latest --upgrade
```

`@latest` matters: each installer version is pinned to one workbench
release, so this upgrades you to whatever the newest installer ships. Pass
a directory (`--upgrade /path/to/project`) to upgrade a project you are not
currently in. In order, the installer:

1. **Checks the project.** It must contain `.ombutocode/src/package.json`
   (a directory without a workbench gets a hint to use `--into-existing`
   instead). If `.ombutocode/.instance.lock` names a running Electron
   process the upgrade stops and asks you to close the app. If the project
   is already at the installer's release it says so and exits without
   changing anything (`--force` reinstalls anyway; `--force` is also
   required to downgrade).
2. **Backs up your state** to
   `.ombutocode-backup-<current-version>-<YYYYMMDD-HHMMSS>.zip` in the
   project root: everything under `data/`, `codingagents/`, `planning/`,
   `features/` and `profiles/`, plus `codingagent-state.json` and the old
   `src/package.json` as a version marker. The archive is verified before
   anything is touched. `--no-backup` skips this.
3. **Fetches the pinned release** into a temporary directory, exactly as a
   fresh install does.
4. **Replaces the workbench code** — the "Overwrite" list above, and
   nothing else. `codingagents.yml`, `profiles/` and `docs/Skills/` get the
   additive treatment described in the preceding section.
5. **Reinstalls dependencies** in the new `.ombutocode/src/`
   (`--omit-dev` gives the headless-only install, as with the other modes).
6. **Prints** the old and new version, the backup path, and reminds you to
   review `git status` and commit.

Afterwards, review and commit:

```bash
git status
git add -A .ombutocode docs
git commit -m "Upgrade Ombuto Code to 0.2.15"
```

The backup zip is left in the project root, untracked. Delete it once you
are happy with the upgrade, or add `.ombutocode-backup-*.zip` to your
`.gitignore` if you would rather keep it around.

If `codingagents/codingagents.yml.new` appeared, diff it against your
`codingagents.yml`, merge whatever you want (new agent entries, changed
defaults), and delete the `.new` file.

### If it fails partway

Everything before step 4 is read-only for your project. If something fails
during or after step 4 the installer says so: `.ombutocode/` may be
half-replaced. To get back to where you were:

```bash
git checkout -- .ombutocode                        # workbench code, if committed
unzip -o .ombutocode-backup-<version>-<stamp>.zip  # your state, from the project root
```

On Windows PowerShell: `Expand-Archive -Force .ombutocode-backup-<version>-<stamp>.zip .`
The zip's entries are rooted at `.ombutocode/`, so extracting at the
project root puts every file back exactly where it came from. Fix the
cause (usually a locked file or a failed `npm install`) and run the
upgrade again.

### Flags

| Flag | Effect |
|------|--------|
| `--upgrade [<dir>]` | Upgrade the workbench in `<dir>` (default: current directory). |
| `--no-backup` | Skip the backup zip. |
| `--force` | Proceed even if the project is already at, or newer than, the installer's release. |
| `--omit-dev` | `npm install --omit=dev --legacy-peer-deps` in the new `src/` (headless-only). |

---

## Upgrade method B: by hand, if you cannot run the installer

Use this only when `npx` is not an option (no npm access, an air-gapped
machine, a policy against running installers). It does the same thing as
method A, step by step, and you provide the safety net yourself.

First get a copy of the new release's `.ombutocode/` from anywhere
**outside** your project — either by scaffolding a scratch project with the
installer, or by cloning the release tag directly:

```bash
cd /tmp    # or anywhere you like

# Option 1: scaffold a scratch project (installs dependencies too)
npx create-ombutocode@latest ombutocode-upgrade-scratch

# Option 2: clone the release tag
git clone --depth 1 --branch v0.2.15 https://github.com/FrancoisBotha/ombutocode.git ombutocode-upgrade-scratch
```

Replace `v0.2.15` with the tag you're upgrading to. Check the available
tags at https://github.com/FrancoisBotha/ombutocode/tags.

Then, from your real project root:

```bash
cd /path/to/your-project

# 1. Back up your data
cp .ombutocode/data/ombutocode.db .ombutocode/data/ombutocode.db.pre-upgrade

# 2. Remove the parts of .ombutocode/ that should be overwritten.
#    This keeps data/, logs/, run-output/, codingagent-state.json,
#    codingagents/, profiles/ and any .gitignored paths intact.
rm -rf .ombutocode/src
rm -rf .ombutocode/tools
rm -rf .ombutocode/templates
rm -rf .ombutocode/scripts
rm -rf .ombutocode/bench
rm -f  .ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md
rm -f  .ombutocode/README.md
rm -f  .ombutocode/LICENSE
rm -f  .ombutocode/codingagent-templates.json
rm -f  .ombutocode/buildandrun .ombutocode/buildandrun.bat .ombutocode/buildandrun.sh
rm -f  .ombutocode/initombuto  .ombutocode/initombuto.bat

# 3. Copy the fresh workbench from the scratch copy
cp -R /tmp/ombutocode-upgrade-scratch/.ombutocode/src         .ombutocode/
cp -R /tmp/ombutocode-upgrade-scratch/.ombutocode/tools       .ombutocode/
cp -R /tmp/ombutocode-upgrade-scratch/.ombutocode/templates   .ombutocode/
cp -R /tmp/ombutocode-upgrade-scratch/.ombutocode/scripts     .ombutocode/
cp -R /tmp/ombutocode-upgrade-scratch/.ombutocode/bench       .ombutocode/
cp    /tmp/ombutocode-upgrade-scratch/.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md .ombutocode/
cp    /tmp/ombutocode-upgrade-scratch/.ombutocode/README.md   .ombutocode/
cp    /tmp/ombutocode-upgrade-scratch/.ombutocode/LICENSE     .ombutocode/
cp    /tmp/ombutocode-upgrade-scratch/.ombutocode/codingagent-templates.json .ombutocode/
cp    /tmp/ombutocode-upgrade-scratch/.ombutocode/buildandrun* .ombutocode/
cp    /tmp/ombutocode-upgrade-scratch/.ombutocode/initombuto*  .ombutocode/

# 4. Add profiles and skills you do not have yet (never overwrite existing ones)
cp -n /tmp/ombutocode-upgrade-scratch/.ombutocode/profiles/* .ombutocode/profiles/ 2>/dev/null || true
cp -Rn /tmp/ombutocode-upgrade-scratch/.ombutocode/templates/skills/. docs/Skills/

# 5. If you never customised codingagents.yml, also copy it:
# cp /tmp/ombutocode-upgrade-scratch/.ombutocode/codingagents/codingagents.yml .ombutocode/codingagents/

# 6. Delete the scratch copy
rm -rf /tmp/ombutocode-upgrade-scratch
```

On Windows PowerShell, substitute `Copy-Item -Recurse -Force` /
`Remove-Item -Recurse -Force` for the `cp -R` / `rm -rf` lines, and pick
any scratch directory (e.g. `$env:TEMP\ombutocode-upgrade-scratch`).

> **Windows alternative:** the repo also ships a small GUI migrator
> (`migration-tool/migrate-ombutocode.exe` in the cloned source) that
> performs steps 1–6 for you — point it at the cloned release (source)
> and your project (target), Preview, then Migrate. It also moves your
> existing skills into the v0.2.4 category folders automatically.

### Finalise method B: reinstall dependencies and restart

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

## Version-specific notes

### Upgrading to 0.2.4

- **Skill categories.** Skills now live in category sub-folders under
  `docs/Skills/` (PRD, Architecture, Styling, Epics, BDD, Ticket
  Generation, Diagnostics, Bootstrapping, Other), and each Plan page
  shows only its own category. Your existing flat skill files keep
  working — they appear under the "Other" category — but to get the
  per-page filtering, move them into the matching sub-folders (the
  Windows GUI migrator does this automatically; on macOS/Linux move the
  files by hand or via the in-app Document Explorer).
- **Requests database.** The `requests` table self-migrates on first
  launch (`feature_ref` → `epic_ref`, preserving linked epics). No
  manual steps; you'll see a `[RequestsDb] Migrated:` line in the logs.
- **Dark theme default.** New installs default to dark. Existing
  installs keep whatever theme is saved in settings.
- **Menu reorganisation.** Epics, Logs, and Archive moved from Build to
  the new **Review** tab; Mockups/Style Guide/Data Model are grouped
  under **Design** in Plan; Use Cases and Class Diagrams left the menu
  (their documents remain reachable via the Document Explorer).

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
you exactly what to run. If in doubt, the backup zip (method A) or your
`ombutocode.db.pre-upgrade` copy (method B) lets you roll back by putting
the old file back in place and relaunching.

---

## Rolling back a failed upgrade

If something goes wrong:

1. Close the app.
2. Restore the old database and configuration:
   ```bash
   # Method A: the backup zip extracts straight back into .ombutocode/
   unzip -o .ombutocode-backup-<version>-<stamp>.zip

   # Method B: swap your manual copy back in
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

## Roadmap: in-app upgrades

The installer's `--upgrade` covers the mechanics — preserving state,
replacing the code by allow-list, reinstalling dependencies, and leaving a
verified backup to fall back on. Still planned is an in-app "Update Now"
button that runs it for you and restarts the Electron app once the new
code is in place, plus a proper schema-migration system so version-specific
database steps stop being manual. Until that ships, the in-app status-bar
notification will continue to link you back to this guide.

---

## Got stuck?

File an issue at https://github.com/FrancoisBotha/ombutocode/issues and
include:

- The version you're upgrading from and to (About dialog shows the
  current version)
- The exact error message, and the installer's full output if you used
  method A
- Your OS (Windows / macOS / Linux)
- Whether you were following method A or method B above
