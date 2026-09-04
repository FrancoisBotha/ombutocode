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
| `--omit-dev` | `npm install --omit=dev --legacy-peer-deps`; no UI toolchain. |
| `-h`, `--help` | Show usage. |

## Publishing

See `DeployInstructions.md` at the repository root: bump `CLONE_REF`,
`VERSION` and `package.json` together, then `npm publish` from this
directory.
