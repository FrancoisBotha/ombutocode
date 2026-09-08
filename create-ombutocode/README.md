# create-ombutocode

The `npx` installer for [Ombuto Code](https://ombutocode.com). Each installer
version clones one pinned workbench release (`CLONE_REF` in
`bin/create-ombutocode.js`), so a given `create-ombutocode` version always
produces the same project.

## Create a new project

```bash
npx create-ombutocode my-project
cd my-project
```

Clones the pinned release into `my-project/`, removes the upstream
maintainer files and sample app, writes a project `README.md`, `CLAUDE.md`
and `GettingStarted.md`, installs the workbench dependencies, seeds `docs/`
with starter documents and skills, and makes an initial git commit.

## Adopt into an existing directory

```bash
npx create-ombutocode --into-existing /path/to/repo
```

Adds Ombuto Code to a directory that already has code in it — typically a
repository you want agents to work on without creating a new project around
it. `<dir>` must exist and must not already contain `.ombutocode/`. The
project name is the directory's basename.

What it does:

- Clones the pinned release into a temporary directory and moves only
  `.ombutocode/` into `<dir>`. The clone's own `docs/` is discarded; the
  `docs/` skeleton (folders, starter documents, `docs/Skills/`) is seeded by
  `initombuto --keep-docs`, which only ever creates files that are missing.
  An existing `docs/` is merged into, never overwritten.
- Writes `README.md`, `CLAUDE.md` and `GettingStarted.md` only if no file of
  that name exists. If `.gitignore` exists, the Ombuto entries
  (`.ombutocode/src/node_modules/`, `.ombutocode/src/release/`,
  `.ombutocode/src/dist/`) are appended only when absent; otherwise a
  `.gitignore` holding just those entries is created.
- Installs the workbench dependencies and runs `initombuto` against `<dir>`.
- Never runs `git init`, `git add` or `git commit`. If `<dir>` is already a
  git repository it prints the commands to commit `.ombutocode/` and
  `docs/`; if it is not, it says so — the scheduler builds in git worktrees,
  so a repository is needed before agents can run.

## Upgrade an existing project

```bash
cd /path/to/project
npx create-ombutocode@latest --upgrade
```

Moves the workbench (`.ombutocode/`) of an existing project to this
installer's pinned release. `<dir>` is optional and defaults to the current
directory; it must contain `.ombutocode/src/package.json` (a directory
without a workbench is pointed at `--into-existing` instead). Use `@latest`
so the newest installer, and therefore the newest release, is the one that
runs. The full contract lives in `UPGRADING.md` at the repository root;
this is the summary.

What it does, in order:

1. Refuses to run if `.ombutocode/.instance.lock` names a live Electron
   process (close the app first), and exits 0 without changes if the
   project is already at the pinned release (`--force` reinstalls; it is
   also required to downgrade).
2. Writes `.ombutocode-backup-<version>-<YYYYMMDD-HHMMSS>.zip` in the
   project root with `data/`, `codingagents/`, `planning/`, `features/`,
   `profiles/`, `codingagent-state.json` and the old `src/package.json`,
   then verifies the archive (entry count, CRCs, `ombutocode.db` present).
   The zip is written with Node's own `zlib` — the installer still has no
   runtime dependencies.
3. Clones the pinned release into a temporary directory, as a fresh
   install does.
4. Replaces workbench code by allow-list and nothing else: `src/`
   (deleted whole, `node_modules` included), `tools/`, `templates/`,
   `scripts/`, `bench/`, `buildandrun*`, `initombuto*`,
   `OMBUTOCODE_ENGINEERING_GUIDE.md`, `README.md`, `LICENSE` and
   `codingagent-templates.json`.
5. Runs `npm install --no-audit --no-fund` in the new `src/`
   (`--omit-dev` applies here too).
6. Prints the old and new version and the backup path.

What it never touches: `.ombutocode/data/` (database, ticket files,
headless settings), `logs/`, `run-output/`, `codingagent-state.json`,
`codingagents/codingagents.yml` (if the release's copy differs it is
written alongside as `codingagents.yml.new` for you to merge), existing
files in `profiles/` (missing ones are added), and every file under
`docs/` — the only thing added there is a skill template under
`docs/Skills/` that the release ships and the project lacks. Anything
under `.ombutocode/` not named in step 4 is left as it was. The project's
own files, `.gitignore` included, are not modified, and nothing is
committed: review `git status` and commit the result yourself.

Restoring from the backup, from the project root:

```bash
git checkout -- .ombutocode                        # the workbench code, if committed
unzip -o .ombutocode-backup-<version>-<stamp>.zip  # your state; Expand-Archive -Force on Windows
```

The zip's entries are rooted at `.ombutocode/`, so it extracts straight
back into place. If the upgrade fails after step 4 has started, the
installer prints these same instructions.

## Headless-only install

```bash
npx create-ombutocode --into-existing /app --omit-dev
npx create-ombutocode my-project --omit-dev
```

Installs with `npm install --omit=dev --legacy-peer-deps`, leaving out
Electron, Vite and electron-builder (about 207 MB of `node_modules` instead
of 467 MB). `--legacy-peer-deps` is needed because `@electron/remote`, a
runtime dependency, lists `electron` as a peer dependency and npm would
otherwise download it anyway. The workbench UI cannot be built from such an
install; it is for the headless CLI (`node .ombutocode/src/headless.js …`)
and containers. Run `npm install` in `.ombutocode/src` later to add the UI
toolchain.

## Options

| Option | Effect |
|--------|--------|
| `<project-name>` | Create a new project directory (must not exist). |
| `--into-existing <dir>` | Adopt into an existing directory instead. Mutually exclusive with `<project-name>`. |
| `--upgrade [<dir>]` | Upgrade the workbench in `<dir>` (default: current directory) to the pinned release. Mutually exclusive with `--into-existing`. |
| `--no-backup` | With `--upgrade`: skip the backup zip. |
| `--force` | With `--upgrade`: proceed even if the project is already at, or newer than, the pinned release. |
| `--omit-dev` | `npm install --omit=dev --legacy-peer-deps`; no UI toolchain. |
| `-h`, `--help` | Show usage. |

## Tests

```bash
node --test create-ombutocode/test/*.test.js
```

Plain `node:test`, no network: the ZIP writer round-trip (cross-checked
against `unzip` or `Expand-Archive` when one is available) and the upgrade
replace step on a fake `.ombutocode/` tree.

## Publishing

See `DeployInstructions.md` at the repository root: bump `CLONE_REF`,
`VERSION` and `package.json` together, then `npm publish` from this
directory.
