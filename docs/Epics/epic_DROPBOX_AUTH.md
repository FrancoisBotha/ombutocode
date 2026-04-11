# Epic: DROPBOX_AUTH

Status: NEW

## Overview

Give DropSync a working, secure OAuth 2.0 PKCE connection to the user's Dropbox
account. This epic delivers the auth flow UI, the token acquisition and
refresh logic, encrypted token storage in Windows Credential Manager via
`keytar`, and a thin `axios`-based Dropbox API client that every later epic
(folder browsing, uploads) can reuse. DropSync is a public OAuth client — no
client secret — as specified in Architecture §7.

After this epic, the rest of the app can assume "an authenticated Dropbox
client is available" and never deal with tokens directly.

## Scope

### In Scope
- OAuth 2.0 PKCE flow implementation for public clients (code verifier,
  code challenge, authorization URL, local redirect handler)
- Dropbox app registration instructions and required scopes documented
- Initial "Connect to Dropbox" UI flow in the renderer with a clear success
  and failure state
- Refresh-token persistence in Windows Credential Manager via `keytar`
- In-memory short-lived access token cache; transparent refresh on expiry
- 401 detection and one-shot retry after token refresh
- Thin Dropbox API client wrapper over `axios` exposing a minimal, typed
  surface used by later epics (auth header injection, base URL, JSON bodies,
  error normalization)
- "Disconnect" flow that clears the refresh token from Credential Manager
- Account info probe (`users/get_current_account`) used to confirm a
  successful connection

### Out of Scope
- `files/list_folder`, `files/upload`, `files/upload_session` — implemented by
  BACKUP_JOB_MANAGEMENT and UPLOAD_MANAGER consumers of this client
- Rate-limit backoff policy for uploads (UPLOAD_MANAGER)
- Any storage usage display (MVP-deferred per PRD §6)

## Functional Requirements

1. The user can initiate a Dropbox connection from the app; the system
   browser opens the Dropbox authorization page.
2. After the user authorizes, DropSync receives the authorization code via a
   local loopback redirect, exchanges it for tokens using PKCE, and stores the
   refresh token in Windows Credential Manager.
3. An access token is acquired from the refresh token on demand and kept only
   in memory.
4. On a 401 response from the Dropbox API, the client refreshes the access
   token once and retries the original request.
5. The account info probe confirms the connection and the connected account's
   email/name is displayed in the UI.
6. The user can disconnect; after disconnecting, the refresh token is removed
   from Credential Manager and subsequent API calls fail authoritatively.
7. No client secret is present anywhere in the shipped application.

## Acceptance Criteria

- [ ] A first-time user can complete the OAuth PKCE flow end-to-end
- [ ] The refresh token is persisted in Windows Credential Manager via `keytar`
      and not written to disk in plaintext or SQLite
- [ ] Access tokens are never persisted
- [ ] A simulated 401 triggers a single token refresh and a retry
- [ ] The account info probe returns the connected account after auth
- [ ] Disconnect removes the credential and blocks further API calls
- [ ] The Dropbox client wrapper is consumed by later epics via a single
      dependency-injected interface
- [ ] No client secret exists in the repository or the packaged app

## Dependencies

- APP_SHELL (IPC, renderer)
- DATABASE_FOUNDATION (for `app_settings` entries flagging connection state;
  tokens themselves do NOT live in SQLite)

## Tickets

_To be created during planning mode._
