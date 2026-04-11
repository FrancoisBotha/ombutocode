'use strict';

let db = null;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the job management schema on a sql.js Database instance.
 * Creates backup_job, exclusion_rule, and default_exclusion_pattern tables
 * if they do not already exist.
 *
 * @param {Object} dbInstance - A sql.js Database instance
 */
function open(dbInstance) {
  if (!dbInstance || typeof dbInstance.run !== 'function') {
    throw new Error('jobManager: a sql.js Database instance is required');
  }
  db = dbInstance;
  initializeSchema();
  return db;
}

/**
 * Null out the module's db reference (does not close the shared instance).
 */
function close() {
  db = null;
}

function ensureDb() {
  if (!db) throw new Error('jobManager: not initialized — call open() first');
}

/**
 * Create tables and indexes for backup_job, exclusion_rule, and
 * default_exclusion_pattern (SQLite-compatible DDL).
 */
function initializeSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS backup_job (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT    NOT NULL UNIQUE,
      source_path      TEXT    NOT NULL CHECK(length(trim(source_path)) > 0),
      dropbox_target   TEXT    NOT NULL CHECK(length(trim(dropbox_target)) > 0),
      interval_minutes INTEGER NOT NULL CHECK(interval_minutes > 0),
      enabled          INTEGER NOT NULL DEFAULT 1,
      strict_checksum  INTEGER NOT NULL DEFAULT 0,
      mirror_deletes   INTEGER NOT NULL DEFAULT 0,
      last_run_at      TEXT,
      next_run_at      TEXT,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS exclusion_rule (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id     INTEGER NOT NULL REFERENCES backup_job(id) ON DELETE CASCADE,
      pattern    TEXT    NOT NULL CHECK(length(trim(pattern)) > 0),
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(job_id, pattern)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS ix_exclusion_rule_job ON exclusion_rule(job_id)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS default_exclusion_pattern (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern     TEXT    NOT NULL UNIQUE,
      category    TEXT    NOT NULL CHECK(category IN ('vcs','build','os','editor','misc')),
      description TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS backup_run (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id          INTEGER NOT NULL REFERENCES backup_job(id) ON DELETE CASCADE,
      status          TEXT    NOT NULL DEFAULT 'pending'
                              CHECK(status IN ('pending','running','completed','failed','cancelled')),
      trigger_source  TEXT    NOT NULL DEFAULT 'scheduler'
                              CHECK(trigger_source IN ('scheduler','manual')),
      started_at      TEXT,
      finished_at     TEXT,
      files_scanned   INTEGER NOT NULL DEFAULT 0,
      files_uploaded  INTEGER NOT NULL DEFAULT 0,
      files_skipped   INTEGER NOT NULL DEFAULT 0,
      files_failed    INTEGER NOT NULL DEFAULT 0,
      files_deleted   INTEGER NOT NULL DEFAULT 0,
      bytes_uploaded  INTEGER NOT NULL DEFAULT 0,
      error_message   TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS ix_backup_run_job_started ON backup_run(job_id, started_at DESC)`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now() {
  return new Date().toISOString();
}

/**
 * Convert a sql.js row object's boolean-like INTEGER columns to real booleans.
 */
function normalizeJobRow(row) {
  if (!row) return null;
  return {
    ...row,
    enabled: !!row.enabled,
    strict_checksum: !!row.strict_checksum,
    mirror_deletes: !!row.mirror_deletes,
  };
}

/**
 * Check that a job name is not already taken (optionally excluding a given id).
 * Throws if a duplicate is found.
 */
function assertUniqueName(name, excludeId) {
  const stmt = db.prepare(
    'SELECT id FROM backup_job WHERE name = ? AND id != ?'
  );
  stmt.bind([name, excludeId ?? -1]);
  const exists = stmt.step();
  stmt.free();
  if (exists) {
    throw new Error(`A job with the name "${name}" already exists`);
  }
}

/**
 * Validate that interval_minutes is a positive integer.
 */
function assertPositiveInterval(interval) {
  if (typeof interval !== 'number' || !Number.isFinite(interval) || interval <= 0) {
    throw new Error('interval_minutes must be a positive number greater than 0');
  }
}

// ---------------------------------------------------------------------------
// backup_job CRUD
// ---------------------------------------------------------------------------

/**
 * List all backup jobs ordered by name.
 * @returns {Object[]}
 */
function listJobs() {
  ensureDb();
  const stmt = db.prepare('SELECT * FROM backup_job ORDER BY name ASC');
  const results = [];
  while (stmt.step()) {
    results.push(normalizeJobRow(stmt.getAsObject()));
  }
  stmt.free();
  return results;
}

/**
 * Get a single backup job by id.
 * @param {number} id
 * @returns {Object|null}
 */
function getJob(id) {
  ensureDb();
  const stmt = db.prepare('SELECT * FROM backup_job WHERE id = ?');
  stmt.bind([id]);
  let job = null;
  if (stmt.step()) {
    job = normalizeJobRow(stmt.getAsObject());
  }
  stmt.free();
  return job;
}

/**
 * Create a new backup job and seed its exclusion rules from
 * default_exclusion_pattern (active rows) plus any caller-supplied patterns.
 *
 * Runs in a single transaction.
 *
 * @param {Object} data
 * @param {string}   data.name
 * @param {string}   data.source_path
 * @param {string}   data.dropbox_target
 * @param {number}   data.interval_minutes
 * @param {boolean}  [data.enabled=true]
 * @param {boolean}  [data.strict_checksum=false]
 * @param {boolean}  [data.mirror_deletes=false]
 * @param {string[]} [data.exclusion_patterns] - additional patterns on top of defaults
 * @returns {Object} The created job (with id)
 */
function createJob(data) {
  ensureDb();
  assertUniqueName(data.name);
  assertPositiveInterval(data.interval_minutes);

  const ts = now();

  db.run('BEGIN TRANSACTION');
  try {
    // Insert backup_job row
    const insertJob = db.prepare(`
      INSERT INTO backup_job
        (name, source_path, dropbox_target, interval_minutes,
         enabled, strict_checksum, mirror_deletes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertJob.bind([
      data.name,
      data.source_path,
      data.dropbox_target,
      data.interval_minutes,
      data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
      data.strict_checksum ? 1 : 0,
      data.mirror_deletes ? 1 : 0,
      ts,
      ts,
    ]);
    insertJob.step();
    insertJob.free();

    // Retrieve the new job id
    const idStmt = db.prepare('SELECT last_insert_rowid() AS id');
    idStmt.step();
    const jobId = idStmt.getAsObject().id;
    idStmt.free();

    // Collect patterns to seed: active defaults + caller-supplied extras
    const patterns = new Set();

    // Read active default exclusion patterns
    const defStmt = db.prepare(
      'SELECT pattern FROM default_exclusion_pattern WHERE is_active = 1'
    );
    while (defStmt.step()) {
      patterns.add(defStmt.getAsObject().pattern);
    }
    defStmt.free();

    // Merge caller-supplied patterns
    if (Array.isArray(data.exclusion_patterns)) {
      for (const p of data.exclusion_patterns) {
        if (typeof p === 'string' && p.trim().length > 0) {
          patterns.add(p.trim());
        }
      }
    }

    // Insert exclusion_rule rows
    if (patterns.size > 0) {
      const insertRule = db.prepare(
        'INSERT INTO exclusion_rule (job_id, pattern, created_at, updated_at) VALUES (?, ?, ?, ?)'
      );
      for (const pattern of patterns) {
        insertRule.bind([jobId, pattern, ts, ts]);
        insertRule.step();
        insertRule.reset();
      }
      insertRule.free();
    }

    db.run('COMMIT');
    return getJob(jobId);
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

/**
 * Update an existing backup job's fields.
 * Does NOT touch last_run_at or next_run_at (owned by scheduler).
 *
 * @param {number} id
 * @param {Object} fields - Subset of updatable fields
 * @returns {Object|null} Updated job or null if not found
 */
function updateJob(id, fields) {
  ensureDb();

  const existing = getJob(id);
  if (!existing) return null;

  if (fields.name !== undefined) {
    assertUniqueName(fields.name, id);
  }
  if (fields.interval_minutes !== undefined) {
    assertPositiveInterval(fields.interval_minutes);
  }

  const allowed = [
    'name', 'source_path', 'dropbox_target', 'interval_minutes',
    'enabled', 'strict_checksum', 'mirror_deletes',
  ];

  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (entries.length === 0) return existing;

  // Convert booleans to integers for SQLite storage
  const boolFields = new Set(['enabled', 'strict_checksum', 'mirror_deletes']);
  const values = entries.map(([k, v]) => boolFields.has(k) ? (v ? 1 : 0) : v);

  const setClauses = entries.map(([k]) => `${k} = ?`).join(', ');
  values.push(now()); // updated_at
  values.push(id);

  const stmt = db.prepare(
    `UPDATE backup_job SET ${setClauses}, updated_at = ? WHERE id = ?`
  );
  stmt.bind(values);
  stmt.step();
  stmt.free();

  return getJob(id);
}

/**
 * Delete a backup job and cascade to its exclusion_rule rows.
 * Runs in a single transaction. Relies on ON DELETE CASCADE but also
 * explicitly deletes exclusion_rule rows for clarity and safety.
 *
 * @param {number} id
 * @returns {boolean} true if deleted, false if not found
 */
function deleteJob(id) {
  ensureDb();

  const existing = getJob(id);
  if (!existing) return false;

  db.run('BEGIN TRANSACTION');
  try {
    // Explicitly delete exclusion rules first
    const delRules = db.prepare('DELETE FROM exclusion_rule WHERE job_id = ?');
    delRules.bind([id]);
    delRules.step();
    delRules.free();

    // Delete the job
    const delJob = db.prepare('DELETE FROM backup_job WHERE id = ?');
    delJob.bind([id]);
    delJob.step();
    delJob.free();

    db.run('COMMIT');
    return true;
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

/**
 * Toggle the enabled flag on a backup job without touching any other field.
 *
 * @param {number} id
 * @returns {Object|null} Updated job or null if not found
 */
function toggleJobEnabled(id) {
  ensureDb();

  const existing = getJob(id);
  if (!existing) return null;

  const newVal = existing.enabled ? 0 : 1;
  const stmt = db.prepare(
    'UPDATE backup_job SET enabled = ?, updated_at = ? WHERE id = ?'
  );
  stmt.bind([newVal, now(), id]);
  stmt.step();
  stmt.free();

  return getJob(id);
}

// ---------------------------------------------------------------------------
// backup_job + backup_run join
// ---------------------------------------------------------------------------

/**
 * List all backup jobs joined with the most recent backup_run per job.
 * Jobs with no runs are included with null last-run fields.
 *
 * The correlated subquery leverages the ix_backup_run_job_started index
 * (job_id, started_at DESC) for efficient lookup.
 *
 * @returns {Object[]}
 */
function listJobsWithLatestRun() {
  ensureDb();
  const stmt = db.prepare(`
    SELECT
      j.*,
      r.status       AS last_run_status,
      r.finished_at  AS last_run_finished_at
    FROM backup_job j
    LEFT JOIN backup_run r
      ON r.id = (
        SELECT r2.id
        FROM backup_run r2
        WHERE r2.job_id = j.id
        ORDER BY r2.started_at DESC
        LIMIT 1
      )
    ORDER BY j.name ASC
  `);
  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      ...normalizeJobRow(row),
      last_run_status: row.last_run_status ?? null,
      last_run_finished_at: row.last_run_finished_at ?? null,
    });
  }
  stmt.free();
  return results;
}

// ---------------------------------------------------------------------------
// exclusion_rule helpers
// ---------------------------------------------------------------------------

/**
 * List all exclusion rules for a given job.
 * @param {number} jobId
 * @returns {Object[]}
 */
function listExclusionRulesForJob(jobId) {
  ensureDb();
  const stmt = db.prepare(
    'SELECT * FROM exclusion_rule WHERE job_id = ? ORDER BY pattern ASC'
  );
  stmt.bind([jobId]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Replace all exclusion rules for a job with the given pattern list.
 * Deletes existing rules and inserts the new set in a single transaction.
 *
 * @param {number} jobId
 * @param {string[]} patterns
 * @returns {Object[]} The new exclusion rules
 */
function replaceExclusionRulesForJob(jobId, patterns) {
  ensureDb();

  // Verify job exists
  const job = getJob(jobId);
  if (!job) throw new Error(`Job with id ${jobId} not found`);

  const ts = now();

  db.run('BEGIN TRANSACTION');
  try {
    // Remove existing rules
    const del = db.prepare('DELETE FROM exclusion_rule WHERE job_id = ?');
    del.bind([jobId]);
    del.step();
    del.free();

    // Insert new rules (deduplicate, skip blanks)
    const seen = new Set();
    const insertStmt = db.prepare(
      'INSERT INTO exclusion_rule (job_id, pattern, created_at, updated_at) VALUES (?, ?, ?, ?)'
    );
    for (const p of patterns) {
      const trimmed = typeof p === 'string' ? p.trim() : '';
      if (trimmed.length === 0 || seen.has(trimmed)) continue;
      seen.add(trimmed);
      insertStmt.bind([jobId, trimmed, ts, ts]);
      insertStmt.step();
      insertStmt.reset();
    }
    insertStmt.free();

    db.run('COMMIT');
    return listExclusionRulesForJob(jobId);
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  open,
  close,
  listJobs,
  listJobsWithLatestRun,
  getJob,
  createJob,
  updateJob,
  deleteJob,
  toggleJobEnabled,
  listExclusionRulesForJob,
  replaceExclusionRulesForJob,
};
