'use strict';

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

let db = null;
let SQL = null;
let currentDbPath = null;
let isSharedDb = false;
let metadataPrefix = '';

// Batched save tracking
let pendingWrites = 0;
let saveTimer = null;
const SAVE_INTERVAL_MS = 5000;
const SAVE_THRESHOLD = 10;

/**
 * Initialize the SQL.js module and load or create the database.
 * Accepts either a file path (string) or a sql.js Database instance.
 * When a Database instance is passed, the module operates in shared-db mode:
 *   - metadataPrefix is set to 'logs:'
 *   - saveDb() becomes a no-op (caller owns persistence)
 *   - close() nulls out the reference without calling db.close()
 */
async function initDb(dbPathOrInstance) {
  if (dbPathOrInstance && typeof dbPathOrInstance === 'object' && typeof dbPathOrInstance.run === 'function') {
    db = dbPathOrInstance;
    isSharedDb = true;
    metadataPrefix = 'logs:';
    currentDbPath = null;
    initializeSchema();
    return db;
  }

  const targetPath = dbPathOrInstance || currentDbPath;
  if (!targetPath) {
    throw new Error('logsDb: no database path provided and no current database open');
  }

  if (db && SQL && currentDbPath === targetPath) {
    return db;
  }

  if (db && currentDbPath !== targetPath) {
    close();
  }

  if (!SQL) {
    SQL = await initSqlJs();
  }

  isSharedDb = false;
  metadataPrefix = '';
  currentDbPath = targetPath;

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
 * Initialize database schema for scheduler logs.
 */
function initializeSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS metadata (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS scheduler_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   TEXT NOT NULL,
      event_type  TEXT NOT NULL,
      severity    TEXT NOT NULL DEFAULT 'info',
      ticket_id   TEXT DEFAULT NULL,
      run_id      TEXT DEFAULT NULL,
      agent_name  TEXT DEFAULT NULL,
      message     TEXT NOT NULL DEFAULT '',
      details     TEXT DEFAULT NULL
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON scheduler_logs(timestamp)');
  db.run('CREATE INDEX IF NOT EXISTS idx_logs_event_type ON scheduler_logs(event_type)');
  db.run('CREATE INDEX IF NOT EXISTS idx_logs_ticket_id ON scheduler_logs(ticket_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_logs_severity ON scheduler_logs(severity)');

  const today = new Date().toISOString().split('T')[0];
  db.run(`INSERT OR IGNORE INTO metadata (key, value) VALUES ('${metadataPrefix}version', '1')`);
  db.run(`INSERT OR IGNORE INTO metadata (key, value) VALUES ('${metadataPrefix}updated_at', '${today}')`);
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
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Schedule a batched save. Saves are throttled to every SAVE_INTERVAL_MS or
 * when SAVE_THRESHOLD pending writes accumulate.
 */
function scheduleSave() {
  if (isSharedDb) return;
  pendingWrites += 1;

  if (pendingWrites >= SAVE_THRESHOLD) {
    flushSave();
    return;
  }

  if (!saveTimer) {
    saveTimer = setTimeout(() => {
      flushSave();
    }, SAVE_INTERVAL_MS);
  }
}

function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  pendingWrites = 0;
  saveDb();
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
  flushSave();
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
 * Insert a scheduler log entry.
 * @param {Object} entry
 * @param {string} entry.timestamp - ISO timestamp
 * @param {string} entry.event_type - Event type constant
 * @param {string} [entry.severity='info'] - debug/info/warn/error
 * @param {string|null} [entry.ticket_id]
 * @param {string|null} [entry.run_id]
 * @param {string|null} [entry.agent_name]
 * @param {string} [entry.message='']
 * @param {Object|string|null} [entry.details]
 * @returns {number} The inserted row id
 */
function insertLog(entry) {
  if (!db) throw new Error('Database not initialized');

  const {
    timestamp,
    event_type,
    severity = 'info',
    ticket_id = null,
    run_id = null,
    agent_name = null,
    message = '',
    details = null
  } = entry;

  const detailsStr = details !== null && details !== undefined
    ? (typeof details === 'string' ? details : JSON.stringify(details))
    : null;

  const stmt = db.prepare(`
    INSERT INTO scheduler_logs (
      timestamp, event_type, severity, ticket_id, run_id, agent_name, message, details
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.bind([
    timestamp,
    event_type,
    severity,
    ticket_id,
    run_id,
    agent_name,
    message,
    detailsStr
  ]);

  stmt.step();
  stmt.free();

  scheduleSave();

  // Get the last inserted id
  const idStmt = db.prepare('SELECT last_insert_rowid() as id');
  let id = 0;
  if (idStmt.step()) {
    id = idStmt.getAsObject().id;
  }
  idStmt.free();

  return id;
}

/**
 * Read logs with pagination and optional filters.
 * @param {Object} options
 * @param {number} [options.limit=200]
 * @param {number} [options.offset=0]
 * @param {string} [options.event_type]
 * @param {string} [options.severity]
 * @param {string} [options.ticket_id]
 * @returns {{ logs: Array, total: number }}
 */
function readLogs(options = {}) {
  if (!db) throw new Error('Database not initialized');

  const limit = options.limit || 200;
  const offset = options.offset || 0;

  let whereClauses = [];
  let params = [];

  if (options.event_type) {
    whereClauses.push('event_type = ?');
    params.push(options.event_type);
  }

  if (options.severity) {
    whereClauses.push('severity = ?');
    params.push(options.severity);
  }

  if (options.ticket_id) {
    whereClauses.push('ticket_id = ?');
    params.push(options.ticket_id);
  }

  const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

  // Get total count
  const countSql = `SELECT COUNT(*) as total FROM scheduler_logs ${whereStr}`;
  const countStmt = db.prepare(countSql);
  if (params.length > 0) countStmt.bind(params);
  let total = 0;
  if (countStmt.step()) {
    total = countStmt.getAsObject().total;
  }
  countStmt.free();

  // Get paginated results
  const dataSql = `SELECT * FROM scheduler_logs ${whereStr} ORDER BY id DESC LIMIT ? OFFSET ?`;
  const dataParams = [...params, limit, offset];
  const dataStmt = db.prepare(dataSql);
  dataStmt.bind(dataParams);

  const logs = [];
  while (dataStmt.step()) {
    logs.push(dataStmt.getAsObject());
  }
  dataStmt.free();

  return { logs, total };
}

/**
 * Search logs by text query across message, ticket_id, event_type, and agent_name.
 * @param {Object} options
 * @param {string} options.query
 * @param {string} [options.event_type]
 * @param {string} [options.severity]
 * @param {string} [options.ticket_id]
 * @param {number} [options.limit=200]
 * @param {number} [options.offset=0]
 * @returns {{ logs: Array, total: number }}
 */
function searchLogs(options = {}) {
  if (!db) throw new Error('Database not initialized');

  const query = options.query || '';
  const limit = options.limit || 200;
  const offset = options.offset || 0;

  let whereClauses = [];
  let params = [];

  if (query) {
    const searchTerm = `%${query}%`;
    whereClauses.push('(message LIKE ? OR ticket_id LIKE ? OR event_type LIKE ? OR agent_name LIKE ? OR details LIKE ?)');
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (options.event_type) {
    whereClauses.push('event_type = ?');
    params.push(options.event_type);
  }

  if (options.severity) {
    whereClauses.push('severity = ?');
    params.push(options.severity);
  }

  if (options.ticket_id) {
    whereClauses.push('ticket_id = ?');
    params.push(options.ticket_id);
  }

  const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

  // Get total count
  const countSql = `SELECT COUNT(*) as total FROM scheduler_logs ${whereStr}`;
  const countStmt = db.prepare(countSql);
  if (params.length > 0) countStmt.bind(params);
  let total = 0;
  if (countStmt.step()) {
    total = countStmt.getAsObject().total;
  }
  countStmt.free();

  // Get paginated results
  const dataSql = `SELECT * FROM scheduler_logs ${whereStr} ORDER BY id DESC LIMIT ? OFFSET ?`;
  const dataParams = [...params, limit, offset];
  const dataStmt = db.prepare(dataSql);
  dataStmt.bind(dataParams);

  const logs = [];
  while (dataStmt.step()) {
    logs.push(dataStmt.getAsObject());
  }
  dataStmt.free();

  return { logs, total };
}

/**
 * Get distinct event type values from all logs.
 * @returns {string[]}
 */
function getDistinctEventTypes() {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare("SELECT DISTINCT event_type FROM scheduler_logs ORDER BY event_type");
  const types = [];

  while (stmt.step()) {
    const row = stmt.getAsObject();
    types.push(row.event_type);
  }

  stmt.free();
  return types;
}

/**
 * Get distinct ticket_id values from all logs.
 * @returns {string[]}
 */
function getDistinctTicketIds() {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare("SELECT DISTINCT ticket_id FROM scheduler_logs WHERE ticket_id IS NOT NULL AND ticket_id != '' ORDER BY ticket_id");
  const ids = [];

  while (stmt.step()) {
    const row = stmt.getAsObject();
    ids.push(row.ticket_id);
  }

  stmt.free();
  return ids;
}

module.exports = {
  open,
  close,
  saveDb,
  flushSave,
  initializeSchema,
  insertLog,
  readLogs,
  searchLogs,
  getDistinctEventTypes,
  getDistinctTicketIds,
  getDbPath: () => currentDbPath
};
