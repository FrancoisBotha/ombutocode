# Epic: UPLOAD_MANAGER

Status: NEW

## Overview

Deliver the Upload Manager: the component that takes the "needs upload" output
from the Diff Engine and reliably pushes files to Dropbox using the API client
from DROPBOX_AUTH. This epic implements both upload paths required by
ADR-003 — single-shot upload for files under 150 MB and resumable chunked
upload sessions for larger files — plus the retry, rate-limit, and
per-file persistence policies that underpin DropSync's reliability goal.

This epic is the final correctness-critical engine component. After it, the
scheduler/pipeline epic can assemble a full working backup run.

## Scope

### In Scope
- Single-shot upload path using `files/upload` for files < 150 MB
- Upload session path using
  `files/upload_session/start`, `.../append_v2`, `.../finish` for files ≥ 150 MB
- Chunk size selection and resumable cursor handling for upload sessions
- Retry policy with exponential backoff and jitter
- `Retry-After` header handling for `429` and `503` responses
- 401 token refresh retry (delegated to DROPBOX_AUTH's client wrapper)
- Per-file `file_record` writes on success with `dropbox_rev`, `dropbox_path`,
  `upload_started_at`, and `upload_finished_at`
- Per-file failure handling: `action = 'failed'` with `error_message`
- Optional concurrency limit (e.g. 2–4 in-flight uploads) with a simple
  worker queue; default safe and configurable
- Pre-run storage quota probe (best-effort warning if the estimated upload
  size exceeds available Dropbox space)

### Out of Scope
- Deciding which files to upload — that is the Diff Engine's job
- Creating `backup_run` rows, transitioning run status, or orchestrating the
  overall pipeline (SCHEDULER_AND_RUN_PIPELINE)
- Deleting files from Dropbox when source files disappear — preserved by
  default per ADR-005; if `backup_job.mirror_deletes = true`, deletion is
  still orchestrated by the pipeline epic, not here
- Restore from backup (MVP-deferred)

## Functional Requirements

1. Given a file under 150 MB, the Upload Manager uploads it in one
   `files/upload` call and records the returned `rev` and Dropbox path.
2. Given a file ≥ 150 MB, the Upload Manager uses an upload session to stream
   the file in chunks, surviving transient network errors via retries.
3. On `429 Too Many Requests` or `503 Service Unavailable`, the Upload Manager
   honours `Retry-After` (or falls back to exponential backoff with jitter)
   and resumes.
4. On persistent failure for a single file, the Upload Manager records the
   error and continues with the next file; it does not abort the batch.
5. Each successful upload produces a `file_record` row with `action`
   reflecting the Diff Engine classification (`new` or `changed`) and the
   Dropbox rev/path/timestamps filled in.
6. A best-effort storage quota probe runs before a batch; if the estimated
   upload size exceeds available space, the batch is refused with a clear
   error surfaced to the pipeline.
7. The Upload Manager respects a configurable maximum concurrency and never
   exceeds it.

## Acceptance Criteria

- [ ] Files < 150 MB upload via `files/upload` and produce correct
      `file_record` rows
- [ ] Files ≥ 150 MB upload via an upload session in multiple chunks
- [ ] A simulated `429` with `Retry-After: 2` results in a 2-second wait and
      a successful retry
- [ ] A simulated persistent upload failure produces a `failed` `file_record`
      with a non-null `error_message` and does not abort the batch
- [ ] Concurrency limit is respected under load
- [ ] Pre-run quota probe warns when estimated upload > available space
- [ ] Unit tests cover both upload paths, retry/backoff, and the failure
      continuation behavior
- [ ] The Upload Manager has no direct Dropbox HTTP knowledge beyond the
      DROPBOX_AUTH client wrapper

## Dependencies

- APP_SHELL
- DATABASE_FOUNDATION
- DROPBOX_AUTH (API client wrapper, token refresh)
- FILE_SCANNER_AND_DIFF (produces the upload candidates)

## Tickets

_To be created during planning mode._
