-- =============================================================================
-- DropSync — PostgreSQL Schema
-- =============================================================================
-- Source documents:
--   docs/Product Requirements Document/PRD.md
--   docs/Architecture/Architecture.md  (ERD in §4, ADRs in §6)
--
-- Scope:
--   Single-user desktop backup utility. PostgreSQL dialect is used as the DDL
--   authoring target; the runtime database in the architecture is embedded
--   SQLite. There is no users/tenants table — the app is single-tenant.
--
-- Conventions:
--   - snake_case, singular table names
--   - BIGINT identity primary keys
--   - TIMESTAMPTZ for all timestamps
--   - created_at / updated_at on all mutable tables; updated_at maintained by trigger
--   - Hard delete with ON DELETE CASCADE down the job → run → file/log chain
--   - Enum-like columns use CHECK constraints (portable, simple to evolve)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Reusable trigger function to maintain updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- Meta / infrastructure tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- schema_migration — tracks applied DDL migrations for future evolution
-- -----------------------------------------------------------------------------
CREATE TABLE schema_migration (
    version     VARCHAR(32)  PRIMARY KEY,
    description TEXT         NOT NULL,
    applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- -----------------------------------------------------------------------------
-- app_settings — global key/value preferences (single-row-per-key)
-- Holds things like default backup interval, auto-start flag, strict-checksum
-- mode, notification preferences. Values stored as JSONB for type flexibility.
-- -----------------------------------------------------------------------------
CREATE TABLE app_settings (
    key         VARCHAR(128) PRIMARY KEY,
    value       JSONB        NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER app_settings_set_updated_at
    BEFORE UPDATE ON app_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- -----------------------------------------------------------------------------
-- default_exclusion_pattern — seed list of built-in exclusion patterns
-- (e.g. node_modules, .git, *.tmp, Thumbs.db). New jobs can copy from here.
-- See Architecture §8 "Default exclusion patterns" open question.
-- -----------------------------------------------------------------------------
CREATE TABLE default_exclusion_pattern (
    id          BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pattern     VARCHAR(512) NOT NULL,
    category    VARCHAR(64)  NOT NULL,  -- 'vcs', 'build', 'os', 'editor', 'misc'
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT default_exclusion_pattern_pattern_unique UNIQUE (pattern),
    CONSTRAINT default_exclusion_pattern_category_chk
        CHECK (category IN ('vcs', 'build', 'os', 'editor', 'misc'))
);

CREATE TRIGGER default_exclusion_pattern_set_updated_at
    BEFORE UPDATE ON default_exclusion_pattern
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX ix_default_exclusion_pattern_active
    ON default_exclusion_pattern (is_active)
    WHERE is_active = TRUE;


-- =============================================================================
-- Core domain tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- backup_job — user-configured backup job
-- Matches Architecture §4 ERD "BackupJob".
-- -----------------------------------------------------------------------------
CREATE TABLE backup_job (
    id                 BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name               VARCHAR(255) NOT NULL,
    source_path        TEXT         NOT NULL,   -- local absolute path
    dropbox_target     TEXT         NOT NULL,   -- path inside the user's Dropbox
    interval_minutes   INTEGER      NOT NULL,
    enabled            BOOLEAN      NOT NULL DEFAULT TRUE,
    strict_checksum    BOOLEAN      NOT NULL DEFAULT FALSE,  -- ADR-002 opt-in mode
    mirror_deletes     BOOLEAN      NOT NULL DEFAULT FALSE,  -- ADR-005; default preserve
    last_run_at        TIMESTAMPTZ,
    next_run_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT backup_job_name_unique              UNIQUE (name),
    CONSTRAINT backup_job_interval_positive_chk    CHECK (interval_minutes > 0),
    CONSTRAINT backup_job_source_not_blank_chk     CHECK (length(btrim(source_path)) > 0),
    CONSTRAINT backup_job_target_not_blank_chk     CHECK (length(btrim(dropbox_target)) > 0)
);

CREATE TRIGGER backup_job_set_updated_at
    BEFORE UPDATE ON backup_job
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX ix_backup_job_enabled_next_run
    ON backup_job (next_run_at)
    WHERE enabled = TRUE;


-- -----------------------------------------------------------------------------
-- exclusion_rule — per-job .gitignore-style exclusion pattern
-- -----------------------------------------------------------------------------
CREATE TABLE exclusion_rule (
    id         BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id     BIGINT       NOT NULL
                            REFERENCES backup_job (id) ON DELETE CASCADE,
    pattern    VARCHAR(512) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT exclusion_rule_job_pattern_unique UNIQUE (job_id, pattern),
    CONSTRAINT exclusion_rule_pattern_not_blank_chk
        CHECK (length(btrim(pattern)) > 0)
);

CREATE TRIGGER exclusion_rule_set_updated_at
    BEFORE UPDATE ON exclusion_rule
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX ix_exclusion_rule_job ON exclusion_rule (job_id);


-- -----------------------------------------------------------------------------
-- backup_run — a single execution of a backup job
-- status values follow Architecture §4 data flow:
--   'pending'   — queued but not yet started
--   'running'   — scanner/diff/upload in progress
--   'completed' — finished successfully
--   'failed'    — terminal error
--   'cancelled' — user-aborted
-- -----------------------------------------------------------------------------
CREATE TABLE backup_run (
    id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id          BIGINT       NOT NULL
                                 REFERENCES backup_job (id) ON DELETE CASCADE,
    status          VARCHAR(16)  NOT NULL DEFAULT 'pending',
    trigger_source  VARCHAR(16)  NOT NULL DEFAULT 'scheduler',  -- 'scheduler' | 'manual'
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    files_scanned   INTEGER      NOT NULL DEFAULT 0,
    files_uploaded  INTEGER      NOT NULL DEFAULT 0,
    files_skipped   INTEGER      NOT NULL DEFAULT 0,
    files_failed    INTEGER      NOT NULL DEFAULT 0,
    files_deleted   INTEGER      NOT NULL DEFAULT 0,
    bytes_uploaded  BIGINT       NOT NULL DEFAULT 0,
    error_message   TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT backup_run_status_chk
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    CONSTRAINT backup_run_trigger_source_chk
        CHECK (trigger_source IN ('scheduler', 'manual')),
    CONSTRAINT backup_run_counts_nonneg_chk
        CHECK (files_scanned  >= 0
           AND files_uploaded >= 0
           AND files_skipped  >= 0
           AND files_failed   >= 0
           AND files_deleted  >= 0
           AND bytes_uploaded >= 0),
    CONSTRAINT backup_run_finish_after_start_chk
        CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at)
);

CREATE TRIGGER backup_run_set_updated_at
    BEFORE UPDATE ON backup_run
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX ix_backup_run_job_started    ON backup_run (job_id, started_at DESC);
CREATE INDEX ix_backup_run_status_started ON backup_run (status, started_at DESC);


-- -----------------------------------------------------------------------------
-- file_record — per-run history of every file observed by the scanner
-- Full per-run history (one row per file per run) so a backup can be
-- reconstructed as it stood after any given run. job_id is denormalised for
-- cheap job-level queries; it must match backup_run.job_id (enforced in app).
--
-- action values:
--   'new'       — first time this path is seen
--   'changed'   — size/mtime (or checksum in strict mode) differs from prior run
--   'unchanged' — exists and identical to prior run; skipped upload
--   'deleted'   — existed in prior run, gone from source this run
--   'failed'    — scan or upload error for this file
--   'excluded'  — matched an exclusion rule (recorded for audit only)
-- -----------------------------------------------------------------------------
CREATE TABLE file_record (
    id                  BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id              BIGINT       NOT NULL
                                     REFERENCES backup_run (id) ON DELETE CASCADE,
    job_id              BIGINT       NOT NULL
                                     REFERENCES backup_job (id) ON DELETE CASCADE,
    relative_path       TEXT         NOT NULL,
    size_bytes          BIGINT,
    modified_at         TIMESTAMPTZ,
    checksum            VARCHAR(128),        -- hex digest (MD5 32c, SHA-256 64c)
    checksum_algorithm  VARCHAR(16),         -- 'md5' | 'sha256' | NULL
    dropbox_rev         VARCHAR(64),         -- Dropbox revision id after upload
    dropbox_path        TEXT,                -- full Dropbox path of uploaded file
    action              VARCHAR(16)  NOT NULL,
    upload_started_at   TIMESTAMPTZ,
    upload_finished_at  TIMESTAMPTZ,
    error_message       TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT file_record_action_chk
        CHECK (action IN ('new', 'changed', 'unchanged', 'deleted', 'failed', 'excluded')),
    CONSTRAINT file_record_checksum_algo_chk
        CHECK (checksum_algorithm IS NULL
               OR checksum_algorithm IN ('md5', 'sha256')),
    CONSTRAINT file_record_size_nonneg_chk
        CHECK (size_bytes IS NULL OR size_bytes >= 0),
    CONSTRAINT file_record_run_path_unique
        UNIQUE (run_id, relative_path)
);

CREATE INDEX ix_file_record_job_path   ON file_record (job_id, relative_path);
CREATE INDEX ix_file_record_run_action ON file_record (run_id, action);
CREATE INDEX ix_file_record_job_created
    ON file_record (job_id, created_at DESC);


-- -----------------------------------------------------------------------------
-- run_log — structured log lines emitted during a backup run
-- level values: 'debug' | 'info' | 'warn' | 'error'
-- -----------------------------------------------------------------------------
CREATE TABLE run_log (
    id         BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id     BIGINT       NOT NULL
                            REFERENCES backup_run (id) ON DELETE CASCADE,
    level      VARCHAR(8)   NOT NULL,
    message    TEXT         NOT NULL,
    context    JSONB,                -- optional structured payload (file path, error code, etc.)
    ts         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT run_log_level_chk
        CHECK (level IN ('debug', 'info', 'warn', 'error'))
);

CREATE INDEX ix_run_log_run_ts ON run_log (run_id, ts);
CREATE INDEX ix_run_log_level  ON run_log (level)
    WHERE level IN ('warn', 'error');


-- =============================================================================
-- End of schema
-- =============================================================================
