# Epic: FILE_SCANNER_AND_DIFF

Status: NEW

## Overview

Deliver the two core engine components that decide what a backup run should
actually do: the **File Scanner** that walks a job's source directory applying
`.gitignore`-style exclusion rules, and the **Diff Engine** that compares the
scanned set against the prior run's `file_record` state to classify every path
as `new`, `changed`, `unchanged`, or `deleted`. These components are the
correctness core of DropSync (Architecture §3, ADR-002).

This epic delivers the engines in isolation with their own tests. They are
orchestrated by the pipeline epic and consumed by the uploader.

## Scope

### In Scope
- `.gitignore`-style pattern matching using `ignore` (preferred) or
  `minimatch`; negation patterns respected
- Directory walker that is resilient to permission errors and open/locked
  files: errors are caught per file and reported, not fatal
- Per-file fingerprinting: size and modified timestamp (always); optional
  SHA-256 checksum when `backup_job.strict_checksum = true`
- Fingerprint comparison against the most recent prior `file_record` for the
  same `(job_id, relative_path)`
- Classification output: `new`, `changed`, `unchanged`, `deleted`, plus
  `failed` and `excluded` for completeness with the schema `action` enum
- A streaming iterator interface so large trees do not require holding the
  full set in memory
- Standalone unit tests exercising inclusion, exclusion, diff correctness,
  strict mode, and the locked-file error path

### Out of Scope
- Actually uploading anything (UPLOAD_MANAGER)
- Creating `backup_run` rows or writing `file_record` rows to the database
  (SCHEDULER_AND_RUN_PIPELINE orchestrates those writes)
- UI for exclusion rule editing (BACKUP_JOB_MANAGEMENT)
- Default exclusion seeds (DATABASE_FOUNDATION)

## Functional Requirements

1. Given a source path and a list of exclusion patterns, the Scanner yields
   every included file with its size and modified timestamp.
2. Exclusion patterns follow `.gitignore` semantics including directory
   matches (e.g. `node_modules/`), globs (e.g. `*.tmp`), and negations.
3. The Scanner continues past per-file errors (locked files, permission
   denied), emitting a `failed` entry for each and never aborting the walk.
4. With `strict_checksum = true`, files are hashed with SHA-256 and the hex
   digest plus algorithm are emitted alongside the fingerprint.
5. Given a scanned set and the prior run's `file_record` snapshot for the
   same job, the Diff Engine classifies every path as `new`, `changed`,
   `unchanged`, or `deleted`.
6. A file is `unchanged` if size and `modified_at` match the prior record and
   (in strict mode) the checksum also matches.
7. The Scanner streams results so a 100k-file tree does not require loading
   the whole set in memory at once.

## Acceptance Criteria

- [ ] Unit tests cover: inclusion, multi-pattern exclusion, directory
      exclusion, negation patterns, locked-file handling, and empty trees
- [ ] Diff Engine tests cover: all-new, all-unchanged, mixed, all-deleted,
      rename-as-delete-plus-new, and strict-mode checksum mismatch
- [ ] Scanner emits a `failed` entry for a synthetic permission-denied file
      and continues
- [ ] Strict mode produces SHA-256 digests; non-strict mode does not
- [ ] Scanner exposes an async iterator (or equivalent streaming interface)
      consumable by the pipeline epic
- [ ] Classification output aligns with the `file_record.action` enum values

## Dependencies

- APP_SHELL
- DATABASE_FOUNDATION (reads prior `file_record` rows for diffing)

## Tickets

_To be created during planning mode._
