# Epic: Upload Manager

- **Status:** NEW
- **Owner:** human
- **Created:** 2026-04-11
- **Last Updated:** 2026-04-11

## 1. Purpose

Deliver the module that uploads changed files to Dropbox via API v2, using single-file upload for files under 150 MB and chunked resumable upload sessions for files at or above that threshold (ADR-003). The Upload Manager handles batching, exponential backoff on rate limits, retries, per-file error isolation, and records Dropbox revision metadata against `file_record`.

## 2. User Story

As a **DropSync user**, I want **changed files to upload reliably to Dropbox, including large files and through transient network errors**, so that **I can trust my backups to complete without silent data loss**.

## 3. Scope

**In Scope**
- Thin Dropbox API client over `axios` (reusing the `dropboxClient` wrapper from epic_DROPBOX_AUTH)
- Single-file upload path (`/files/upload`) for files strictly under 150 MB
- Chunked upload session path (`/files/upload_session/start`, `/append_v2`, `/finish`) for files ≥ 150 MB
- Upload target path resolution: `<dropbox_target>/<relative_path>` with forward-slash normalization
- Exponential backoff with jitter on 429 / 5xx responses, respecting `Retry-After` headers
- Per-file error isolation — one failure does not abort the whole run
- `file_record.dropbox_rev`, `dropbox_path`, `upload_started_at`, `upload_finished_at`, `checksum`, `checksum_algorithm`, `error_message` populated appropriately
- Bounded concurrency on uploads to avoid overloading the network or hitting rate limits too aggressively
- `mirror_deletes` flag: when TRUE, files classified `deleted` by the Diff Engine are removed from Dropbox via `/files/delete_v2`; when FALSE (default, ADR-005), they are preserved
- Unit tests against a mocked Dropbox API

**Out of Scope**
- Change detection (epic_DIFF_ENGINE)
- Scheduling and pipeline orchestration (epic_SCHEDULER_AND_RUN_PIPELINE)
- Resume of a partial upload session across app restarts (basic session-based resumability is in scope; cross-restart persistence of chunk offsets is not)
- Pre-flight quota check (deferred with storage-usage display)

## 4. Functional Requirements

- **FR-029** — Files under 150 MB are uploaded via a single `/files/upload` API call.
- **FR-030** — Files at or above 150 MB are uploaded via Dropbox upload sessions in chunks (`start`, `append_v2`, `finish`).
- **FR-031** — Upload failures (network errors, 5xx responses) are retried with exponential backoff and jitter, up to a bounded retry count.
- **FR-032** — On 429 or rate-limited responses the Upload Manager waits for the duration specified by the `Retry-After` header before retrying.
- **FR-033** — After a successful upload, the file's `dropbox_rev` and `dropbox_path` are recorded in `file_record`, along with `upload_started_at` and `upload_finished_at`.

## 5. Non-Functional Requirements

- **NFR-010** — A single file upload failure must not abort the backup run; the run continues with remaining files and the failure is captured in `file_record.error_message` and `run_log`.
- **NFR-011** — Concurrent uploads are bounded (recommended default: 4) to avoid saturating the connection or exceeding Dropbox's concurrent-request limits.

## 6. UI/UX Notes

No direct UI in this epic. Upload progress is surfaced later via `backup_run` counters and `run_log` entries, consumed by epic_BACKUP_JOBS_DASHBOARD and epic_BACKUP_LOGS_VIEW.

## 7. Data Model Impact

- **Writes** `file_record.dropbox_rev`, `dropbox_path`, `upload_started_at`, `upload_finished_at`, `error_message`, and updates `action` to `failed` on upload failure.
- **Writes** `run_log` entries for retries, rate-limit backoffs, and per-file failures.
- **Updates** `backup_run.files_uploaded`, `files_failed`, `files_deleted`, `bytes_uploaded` counters (incrementally as uploads complete).

## 8. Integration Impact

- **Dropbox API v2** — `files/upload`, `files/upload_session/start|append_v2|finish`, `files/delete_v2`.
- **`dropboxClient`** from epic_DROPBOX_AUTH — reused for authenticated requests and 401-driven refresh.
- **Node.js `fs.createReadStream`** for streaming file content to upload bodies.
- Consumed by epic_SCHEDULER_AND_RUN_PIPELINE.

## 9. Acceptance Criteria

- [ ] Files under 150 MB upload via `/files/upload` and the returned revision is recorded.
- [ ] Files at or above 150 MB upload via upload sessions in chunked appends and a final `finish` call; returned revision is recorded.
- [ ] Relative path `foo\bar.txt` on Windows is normalized to `foo/bar.txt` for Dropbox target resolution.
- [ ] A simulated 429 response with `Retry-After: 2` causes the Manager to wait at least 2 seconds and succeed on retry.
- [ ] A simulated 500 response triggers exponential backoff retries and eventually succeeds.
- [ ] A single-file failure does not abort the run; the next file still uploads.
- [ ] With `mirror_deletes = TRUE`, a file classified `deleted` is removed from Dropbox via `/files/delete_v2` and counted in `files_deleted`.
- [ ] With `mirror_deletes = FALSE` (default), `deleted` files are left untouched in Dropbox.
- [ ] Concurrent uploads are bounded to the configured concurrency limit.
- [ ] Unit tests against a mocked Dropbox API cover all paths and the retry/backoff behaviour.

## 10. Risks & Unknowns

- **Rate-limit strategy** — Dropbox limits are global per-app; an aggressive concurrency setting could trigger 429s frequently. Default of 4 concurrent uploads is conservative.
- **Upload session interruptions** — basic in-process resumability is simple, but cross-restart resumability would require persisting session IDs and chunk offsets — not in scope.
- **Large-file streaming** — memory footprint must stay bounded; streams must not be buffered fully.
- **Path collisions on Dropbox** — if a file exists with a different rev, the app should use `mode: 'overwrite'` to match the documented "backup" semantics. This should be explicit in the request.
- **Deletion on mirror_deletes** — potentially destructive; the flag is documented as dangerous in epic_BACKUP_JOB_MANAGEMENT.

## 11. Dependencies

- **epic_DROPBOX_AUTH** — provides the authenticated `dropboxClient`.
- **epic_DIFF_ENGINE** — provides classification input (what to upload, what to delete).
- **epic_DATABASE_FOUNDATION** — for `file_record`, `run_log`, `backup_run` writes.

## 12. References

- **prd:** docs/Product Requirements Document/PRD.md
- **architecture:** docs/Architecture/Architecture.md
- **data_model:** docs/Data Model/Schema.ddl
- **style_guide:** docs/Style Guide/StyleGuide.md

## 13. Implementation Notes

Suggested ticket breakdown (5–7 tickets):

1. Single-file upload path: stream `createReadStream` to `/files/upload` with `mode: 'overwrite'`; record rev.
2. Chunked upload session path for files ≥ 150 MB: `start`, loop `append_v2`, `finish`.
3. Retry/backoff logic: exponential backoff with jitter, `Retry-After` honoured, bounded retry count.
4. Concurrency controller (`p-limit`-style) for bounded parallel uploads.
5. Mirror-delete path: on `deleted` classification with `mirror_deletes=TRUE`, call `/files/delete_v2`.
6. Update `file_record` and `backup_run` counters incrementally; append `run_log` entries for retries/failures.
7. Unit tests with a mocked Dropbox API covering success, 429, 5xx, per-file failure, session path, and mirror-delete.

**Complexity:** High. Upload sessions, retry logic, and bounded concurrency are each individually manageable but interact in ways that need careful testing.
