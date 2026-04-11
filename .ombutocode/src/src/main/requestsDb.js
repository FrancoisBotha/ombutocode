const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

let db = null;
let SQL = null;
let currentDbPath = null;
let isSharedDb = false;
let metadataPrefix = '';

// No default path — callers must provide an explicit path

/**
 * Initialize the SQL.js module and load or create the database.
 * Accepts either a file path (string) or a sql.js Database instance.
 * When a Database instance is passed, the module operates in shared-db mode:
 *   - metadataPrefix is set to 'requests:'
 *   - saveDb() becomes a no-op (caller owns persistence)
 *   - close() nulls out the reference without calling db.close()
 */
async function initDb(dbPathOrInstance) {
  // Detect if argument is a sql.js Database instance (has .run method and is an object)
  if (dbPathOrInstance && typeof dbPathOrInstance === 'object' && typeof dbPathOrInstance.run === 'function') {
    // Shared db mode
    db = dbPathOrInstance;
    isSharedDb = true;
    metadataPrefix = 'requests:';
    currentDbPath = null;
    initializeSchema();
    return db;
  }

  // Standalone mode (string path or null) — original behavior
  const targetPath = dbPathOrInstance || currentDbPath;
  if (!targetPath) {
    throw new Error('requestsDb: no database path provided and no current database open');
  }

  // If already initialized with the same path, return existing
  if (db && SQL && currentDbPath === targetPath) {
    return db;
  }

  // If switching databases, close the current one
  if (db && currentDbPath !== targetPath) {
    close();
  }

  // Initialize sql.js
  if (!SQL) {
    SQL = await initSqlJs();
  }

  isSharedDb = false;
  metadataPrefix = '';
  currentDbPath = targetPath;

  // Load existing database or create new
  if (fs.existsSync(currentDbPath)) {
    const buffer = fs.readFileSync(currentDbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
    initializeSchema();
    saveDb();
  }

  return db;
}

/**
 * Initialize database schema
 */
function initializeSchema() {
  // Create metadata table
  db.run(`
    CREATE TABLE IF NOT EXISTS metadata (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Create requests table
  db.run(`
    CREATE TABLE IF NOT EXISTS requests (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'new',
      epic_ref TEXT DEFAULT NULL,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    )
  `);

  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at)`);

  // Initialize metadata with defaults (use prefixed keys)
  db.run(`INSERT OR IGNORE INTO metadata (key, value) VALUES ('${metadataPrefix}last_request_id', '0')`);
  db.run(`INSERT OR IGNORE INTO metadata (key, value) VALUES ('${metadataPrefix}version', '1')`);
}

/**
 * Save database to file.
 * In shared-db mode, this is a no-op (caller manages persistence).
 */
function saveDb() {
  if (isSharedDb) return;
  if (!db || !currentDbPath) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(currentDbPath, buffer);
  } catch (err) {
    // Silently ignore errors if the directory/file no longer exists (e.g., in tests)
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Open database connection.
 * Accepts either a file path (string) or a sql.js Database instance.
 */
async function open(dbPathOrInstance = null) {
  return initDb(dbPathOrInstance);
}

/**
 * Close database connection.
 * In shared-db mode, nulls out the module reference without closing the db.
 */
function close() {
  if (db) {
    if (isSharedDb) {
      db = null;
      currentDbPath = null;
      isSharedDb = false;
      metadataPrefix = '';
    } else {
      saveDb();
      db.close();
      db = null;
      currentDbPath = null;
    }
  }
}

/**
 * Generate the next request ID using the counter stored in metadata.
 * Format: REQ-001, REQ-002, ..., REQ-100, etc.
 * Counter is incremented atomically within the same synchronous call.
 */
function generateNextId() {
  const key = `${metadataPrefix}last_request_id`;
  const stmt = db.prepare("SELECT value FROM metadata WHERE key = ?");
  stmt.bind([key]);
  let counter = 0;
  if (stmt.step()) {
    counter = parseInt(stmt.getAsObject().value, 10) || 0;
  }
  stmt.free();

  counter += 1;

  const updateStmt = db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)");
  updateStmt.bind([key, String(counter)]);
  updateStmt.step();
  updateStmt.free();

  return `REQ-${String(counter).padStart(3, '0')}`;
}

/**
 * Deserialize a request row from database
 */
function deserializeRequest(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    status: row.status,
    epic_ref: row.epic_ref || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Create a new request
 * @param {Object} params - { title, description? }
 * @returns {Object} The created request
 */
function createRequest({ title, description = '' }) {
  if (!db) throw new Error('Database not initialized');
  if (!title || !title.trim()) throw new Error('title is required');

  const id = generateNextId();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO requests (id, title, description, status, epic_ref, created_at, updated_at)
    VALUES (?, ?, ?, 'new', NULL, ?, ?)
  `);
  stmt.bind([id, title.trim(), description || '', now, now]);
  stmt.step();
  stmt.free();

  saveDb();

  return getRequest(id);
}

/**
 * Get a single request by ID
 * @param {string} id - Request ID (e.g. REQ-001)
 * @returns {Object|null} The request or null if not found
 */
function getRequest(id) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT * FROM requests WHERE id = ?');
  stmt.bind([id]);

  let request = null;
  if (stmt.step()) {
    request = deserializeRequest(stmt.getAsObject());
  }

  stmt.free();
  return request;
}

/**
 * Get all requests with optional pagination
 * @param {Object} options - { limit?, offset? }
 * @returns {Object} { requests: [], total: number }
 */
function getAllRequests(options = {}) {
  if (!db) throw new Error('Database not initialized');

  const limit = options.limit || 100;
  const offset = options.offset || 0;

  // Get total count
  const countStmt = db.prepare('SELECT COUNT(*) as total FROM requests');
  let total = 0;
  if (countStmt.step()) {
    total = countStmt.getAsObject().total;
  }
  countStmt.free();

  // Get paginated results
  const stmt = db.prepare('SELECT * FROM requests ORDER BY created_at DESC LIMIT ? OFFSET ?');
  stmt.bind([limit, offset]);

  const requests = [];
  while (stmt.step()) {
    requests.push(deserializeRequest(stmt.getAsObject()));
  }

  stmt.free();
  return { requests, total };
}

/**
 * Update a request's title and/or description
 * @param {string} id - Request ID
 * @param {Object} updates - { title?, description? }
 * @returns {Object|null} The updated request or null if not found
 */
function updateRequest(id, updates) {
  if (!db) throw new Error('Database not initialized');

  const existing = getRequest(id);
  if (!existing) return null;

  const allowedFields = ['title', 'description'];
  const setClauses = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) return existing;

  // Always update updated_at
  setClauses.push('updated_at = ?');
  values.push(new Date().toISOString());

  values.push(id);
  const sql = `UPDATE requests SET ${setClauses.join(', ')} WHERE id = ?`;

  const stmt = db.prepare(sql);
  stmt.bind(values);
  stmt.step();
  stmt.free();

  saveDb();
  return getRequest(id);
}

/**
 * Delete a request by ID
 * @param {string} id - Request ID
 * @returns {boolean} True if deleted, false if not found
 */
function deleteRequest(id) {
  if (!db) throw new Error('Database not initialized');

  const existing = getRequest(id);
  if (!existing) return false;

  const stmt = db.prepare('DELETE FROM requests WHERE id = ?');
  stmt.bind([id]);
  stmt.step();
  stmt.free();

  saveDb();
  return true;
}

/**
 * Search requests by query string and/or filter by status or epic_ref
 * @param {Object} params - { query?, status?, epic_ref?, limit?, offset? }
 * @returns {Object} { requests: [], total: number }
 */
function searchRequests(params = {}) {
  if (!db) throw new Error('Database not initialized');

  const query = params.query || '';
  const status = params.status || '';
  const epicRef = params.epic_ref || '';
  const limit = params.limit || 100;
  const offset = params.offset || 0;

  let sql = 'SELECT * FROM requests WHERE 1=1';
  const queryParams = [];

  if (query) {
    const searchTerm = `%${query}%`;
    sql += ' AND (title LIKE ? OR description LIKE ?)';
    queryParams.push(searchTerm, searchTerm);
  }

  if (status) {
    sql += ' AND status = ?';
    queryParams.push(status);
  }

  if (epicRef) {
    sql += ' AND epic_ref = ?';
    queryParams.push(epicRef);
  }

  // Get total count
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const countStmt = db.prepare(countSql);
  countStmt.bind(queryParams);
  let total = 0;
  if (countStmt.step()) {
    total = countStmt.getAsObject().total;
  }
  countStmt.free();

  // Get paginated results
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  const allParams = [...queryParams, limit, offset];

  const stmt = db.prepare(sql);
  stmt.bind(allParams);

  const requests = [];
  while (stmt.step()) {
    requests.push(deserializeRequest(stmt.getAsObject()));
  }

  stmt.free();
  return { requests, total };
}

/**
 * Link a request to a feature document, changing its status to 'linked'
 * @param {string} id - Request ID
 * @param {string} featurePath - Path to the linked feature document
 * @returns {Object|null} The updated request or null if not found
 */
function linkToFeature(id, featurePath) {
  if (!db) throw new Error('Database not initialized');

  const existing = getRequest(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE requests SET status = 'linked', epic_ref = ?, updated_at = ? WHERE id = ?
  `);
  stmt.bind([featurePath, now, id]);
  stmt.step();
  stmt.free();

  saveDb();
  return getRequest(id);
}

/**
 * Mark a request as done
 * @param {string} id - Request ID
 * @returns {Object|null} The updated request or null if not found
 */
function markRequestDone(id) {
  if (!db) throw new Error('Database not initialized');

  const existing = getRequest(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE requests SET status = 'done', updated_at = ? WHERE id = ?
  `);
  stmt.bind([now, id]);
  stmt.step();
  stmt.free();

  saveDb();
  return getRequest(id);
}

/**
 * Get distinct status values from all requests
 * @returns {string[]} Array of unique status values
 */
function getDistinctStatuses() {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare("SELECT DISTINCT status FROM requests ORDER BY status");
  const statuses = [];

  while (stmt.step()) {
    statuses.push(stmt.getAsObject().status);
  }

  stmt.free();
  return statuses;
}

/**
 * Read metadata value by key (uses namespaced keys in shared-db mode)
 */
function readMetadata(key) {
  if (!db) throw new Error('Database not initialized');

  const prefixedKey = `${metadataPrefix}${key}`;
  const stmt = db.prepare('SELECT value FROM metadata WHERE key = ?');
  stmt.bind([prefixedKey]);

  let value = null;
  if (stmt.step()) {
    value = stmt.getAsObject().value;
  }

  stmt.free();
  return value;
}

/**
 * Update metadata value by key (uses namespaced keys in shared-db mode)
 */
function updateMetadata(key, value) {
  if (!db) throw new Error('Database not initialized');

  const prefixedKey = `${metadataPrefix}${key}`;
  const stmt = db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)');
  stmt.bind([prefixedKey, value]);
  stmt.step();
  stmt.free();

  saveDb();
}

module.exports = {
  // Core database operations
  open,
  close,
  initializeSchema,
  saveDb,

  // CRUD operations
  createRequest,
  getRequest,
  getAllRequests,
  updateRequest,
  deleteRequest,
  searchRequests,
  linkToFeature,
  markRequestDone,

  // Utility
  getDistinctStatuses,
  readMetadata,
  updateMetadata,

  getDbPath: () => currentDbPath
};
