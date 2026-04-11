# Epic: Dropbox Authentication

- **Status:** NEW
- **Owner:** human
- **Created:** 2026-04-11
- **Last Updated:** 2026-04-11

## 1. Purpose

Deliver the OAuth 2.0 PKCE flow that lets a user connect DropSync to their Dropbox account. Tokens are stored in Windows Credential Manager via `keytar`, access tokens are refreshed on demand, and the renderer presents Connect/Disconnect UX hooks. This epic is the gate that unlocks every Dropbox-touching feature (upload, list, quota).

## 2. User Story

As a **DropSync user**, I want **to authenticate DropSync with my Dropbox account once**, so that **the app can back up my folders without storing my password and without requiring me to sign in again on every run**.

## 3. Scope

**In Scope**
- OAuth 2.0 PKCE flow against Dropbox API v2
- Local HTTP loopback listener (or deep-link handler) to receive the redirect
- Code-for-token exchange, obtaining both access and refresh tokens
- Refresh token persisted via `keytar` in Windows Credential Manager
- Access token held in main-process memory only, refreshed on expiry or 401
- Auth module exposed through IPC with `connect()`, `disconnect()`, `getStatus()` commands
- Connect/Disconnect renderer controls (minimal, e.g. in a Settings panel or header) with connection-state indication
- Thin `dropboxClient` wrapper over `axios` that injects the current access token and retries once on 401

**Out of Scope**
- File upload logic (epic_UPLOAD_MANAGER)
- Storage quota display (deferred per PRD MVP scope)
- Multi-account support
- Dropbox app approval process (product-level concern, not engineering)

## 4. Functional Requirements

- **FR-009** — The user can initiate the Dropbox OAuth 2.0 PKCE flow from a Connect control in the renderer.
- **FR-010** — On successful authentication, the refresh token is persisted to Windows Credential Manager via `keytar`.
- **FR-011** — The app exchanges the refresh token for a short-lived access token on demand; the access token is held only in main-process memory.
- **FR-012** — The access token is automatically refreshed when it expires or when a Dropbox API call returns 401.
- **FR-013** — A Disconnect action clears the stored refresh token and requires the user to re-authenticate before further Dropbox API calls.

## 5. Non-Functional Requirements

- **NFR-005** — OAuth tokens must never be persisted in cleartext, in SQLite, or in log files.
- **NFR-006** — All Dropbox API traffic must use TLS 1.2 or higher (default in Node.js / axios — no plaintext fallback permitted).

## 6. UI/UX Notes

- A Connect state surface somewhere in the main window — at minimum a status row with "Connected as `<account name>`" or "Not connected" and a primary button ("Connect Dropbox" / "Disconnect").
- On first launch with no token: clear call-to-action to connect.
- On click, the OAuth authorize URL opens in the user's default browser (via `shell.openExternal`); DropSync waits for the loopback redirect.
- Disconnect is a destructive action per style guide §5 — confirm before clearing.
- Button styles: primary filled for Connect, danger filled for Disconnect.

## 7. Data Model Impact

- No new tables. Token storage lives in OS credential store, not SQLite.
- `app_settings` may hold non-sensitive Dropbox metadata (e.g. account email for display) keyed by `dropbox.account_email`, `dropbox.connected_at`.

## 8. Integration Impact

- **Dropbox API v2**: `/oauth2/authorize`, `/oauth2/token`, `/users/get_current_account`
- **keytar**: new native dependency; Windows Credential Manager target
- **Electron `shell.openExternal`**: to launch the system browser for consent
- **Loopback listener**: a short-lived `http` server on `127.0.0.1:<ephemeral>` to capture the redirect
- **dropboxClient** (`axios` wrapper): introduced here, reused by epic_UPLOAD_MANAGER

## 9. Acceptance Criteria

- [ ] Clicking Connect opens the Dropbox consent page in the user's default browser.
- [ ] Completing consent returns control to DropSync via the loopback redirect and the app displays "Connected as `<email>`".
- [ ] Refresh token is written to Windows Credential Manager and is NOT present in the SQLite database or any log file.
- [ ] After app restart, the app can obtain a fresh access token without re-prompting the user.
- [ ] A forced 401 response from a simulated API call triggers a token refresh and retries once.
- [ ] Disconnect clears the keytar entry, clears in-memory tokens, and returns the UI to the "Not connected" state.
- [ ] `dropboxClient` can make an authenticated call to `/users/get_current_account` after connect.

## 10. Risks & Unknowns

- **PKCE redirect handling** — loopback listener vs. custom URL scheme; loopback is simpler and doesn't require OS registration.
- **keytar maintenance mode** — documented Architecture risk; fallback plan is `electron-store` with user-scoped encryption, but not in scope here.
- **Dropbox app approval** — the OAuth app must be registered with Dropbox; production scopes may require review. Needs to be confirmed out-of-band.
- **Clock skew** — token expiry checks should use a small safety margin.
- **Antivirus interference** — some Windows AV tools block loopback listeners; behaviour should degrade gracefully with a clear error message.

## 11. Dependencies

- **epic_APP_SCAFFOLD** — needs the main process and IPC bridge.
- **epic_DATABASE_FOUNDATION** — needs `app_settings` to store non-sensitive connection metadata.

## 12. References

- **prd:** docs/Product Requirements Document/PRD.md
- **architecture:** docs/Architecture/Architecture.md
- **data_model:** docs/Data Model/Schema.ddl
- **style_guide:** docs/Style Guide/StyleGuide.md

## 13. Implementation Notes

Suggested ticket breakdown (5–6 tickets):

1. Add `keytar` dependency and build a `tokenStore` module wrapping Credential Manager access.
2. Implement the PKCE auth flow: generate verifier/challenge, build authorize URL, open via `shell.openExternal`, run a loopback listener to capture the code.
3. Implement the token exchange and refresh flow against `/oauth2/token`.
4. Build the `dropboxClient` axios wrapper that injects the access token and retries once on 401.
5. Expose `connect()` / `disconnect()` / `getStatus()` via IPC and build a minimal renderer Connect/Disconnect surface.
6. Tests: mocked token exchange, token expiry/refresh, and keytar write/read round-trip.

**Complexity:** Medium–High. PKCE loopback flows are fiddly; the error paths (user cancels, browser doesn't return, network drops) need careful handling.
