'use strict';

let db = null;

/**
 * Initialize the artifact schema on a sql.js Database instance (shared-db mode).
 *
 * @param {Object} dbInstance - A sql.js Database instance
 */
function open(dbInstance) {
  if (!dbInstance || typeof dbInstance.run !== 'function') {
    throw new Error('artifactDb: a sql.js Database instance is required');
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

/**
 * Create artifacts and counters tables with indexes.
 */
function initializeSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id            TEXT PRIMARY KEY,
      type          TEXT,
      title         TEXT,
      status        TEXT,
      parent_id     TEXT,
      file_path     TEXT,
      data          TEXT,
      last_modified TEXT
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_artifacts_type      ON artifacts(type)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_artifacts_status    ON artifacts(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_artifacts_parent_id ON artifacts(parent_id)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS counters (
      type     TEXT PRIMARY KEY,
      next_val INTEGER NOT NULL DEFAULT 1
    )
  `);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Insert a new artifact row.
 * @param {Object} row - { id, type, title, status, parent_id, file_path, data, last_modified }
 */
function insertArtifact(row) {
  if (!db) throw new Error('artifactDb: not initialized');

  const stmt = db.prepare(`
    INSERT INTO artifacts (id, type, title, status, parent_id, file_path, data, last_modified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.bind([
    row.id ?? null,
    row.type ?? null,
    row.title ?? null,
    row.status ?? null,
    row.parent_id ?? null,
    row.file_path ?? null,
    row.data ?? null,
    row.last_modified ?? null,
  ]);
  stmt.step();
  stmt.free();

  return getArtifact(row.id);
}

/**
 * Update specific fields of an artifact.
 * @param {string} id - Artifact ID
 * @param {Object} fields - Fields to update
 * @returns {Object|null} Updated artifact or null if not found
 */
function updateArtifact(id, fields) {
  if (!db) throw new Error('artifactDb: not initialized');

  const allowed = ['type', 'title', 'status', 'parent_id', 'file_path', 'data', 'last_modified'];
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (entries.length === 0) return getArtifact(id);

  const setClauses = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  values.push(id);

  const stmt = db.prepare(`UPDATE artifacts SET ${setClauses} WHERE id = ?`);
  stmt.bind(values);
  stmt.step();
  stmt.free();

  return getArtifact(id);
}

/**
 * Delete an artifact by ID.
 * @returns {boolean} true if deleted, false if not found
 */
function deleteArtifact(id) {
  if (!db) throw new Error('artifactDb: not initialized');

  const existing = getArtifact(id);
  if (!existing) return false;

  const stmt = db.prepare('DELETE FROM artifacts WHERE id = ?');
  stmt.bind([id]);
  stmt.step();
  stmt.free();

  return true;
}

/**
 * Get a single artifact by ID.
 * @returns {Object|null}
 */
function getArtifact(id) {
  if (!db) throw new Error('artifactDb: not initialized');

  const stmt = db.prepare('SELECT * FROM artifacts WHERE id = ?');
  stmt.bind([id]);

  let artifact = null;
  if (stmt.step()) {
    artifact = stmt.getAsObject();
  }
  stmt.free();

  return artifact;
}

/**
 * List artifacts with optional filters.
 * @param {Object} [filters] - { type, status, search }
 *   search: matched against title using LIKE %search%
 * @returns {Object[]}
 */
function listArtifacts(filters = {}) {
  if (!db) throw new Error('artifactDb: not initialized');

  const conditions = [];
  const params = [];

  if (filters.type) {
    conditions.push('type = ?');
    params.push(filters.type);
  }
  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.search) {
    conditions.push('title LIKE ?');
    params.push(`%${filters.search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const stmt = db.prepare(`SELECT * FROM artifacts ${where} ORDER BY id ASC`);
  if (params.length > 0) {
    stmt.bind(params);
  }

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

/**
 * Read the counter for a type and return the formatted ID (e.g., "US-048").
 * If no counter exists for the type, initializes it to 1 and returns "{type}-001".
 * Does NOT increment the counter.
 * @param {string} type - Artifact type prefix (e.g., "US", "FR")
 * @returns {string} Formatted ID
 */
function getNextId(type) {
  if (!db) throw new Error('artifactDb: not initialized');

  const stmt = db.prepare('SELECT next_val FROM counters WHERE type = ?');
  stmt.bind([type]);

  let nextVal = null;
  if (stmt.step()) {
    nextVal = stmt.getAsObject().next_val;
  }
  stmt.free();

  if (nextVal === null) {
    // Initialize counter
    const ins = db.prepare('INSERT OR IGNORE INTO counters (type, next_val) VALUES (?, 1)');
    ins.bind([type]);
    ins.step();
    ins.free();
    nextVal = 1;
  }

  return `${type}-${String(nextVal).padStart(3, '0')}`;
}

/**
 * Atomically increment the counter for a type and return the new value.
 * Initializes to 1 if the counter does not exist (returns 2 after increment).
 * @param {string} type - Artifact type prefix
 * @returns {number} New counter value after increment
 */
function incrementCounter(type) {
  if (!db) throw new Error('artifactDb: not initialized');

  // Ensure the row exists
  const ins = db.prepare('INSERT OR IGNORE INTO counters (type, next_val) VALUES (?, 1)');
  ins.bind([type]);
  ins.step();
  ins.free();

  const upd = db.prepare('UPDATE counters SET next_val = next_val + 1 WHERE type = ?');
  upd.bind([type]);
  upd.step();
  upd.free();

  const sel = db.prepare('SELECT next_val FROM counters WHERE type = ?');
  sel.bind([type]);
  let newVal = null;
  if (sel.step()) {
    newVal = sel.getAsObject().next_val;
  }
  sel.free();

  return newVal;
}

/**
 * Rebuild counters by scanning all artifacts and setting each counter to max+1.
 * @param {Object[]} artifacts - Array of artifact objects (with id and type fields)
 */
function rebuildCounters(artifacts) {
  if (!db) throw new Error('artifactDb: not initialized');

  // Find max numeric suffix per type
  const maxByType = {};

  for (const artifact of artifacts) {
    if (!artifact.id || !artifact.type) continue;

    // IDs are formatted as "{type}-{NNN}"
    const match = artifact.id.match(/^([^-]+)-(\d+)$/);
    if (!match) continue;

    const prefix = match[1];
    const num = parseInt(match[2], 10);

    if (maxByType[prefix] === undefined || num > maxByType[prefix]) {
      maxByType[prefix] = num;
    }
  }

  // Set each counter to max+1
  for (const [type, max] of Object.entries(maxByType)) {
    const stmt = db.prepare('INSERT OR REPLACE INTO counters (type, next_val) VALUES (?, ?)');
    stmt.bind([type, max + 1]);
    stmt.step();
    stmt.free();
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  open,
  close,
  insertArtifact,
  updateArtifact,
  deleteArtifact,
  getArtifact,
  listArtifacts,
  getNextId,
  incrementCounter,
  rebuildCounters,
};
