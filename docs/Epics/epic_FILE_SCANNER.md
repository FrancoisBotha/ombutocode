# Epic: File Scanner

- **Status:** NEW
- **Owner:** human
- **Created:** 2026-04-11
- **Last Updated:** 2026-04-11

## 1. Purpose

Deliver the file walker that traverses a job's source directory, applies its `.gitignore`-style exclusion rules, and produces a normalized file inventory (relative path, size, modified timestamp) for the Diff Engine to consume. The scanner must handle locked files, permission errors, and large directory trees gracefully.

## 2. User Story

As a **DropSync user**, I want **the app to scan my selected source folder and honour my exclusion patterns**, so that **only the files I actually care about are considered for backup — and problem files don't abort the whole run**.

## 3. Scope

**In Scope**
- Recursive directory traversal of a job's `source_path` using Node.js `fs` primitives
- `.gitignore`-style pattern matching via `ignore` or `minimatch` (chosen in Architecture §5)
- Merging per-job `exclusion_rule` entries with the default behaviour (per-job is authoritative once a job exists)
- For each included file: capture relative path, size bytes, modified timestamp
- For each excluded file: record `action='excluded'` in `file_record` (audit-only, not uploaded)
- Graceful handling of locked / permission-denied files: log, mark `action='failed'`, continue
- Emit a stream/iterator of results (not a giant in-memory array) so the Diff Engine can process incrementally
- Unit tests on a temporary directory tree covering include, exclude, locked, and symlink edge cases

**Out of Scope**
- Change detection (epic_DIFF_ENGINE)
- Actually uploading files (epic_UPLOAD_MANAGER)
- Checksumming — deferred to the Diff Engine in strict mode
- Watching for filesystem changes in real-time

## 4. Functional Requirements

- **FR-021** — The scanner walks a job's `source_path` recursively and emits an entry per discovered file, carrying the path relative to the source root.
- **FR-022** — The scanner applies per-job exclusion rules using `.gitignore`-style semantics (glob patterns, directory and file matches, negation).
- **FR-023** — For each included file the scanner captures file size (bytes) and modified timestamp (UTC).
- **FR-024** — Files that cannot be stat'd or opened due to locks/permissions are logged, recorded with `action='failed'`, and do NOT abort the scan.

## 5. Non-Functional Requirements

- **NFR-008** — The scanner must be able to process a directory tree of at least 100,000 files without running out of memory, by streaming results rather than building a single in-memory array.

## 6. UI/UX Notes

No direct UI in this epic. Scan progress may surface later via `run_log` entries consumed by the Logs view.

## 7. Data Model Impact

- Writes to `file_record` with `action` values `excluded` (audit) and `failed` (errors).
- Reads from `exclusion_rule` and `backup_job`.
- `run_id` and `job_id` are provided by the pipeline orchestrator (epic_SCHEDULER_AND_RUN_PIPELINE).

## 8. Integration Impact

- **Node.js `fs.promises`**: `readdir`, `stat`, `lstat` for traversal.
- **`ignore` or `minimatch`**: exclusion pattern engine (decided by Architecture §5).
- Consumed by epic_DIFF_ENGINE and epic_SCHEDULER_AND_RUN_PIPELINE.

## 9. Acceptance Criteria

- [ ] Scanner traverses a nested temporary directory tree and emits all non-excluded files with correct relative paths.
- [ ] `.gitignore`-style patterns (e.g. `node_modules`, `*.tmp`, `!important.tmp`) are honoured exactly as documented.
- [ ] Per-job exclusion rules override/augment behaviour as specified.
- [ ] Symlinks are handled without infinite loops (documented decision: follow or skip).
- [ ] Locked / permission-denied files produce a `file_record` row with `action='failed'` and do not abort the scan.
- [ ] Scanning a 100k-file test tree completes without OOM and emits results as a stream/iterator.
- [ ] Node test-runner tests cover include, exclude, locked, and symlink cases.

## 10. Risks & Unknowns

- **Symlink policy** — follow or skip? Following risks cycles and out-of-source-tree uploads; skipping may surprise users who use symlinked mount points. Recommendation: skip by default, log a warning.
- **Hidden-file handling on Windows** — Windows attributes vs. Unix-style dotfiles. `.gitignore` semantics work on dotfiles; Windows hidden attribute is separate. Recommendation: treat all files uniformly by name, ignore attribute flags.
- **Path separator normalization** — relative paths should use forward slashes (POSIX style) so they match on both Dropbox and `.gitignore`-style patterns.
- **Case sensitivity** — Windows is case-insensitive; patterns should match accordingly.

## 11. Dependencies

- **epic_DATABASE_FOUNDATION** — needs `file_record` and `exclusion_rule` tables.
- **epic_BACKUP_JOB_MANAGEMENT** — needs jobs to scan (test fixtures can stub this in unit tests).

## 12. References

- **prd:** docs/Product Requirements Document/PRD.md
- **architecture:** docs/Architecture/Architecture.md
- **data_model:** docs/Data Model/Schema.ddl
- **style_guide:** docs/Style Guide/StyleGuide.md

## 13. Implementation Notes

Suggested ticket breakdown (4–5 tickets):

1. Select and integrate the pattern library (`ignore` vs `minimatch`) with a thin adapter.
2. Build the recursive walker using `fs.promises` with async generator output (streaming).
3. Apply exclusion rules per entry; normalize relative paths to forward-slash; capture size and mtime.
4. Error handling: catch per-file errors, log them, and emit `failed`-action records; add `excluded` audit records.
5. Tests on a temporary directory including nested structures, pattern edge cases, locked files (simulated), symlinks, and a 100k-file stress fixture.

**Complexity:** Medium. The traversal is straightforward; the tricky parts are exclusion semantics, path normalization, and error isolation.
