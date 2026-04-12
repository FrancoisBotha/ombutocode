# Deployment Instructions

This document describes the release workflow for **Ombuto Code**:

1. How to increment the semantic version
2. How to cut a new GitHub release
3. How to publish the `create-ombutocode` installer to npm so `npx create-ombutocode` picks up the latest version

All steps assume you are on `main`, the working tree is clean, and you have push rights to `github.com/FrancoisBotha/ombutocode` as well as publish rights to the `create-ombutocode` npm package.

---

## 1. Increment the Semantic Version

Ombuto Code follows [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

| Change type | Bump |
|---|---|
| Breaking API / data-format / config changes | `MAJOR` (`0.1.0` → `1.0.0`) |
| New backwards-compatible feature | `MINOR` (`0.1.0` → `0.2.0`) |
| Bug fix, doc update, internal refactor | `PATCH` (`0.1.0` → `0.1.1`) |

> While the project is in **Beta (0.x.y)**, treat any user-visible breaking change as a `MINOR` bump. A `MAJOR` bump is reserved for the eventual 1.0.0 release.

### Files to update

The version lives in exactly **one** source of truth that flows through to the About dialog and status bar:

- **`.ombutocode/src/package.json`** — `"version"` field.
  The `app:getBuildInfo` IPC handler in `.ombutocode/src/main.js` reads this file, and both the About modal (`BoardList.vue`) and the status bar (`StatusBar.vue`) render it.

> **Note:** The Apache 2.0 `LICENSE` file lives under `.ombutocode/LICENSE` (not the repo root), so that when the tool is scaffolded into a user project via `npx create-ombutocode`, the license travels with the tool directory and the user's project root is free for them to license however they choose. The root-level `CLA.md`, `CONTRIBUTING.md`, `DeployInstructions.md`, `CLAUDE.md`, and `README.md` are **maintainer-only files** that are stripped out by the `create-ombutocode` installer.

When bumping to a release that is no longer beta, also:

- Update `README.md` — remove or soften the "⚠️ Beta — Not Released" block and update the version badge.
- Remove the `BETA` pill and pre-release notice from:
  - `.ombutocode/src/src/renderer/components/BoardList.vue` (About modal hero)
  - `.ombutocode/src/src/renderer/components/StatusBar.vue` (right-side build label)

### Commands

From the repo root:

```bash
# Bump the version in .ombutocode/src/package.json
# (edit the file by hand, or use npm version from inside the package dir)
cd .ombutocode/src
npm version 0.2.0 --no-git-tag-version
cd ../..

# Stage, commit, and push
git add .ombutocode/src/package.json README.md \
        .ombutocode/src/src/renderer/components/BoardList.vue \
        .ombutocode/src/src/renderer/components/StatusBar.vue
git commit -m "Bump version to 0.2.0"
git push origin main
```

> `npm version ... --no-git-tag-version` bumps `package.json` without creating a git tag. We create the tag manually in the next section so we control the message and the annotation.

---

## 2. Create a New GitHub Release

Tags are created as **annotated** tags (`git tag -a`) so the release carries a proper message. The tag name must match the `package.json` version prefixed with `v` (e.g. `v0.2.0`).

### 2.1 Create and push the tag

```bash
# From repo root, on main, with the version-bump commit already pushed
git tag -a v0.2.0 -m "Release v0.2.0 (Beta)

<short summary of what changed — user-visible highlights only>
"
git push origin v0.2.0
```

### 2.2 Create the GitHub release from the tag

The project uses the [GitHub CLI](https://cli.github.com/) (`gh`). Make sure you are authenticated as a user with push rights to the repo:

```bash
gh auth status
# If the active account does not have push rights:
gh auth login --hostname github.com --git-protocol https --web
gh auth switch --user <your-github-username>
```

Then create the release. While still in Beta, use `--prerelease`:

```bash
# From the repo root
gh release create v0.2.0 \
  --title "v0.2.0 (Beta)" \
  --notes-from-tag \
  --prerelease
```

Flags:

- `--notes-from-tag` — uses the annotated tag message as the release body.
- `--prerelease` — marks the release as a pre-release on GitHub. Drop this once the project reaches 1.0.0.
- `--generate-notes` — *alternative* to `--notes-from-tag`; auto-generates a changelog from merged PRs.

To verify:

```bash
gh release view v0.2.0
```

### 2.3 Troubleshooting

- **`403 / workflow scope` on `gh release create`** — the active `gh` account lacks the right scopes. Run `gh auth refresh -h github.com -s workflow` (or re-login).
- **`404 Not Found` creating the release via `gh api`** — the active `gh` account does not have push rights on the repo. Check `gh auth status` and switch to an account that does (`gh auth switch --user <name>`). Note: your `git push` can succeed via SSH while `gh` fails over HTTPS — these are independent auth paths.
- **`gh auth login` reports `invalid_scope: workflow`** — your organisation's SSO policy is blocking scope changes; create a classic PAT with `repo` + `workflow` scopes and use `gh auth login --with-token < token.txt`.

---

## 3. Publish `create-ombutocode` to npm

`npx create-ombutocode my-project` resolves to the **npm registry**, not GitHub. To deliver a new installer you must publish a new version of the `create-ombutocode` package.

> ### 3.0 How the installer is pinned to a workbench release
>
> The installer does **not** clone the tip of `main`. It clones a **specific release tag** so that every `npx create-ombutocode` run is reproducible and a half-finished push to `main` cannot break new-project creation.
>
> The pinned tag is a constant at the top of `create-ombutocode/bin/create-ombutocode.js`:
>
> ```js
> // create-ombutocode/bin/create-ombutocode.js
> const CLONE_REF = 'v0.1.1';
> ```
>
> **Installer version = workbench version (lockstep).** The installer package on npm uses the **same version number** as the workbench it scaffolds. When the workbench is `0.1.1`, the installer on npm is also `0.1.1`. This means users can read a single number in the About dialog, on GitHub releases, and on the npm page without mental translation. Do **not** drift the installer version from the workbench version.
>
> **When cutting a new workbench release, the order of operations is:**
>
> 1. **Tag and publish the workbench release first** — complete sections 1 and 2 above, so `vX.Y.Z` exists on GitHub and the release is live.
> 2. **Bump `CLONE_REF`** in `create-ombutocode/bin/create-ombutocode.js` to the new tag.
> 3. **Bump the installer version** in both `create-ombutocode/bin/create-ombutocode.js` (the `VERSION` constant) and `create-ombutocode/package.json` to match the workbench version exactly. Do not use `npm version` — it's simpler to edit by hand since both files must match.
> 4. **Commit and push** the installer changes to `main`.
> 5. **Publish to npm** (sections 3.3 – 3.6 below).
>
> Because the installer ignores `main` entirely once it's published, users of the *previous* installer version continue to get the *previous* workbench tag. Nothing breaks until they upgrade with `npx create-ombutocode@latest`.
>
> **Never commit a `CLONE_REF` value that points at a tag that does not yet exist on the remote** — the installer will fail with `fatal: Remote branch vX.Y.Z not found in upstream origin`, which is exactly the error users will see when they try to scaffold.
>
> **One-time legacy note:** `create-ombutocode@1.0.0` was published before the lockstep policy existed, and remains on npm for historical reasons. It pointed at an older workbench pre-release and is effectively abandoned. It's still installable via `npx create-ombutocode@1.0.0` but the `latest` dist-tag has been manually moved to the `0.x.y` line (see §3.5).

### 3.1 Prerequisites (one-time)

```bash
# Log in to npm as an account that has publish rights to create-ombutocode
npm login

# Verify
npm whoami
```

Two-factor authentication is enabled on the account, so publishes require an OTP.

### 3.2 Bump the installer version

The installer is versioned in **lockstep** with Ombuto Code itself — see §3.0. Set the installer version to exactly match the workbench version you just released.

You need to edit **two** places:

- `create-ombutocode/package.json` — the `"version"` field
- `create-ombutocode/bin/create-ombutocode.js` — the `VERSION` constant at the top (this is what the installer prints in its banner and `--help` output)

Do **not** use `npm version`, because it only updates `package.json` and would leave the `VERSION` constant drifting.

### 3.3 Dry-run the publish

Always dry-run first to see exactly what will end up in the tarball:

```bash
# Still inside create-ombutocode/
npm publish --dry-run
```

Check the file list — it must include `bin/create-ombutocode.js` (and `template/` if present) and **must not** leak anything unexpected. The `files` field in `create-ombutocode/package.json` controls this.

### 3.4 Publish for real

```bash
# From inside create-ombutocode/
npm publish --otp=123456
```

Replace `123456` with the current code from your authenticator app. If you prefer, you can configure a granular access token with *bypass 2FA* enabled (settings → Access Tokens on npmjs.com) and set it in `~/.npmrc` as:

```
//registry.npmjs.org/:_authToken=<token>
```

…then plain `npm publish` will work without `--otp`.

### 3.5 Check and move the `latest` dist-tag if necessary

npm auto-assigns the `latest` dist-tag to the **highest** version by semver comparison at publish time. Because we're on the `0.x.y` line but `create-ombutocode@1.0.0` still exists on the registry from a legacy pre-lockstep publish, a fresh `0.x.y` publish will **not** auto-advance `latest` — it stays pointed at `1.0.0`.

Check the current dist-tags:

```bash
npm view create-ombutocode dist-tags
```

If `latest` is not the version you just published, move it:

```bash
npm dist-tag add create-ombutocode@<new-version> latest
```

From the **next** release onwards this step is not needed, because `0.1.2 > 0.1.1 > ...` auto-advances `latest` normally as long as the version line stays monotonically increasing within `0.x.y`.

### 3.6 Verify end-to-end

Wait ~30 seconds for the npm CDN to settle, then verify the new version is installable:

```bash
# In a scratch directory
npx create-ombutocode@latest my-test-project
```

`npx` always fetches the `latest` dist-tag unless the user pins a version, so this confirms what a first-time user will see. The banner should show the version you just published.

### 3.7 Commit & push the version bump

This is done **before** publish, not after — the installer files need to be in sync with `main` when the workbench release tag is created. If you followed the release checklist at the bottom of this doc, the commit is already pushed. This subsection remains only as a reminder that local uncommitted installer changes must not be left dangling after a publish.

### 3.8 Troubleshooting

- **`E401 Unauthorized` / `E404 Not Found` on publish** — you are not logged in, or the logged-in user doesn't own the package. `npm whoami` will return 401 in that state. Run `npm login`, or set a granular access token in `~/.npmrc` (see §3.4). npm returns 404 (not 403) for unauthorised package writes to avoid leaking package ownership.
- **`E403 Two-factor authentication ... required`** — pass `--otp=<code>`, or configure a token with bypass-2FA.
- **`E402 Payment Required` / scoped-package errors** — `create-ombutocode` is *unscoped*, so this should not appear; if it does, double-check `package.json` `name` field.
- **`E409 Cannot publish over the previously published version`** — you forgot to bump, or the version already exists on npm. Bump both `package.json` and the `VERSION` constant (§3.2).
- **`npx create-ombutocode` scaffolds an old version after publish** — `latest` dist-tag didn't move. Check with `npm view create-ombutocode dist-tags` and move it manually (§3.5).
- **`npm warn publish errors corrected: repository.url was normalized ...`** — non-fatal, but you can clean it up by running `npm pkg fix` inside `create-ombutocode/`.
- **`fatal: Remote branch vX.Y.Z not found in upstream origin`** during `git clone` — `CLONE_REF` in the installer points at a tag that hasn't been pushed to GitHub yet. Either push the tag, or temporarily roll `CLONE_REF` back to the previous release.

---

## 4. How the In-App Update Check Works

Every installed copy of the workbench polls GitHub for new releases so users know when to pull a new version.

- **Source of truth:** `https://api.github.com/repos/FrancoisBotha/ombutocode/releases/latest` — whatever the GitHub API reports as the *latest* release. Pre-releases (like the current `v0.1.0 (Beta)`) are **excluded** by GitHub's `/latest` endpoint by default. This is important: publishing a pre-release will **not** trigger an update notification in existing installs. Only non-prerelease tags count as "releases" for update detection.
- **Implementation:** the main process handler `app:checkForUpdates` in `.ombutocode/src/main.js` fetches the endpoint via Node's built-in `https` module, parses `tag_name`, compares against `.ombutocode/src/package.json`'s `version` using a simple numeric semver compare (pre-release suffixes are ignored), and caches the result for 6 hours to avoid hitting API rate limits.
- **UI surface:** `.ombutocode/src/src/renderer/components/StatusBar.vue` calls the handler on mount and then every 6 hours. If `updateAvailable` is true, a green `⬆ UPDATE vX.Y.Z` pill appears in the right side of the status bar next to the BETA badge. Clicking it opens **`UPGRADING.md` at the target release tag** (`https://github.com/FrancoisBotha/ombutocode/blob/vX.Y.Z/UPGRADING.md`) in the user's default browser via `shell.openExternal`. The upgrade guide is version-pinned so users see the steps that match the version they're upgrading to, not whatever happens to be on main.
- **No automated install yet.** The workbench does *not* currently self-update the `.ombutocode/` directory in a user's project. The in-app notification is **notify + link** only — it takes users to `UPGRADING.md`, which walks them through the manual upgrade procedure. See the [roadmap section](#42-planned-automated-workbench-update-deferred) below for what automated upgrades would need.
- **`UPGRADING.md` must exist on every release tag.** Because the in-app link embeds the tag in the URL, a release without `UPGRADING.md` at its tag will 404 for users. The file lives at the repo root and is included in every tagged release by default — just don't delete it.

### 4.1 Making a release visible to the update check

Because `/releases/latest` skips pre-releases, there is one important wrinkle:

- **While the project is in Beta**, every release is marked `--prerelease` (see section 2.2). The update check will therefore **never fire for beta releases**. This is intentional — we don't want every early tester to get "update available" noise when nothing is polished yet.
- **When you cut the first non-beta release**, drop `--prerelease` from `gh release create`. That release becomes the first one the update check will notice, and from then on every non-prerelease release triggers the in-app notification.
- If you urgently need an update notification for a beta release, you can temporarily un-mark the release as a pre-release in the GitHub UI (release → Edit → uncheck *Set as a pre-release*). Remember to flip it back afterwards.

### 4.2 Planned: automated workbench update (deferred)

Fully automated in-app updates (where the "Update" button replaces the contents of `.ombutocode/` without touching `.ombutocode/data/`, re-runs `npm install`, and restarts the app) are **not** yet implemented. When they are, this section will document:

- How the update script preserves the SQLite database and logs
- How it handles schema migrations between workbench versions
- How it restores the app to a known-good state if the update fails mid-way

Until then, the in-app check is "notify + link", and `UPGRADING.md` at the repo root is the manual upgrade procedure that the link opens.

### 4.3 What about *new* projects?

New projects created with `npx create-ombutocode` don't need `UPGRADING.md` at all — the installer is pinned to a workbench release tag via `CLONE_REF` (see §3.0), and the maintainer bumps that pin with every release. As long as you follow the release checklist at the bottom of this doc, `npx create-ombutocode@latest` always scaffolds the current released workbench. First-time users never see the upgrade notification because they are already on the latest version.

---

## Full Release Checklist

A typical release touches all three sections above. Use this as a quick reference:

**Workbench release**
- [ ] Decide the new Ombuto Code version (`0.x.y`)
- [ ] Bump `.ombutocode/src/package.json`
- [ ] (If leaving Beta) update `README.md`, remove BETA pills from `BoardList.vue` About modal and `StatusBar.vue`
- [ ] `git commit` + `git push origin main`
- [ ] `git tag -a v<version> -m "..."` + `git push origin v<version>`
- [ ] `gh release create v<version> --title "..." --notes-from-tag --prerelease` *(drop `--prerelease` when leaving Beta so the in-app update check picks it up — see §4.1)*

**Installer release (required whenever the workbench tag changes)**
- [ ] Bump `CLONE_REF` in `create-ombutocode/bin/create-ombutocode.js` to the new tag
- [ ] Bump `VERSION` constant in the same file **and** `version` in `create-ombutocode/package.json` to match the workbench version exactly (lockstep — see §3.0)
- [ ] `git commit` + `git push origin main`
- [ ] `npm publish --dry-run` inside `create-ombutocode/` — confirm `bin/` and `template/` are in the tarball
- [ ] `npm publish` inside `create-ombutocode/` (or `npm publish --otp=<code>` if no granular token configured)
- [ ] `npm view create-ombutocode dist-tags` — if `latest` is not the new version, run `npm dist-tag add create-ombutocode@<new-version> latest` (one-time drift fix; auto-advances normally once we're back on the `0.x.y` line)
- [ ] `npx create-ombutocode@latest` sanity check in a scratch directory (clones the new tag, scaffolds a project, boots the workbench)
