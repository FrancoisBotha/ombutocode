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

### 3.1 Prerequisites (one-time)

```bash
# Log in to npm as an account that has publish rights to create-ombutocode
npm login

# Verify
npm whoami
```

Two-factor authentication is enabled on the account, so publishes require an OTP.

### 3.2 Bump the installer version

The installer is versioned **independently** of Ombuto Code itself. Decide whether the installer change is `patch` / `minor` / `major` in its own right (usually `patch` for a simple fix, `minor` when the installer's UX or options change).

```bash
cd create-ombutocode

# Bump and commit in one step (creates its own git commit; no git tag)
npm version patch --no-git-tag-version

# Inspect the new version
cat package.json | grep version
```

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

### 3.5 Verify end-to-end

Wait ~30 seconds for the npm CDN to settle, then verify the new version is installable:

```bash
# In a scratch directory
npx create-ombutocode@latest my-test-project
```

`npx` always fetches the latest published version unless the user pins one, so this also confirms what a first-time user will see.

### 3.6 Commit & push the version bump

```bash
cd ..
git add create-ombutocode/package.json
git commit -m "create-ombutocode: bump to <new-version>"
git push origin main
```

### 3.7 Troubleshooting

- **`E403 Two-factor authentication ... required`** — pass `--otp=<code>`, or configure a token with bypass-2FA.
- **`E402 Payment Required` / scoped-package errors** — `create-ombutocode` is *unscoped*, so this should not appear; if it does, double-check `package.json` `name` field.
- **`E409 Cannot publish over the previously published version`** — you forgot to bump. Run `npm version patch --no-git-tag-version` again.
- **`npm warn publish errors corrected: repository.url was normalized ...`** — non-fatal, but you can clean it up by running `npm pkg fix` inside `create-ombutocode/`.

---

## Full Release Checklist

A typical release touches all three sections above. Use this as a quick reference:

- [ ] Decide the new Ombuto Code version (`0.x.y`)
- [ ] Bump `.ombutocode/src/package.json`
- [ ] (If leaving Beta) update `README.md` and remove BETA pills
- [ ] `git commit` + `git push origin main`
- [ ] `git tag -a v<version> -m "..."` + `git push origin v<version>`
- [ ] `gh release create v<version> --title "..." --notes-from-tag --prerelease`
- [ ] (If installer changed) bump `create-ombutocode/package.json`
- [ ] `npm publish --dry-run` inside `create-ombutocode/`
- [ ] `npm publish --otp=<code>` inside `create-ombutocode/`
- [ ] `npx create-ombutocode@latest` sanity check in a scratch directory
- [ ] Commit + push the installer version bump
