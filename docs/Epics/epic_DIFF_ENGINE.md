# Epic: Diff Engine

- **Status:** NEW
- **Owner:** human
- **Created:** 2026-04-11
- **Last Updated:** 2026-04-11

## 1. Purpose

Deliver the change-detection engine that classifies each file discovered by the Scanner as `new`, `changed`, `unchanged`, or `deleted` compared to the job's last successful backup run. By default it relies on size + modified timestamp (ADR-002). In opt-in strict mode it additionally computes a SHA-256 checksum when size and mtime match. The output drives the Upload Manager.

## 2. User Story

As a **DropSync user**, I want **the app to only upload files that have actually changed since the last backup**, so that **backups are fast, bandwidth is respected, and my Dropbox quota isn't wasted on identical uploads**.

## 3. Scope

**In Scope**
- Diff algorithm comparing Scanner output against prior `file_record` state for the same `job_id` (from the most recent completed run)
- Classification of each file as `new`, `changed`, or `unchanged`
- Detection of files absent from the current scan but present in prior state → `deleted`
- Default detection signals: `size_bytes` + `modified_at`
- Opt-in strict mode: when size and mtime match, compute SHA-256 over the file content and compare against stored checksum
- Checksum storage fields populated on upload (`checksum`, `checksum_algorithm`)
- Streaming interface so the engine can emit classifications incrementally as Scanner results arrive
- Unit tests covering every classification branch and both detection modes

**Out of Scope**
- Actually uploading the changed files (epic_UPLOAD_MANAGER)
- Actioning deletes on Dropbox (governed by `mirror_deletes` flag, consumed in epic_UPLOAD_MANAGER)
- Any UI

## 4. Functional Requirements

- **FR-025** — The Diff Engine classifies every scanned file as `new`, `changed`, `unchanged`, or (if missing from the current scan) `deleted`, based on comparison with the most recent successful run's `file_record` state for the same job.
- **FR-026** — Default detection uses `size_bytes` and `modified_at`; a mismatch in either field marks the file `changed`.
- **FR-027** — When a job has `strict_checksum = TRUE`, the engine additionally computes a SHA-256 checksum for any file where size and mtime match and compares it against the stored checksum; a mismatch marks the file `changed`.
- **FR-028** — Files present in the prior state but absent from the current scan are emitted with `action='deleted'`.

## 5. Non-Functional Requirements

- **NFR-009** — In default mode, diffing a 100,000-file tree must complete in under 10 seconds on a typical modern developer laptop (SSD, warm filesystem cache).

## 6. UI/UX Notes

No direct UI in this epic.

## 7. Data Model Impact

- **Reads** from `file_record` (most recent successful run for the job) — the "prior state".
- **Writes** `file_record` rows with `action` = `new` / `changed` / `unchanged` / `deleted`, populated with size, mtime, and (in strict mode) checksum + checksum_algorithm. Note that `dropbox_rev` and `dropbox_path` are filled later by the Upload Manager.
- Reads `backup_job.strict_checksum` to decide detection mode.

## 8. Integration Impact

- **Node.js `crypto`**: `createHash('sha256')` for strict-mode checksumming, streamed over file content.
- Consumes output from epic_FILE_SCANNER.
- Produces input for epic_UPLOAD_MANAGER.

## 9. Acceptance Criteria

- [ ] A file with the same size and mtime as its prior `file_record` is classified `unchanged` in default mode.
- [ ] A file with a different size OR different mtime is classified `changed`.
- [ ] A file not present in the prior state is classified `new`.
- [ ] A file present in the prior state but absent from the current scan is classified `deleted`.
- [ ] In strict mode, a file with matching size+mtime but a different SHA-256 is classified `changed`.
- [ ] In strict mode, a file with matching size+mtime AND matching SHA-256 is classified `unchanged`.
- [ ] The engine reads prior state only from the most recent successful run (not failed/cancelled runs).
- [ ] Diffing a 100k-file fixture in default mode completes under the 10-second budget.
- [ ] Unit tests cover all six classification branches × both modes.

## 10. Risks & Unknowns

- **Timestamp precision mismatch** — filesystems vary in mtime precision (NTFS 100ns, FAT32 2s). Comparison should tolerate a small epsilon or normalize to the coarser resolution.
- **Timezone handling** — always store and compare UTC.
- **Strict-mode performance** — checksumming every file that survives the metadata check could be slow; acceptable because strict mode is opt-in and documented as slower.
- **"Most recent successful run"** — if no prior successful run exists (first run, or after a series of failures), every file is `new`. This must be explicit.
- **Large files in strict mode** — checksum is streamed to avoid loading into memory.

## 11. Dependencies

- **epic_FILE_SCANNER** — provides scanned file entries.
- **epic_DATABASE_FOUNDATION** — `file_record`, `backup_job` schema.

## 12. References

- **prd:** docs/Product Requirements Document/PRD.md
- **architecture:** docs/Architecture/Architecture.md
- **data_model:** docs/Data Model/Schema.ddl
- **style_guide:** docs/Style Guide/StyleGuide.md

## 13. Implementation Notes

Suggested ticket breakdown (4 tickets):

1. Load prior state helper: "most recent successful run's `file_record` rows for `job_id`" as a `Map<relative_path, {size, mtime, checksum}>`.
2. Default-mode comparator: size + mtime classification, emitting `new` / `changed` / `unchanged`.
3. Strict-mode checksum path: SHA-256 streaming over `fs.createReadStream`; activated only when `backup_job.strict_checksum = TRUE`.
4. Deletion detection: after the scan completes, any prior-state entries not seen are emitted as `deleted`. Tests for all branches and performance.

**Complexity:** Medium. Algorithm is simple; correctness around edge cases (first run, failed runs, timestamp precision) is where the care is needed.
