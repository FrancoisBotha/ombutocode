# Ombuto Code Migration Tool

A small Win32 C++ app (`migrate-ombutocode.exe`) that updates an existing
Ombuto Code project with the latest workbench changes from a source repo.

No external dependencies — uses only the standard Windows SDK + C++17
`<filesystem>`.

## Build

From this folder, in a Developer Command Prompt (for MSVC) or any shell
with MinGW in PATH:

```cmd
build.bat
```

Produces `migrate-ombutocode.exe` in the same folder. Output is around
100-200 KB depending on toolchain.

## Use

1. Run `migrate-ombutocode.exe`.
2. **Source** = a fresh checkout of the Ombuto Code repo at the version
   you want to migrate TO (must contain `.ombutocode/src/main.js`).
3. **Target** = your existing Ombuto Code project (must contain a
   `.ombutocode/` folder).
4. Click **Preview** to see what the migration will do.
5. Click **Migrate** to perform it. A confirmation dialog appears first.

## What the migration does

**Overwrites in target:**
- `.ombutocode/src/` (entire folder — excluding `node_modules/` and
  `dist/`, which would carry over platform-specific binaries)
- `.ombutocode/buildandrun.bat`
- `.ombutocode/buildandrun`
- `.ombutocode/codingagents/codingagents.yml`
- `.ombutocode/codingagent-templates.json`

**Backs up first:**
- Target's existing `.ombutocode/src/` → `.ombutocode/src.backup-<timestamp>/`

**Migrates skills to the v0.2.4 category layout** (in both the project's
active `docs/Skills/` and `.ombutocode/templates/skills/`):
- Skills are now organised in category sub-folders: PRD, Architecture,
  Styling, Epics, BDD, Ticket Generation, Diagnostics, Bootstrapping, Other.
- Existing flat skill files are **moved** into their category folder
  (content preserved — user edits travel with the file).
- Skills missing from the target are copied from the source.
- A flat file that also exists in categorised form is left in place
  (never deleted — it may carry user edits) and noted in the log.
- Custom user skills not in the canonical list are untouched; the app
  shows them under the "Other" category until moved into a folder.

**Deletes** (so the next launch rebuilds cleanly):
- Target's `.ombutocode/src/node_modules/`
- Target's `.ombutocode/src/dist/`

**Does NOT touch:**
- `.ombutocode/data/` (your SQLite DBs — backlog, runs, logs; the requests
  table self-migrates `feature_ref` → `epic_ref` on first launch)
- `.ombutocode/logs/`
- `.ombutocode/run-output/`
- `.ombutocode/planning/`
- `docs/` (apart from the skill moves/additions above)

## After migration

In the target project:

```cmd
.ombutocode\buildandrun.bat
```

The launcher does `npm install`, `vite build`, then `electron .`. First
launch after migration takes longer because everything's rebuilding from
scratch.

Version-specific notes for 0.2.4:
- The default theme is now dark — this only affects fresh installs; your
  saved theme setting is preserved.
- The requests database migrates itself on first launch
  (`feature_ref` → `epic_ref`); no manual steps needed.

## Reverting

The pre-migration `src/` is backed up to
`.ombutocode/src.backup-<timestamp>/` in the target project. To revert:

1. Close Ombuto Code.
2. Delete `.ombutocode/src/`.
3. Rename `.ombutocode/src.backup-<timestamp>/` → `.ombutocode/src/`.
4. Run `.ombutocode/buildandrun.bat`.

The backup excludes `node_modules/` and `dist/`, so a rebuild will
populate them.
