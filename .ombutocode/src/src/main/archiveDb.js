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
 *   - metadataPrefix is set to 'archive:'
 *   - saveDb() becomes a no-op (caller owns persistence)
 *   - close() nulls out the reference without calling db.close()
 */
async function initDb(dbPathOrInstance) {
  // Detect if argument is a sql.js Database instance (has .run method and is an object)
  if (dbPathOrInstance && typeof dbPathOrInstance === 'object' && typeof dbPathOrInstance.run === 'function') {
    // Shared db mode
    db = dbPathOrInstance;
    isSharedDb = true;
    metadataPrefix = 'archive:';
    currentDbPath = null;
    initializeSchema();
    return db;
  }

  // Standalone mode (string path or null) — original behavior
  const targetPath = dbPathOrInstance || currentDbPath;
  if (!targetPath) {
    throw new Error('archiveDb: no database path provided and no current database open');
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

  // Create tickets table
  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id                  TEXT PRIMARY KEY,
      title               TEXT NOT NULL DEFAULT '',
      epic_ref         TEXT DEFAULT '',
      status              TEXT NOT NULL DEFAULT 'archive',
      last_updated        TEXT DEFAULT '',
      dependencies        TEXT DEFAULT '[]',
      acceptance_criteria TEXT DEFAULT '[]',
      files_touched       TEXT DEFAULT '[]',
      notes               TEXT DEFAULT '',
      assignee            TEXT DEFAULT NULL,
      agent               TEXT DEFAULT NULL
    )
  `);

  // Migrate feature_ref → epic_ref if old column exists
  try {
    const cols = db.exec("PRAGMA table_info(tickets)");
    if (cols.length && cols[0].values.some(row => row[1] === 'feature_ref')) {
      db.run(`ALTER TABLE tickets RENAME COLUMN feature_ref TO epic_ref`);
      console.log('[ArchiveDb] Migrated feature_ref → epic_ref');
    }
  } catch (_) { /* column already renamed or doesn't exist */ }

  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_tickets_epic_ref ON tickets(epic_ref)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tickets_last_updated ON tickets(last_updated)`);

  // Initialize metadata with defaults (use prefixed keys)
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
 * Serialize a value to JSON for storage
 */
function serializeJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Parse a JSON value from storage
 */
function parseJson(value, defaultValue = null) {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return defaultValue;
  }
}

/**
 * Deserialize a ticket row from database, parsing JSON fields
 */
function deserializeTicket(row) {
  const parseJsonField = (field) => {
    if (!field) return null;
    try {
      return JSON.parse(field);
    } catch (e) {
      // If not valid JSON, return as string
      return field;
    }
  };

  return {
    ...row,
    dependencies: row.dependencies ? JSON.parse(row.dependencies) : [],
    acceptance_criteria: row.acceptance_criteria ? JSON.parse(row.acceptance_criteria) : [],
    files_touched: row.files_touched ? JSON.parse(row.files_touched) : [],
    agent: parseJsonField(row.agent),
    assignee: parseJsonField(row.assignee)
  };
}

// Alias for tests
function rowToTicket(row) {
  return deserializeTicket(row);
}

/**
 * Insert a ticket into the archive
 */
function insertTicket(ticket) {
  if (!db) throw new Error('Database not initialized');

  const {
    id,
    title = '',
    epic_ref = '',
    status = 'archive',
    last_updated = new Date().toISOString(),
    dependencies = [],
    acceptance_criteria = [],
    files_touched = [],
    notes = '',
    assignee = null,
    agent = null
  } = ticket;

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tickets (
      id, title, epic_ref, status, last_updated,
      dependencies, acceptance_criteria, files_touched,
      notes, assignee, agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.bind([
    id,
    title,
    epic_ref,
    status,
    last_updated,
    JSON.stringify(dependencies),
    JSON.stringify(acceptance_criteria),
    JSON.stringify(files_touched),
    notes,
    assignee ? JSON.stringify(assignee) : null,
    agent ? JSON.stringify(agent) : null
  ]);

  stmt.step();
  stmt.free();

  saveDb();

  return {
    id,
    title,
    epic_ref,
    status,
    last_updated,
    dependencies,
    acceptance_criteria,
    files_touched,
    notes,
    assignee,
    agent
  };
}

/**
 * Read all archived tickets
 */
function readAllTickets() {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT * FROM tickets ORDER BY last_updated DESC');
  const tickets = [];

  while (stmt.step()) {
    const row = stmt.getAsObject();
    tickets.push(deserializeTicket(row));
  }

  stmt.free();
  return tickets;
}

/**
 * Read all tickets with pagination support
 * @param {Object} options - { limit?: number, offset?: number }
 * @returns {Object} { tickets: [], total: number }
 */
function getAllTicketsWithPagination(options = {}) {
  if (!db) throw new Error('Database not initialized');

  const limit = options.limit || 100;
  const offset = options.offset || 0;

  // Get total count
  const countStmt = db.prepare('SELECT COUNT(*) as total FROM tickets');
  let total = 0;
  if (countStmt.step()) {
    total = countStmt.getAsObject().total;
  }
  countStmt.free();

  // Get paginated results
  const stmt = db.prepare('SELECT * FROM tickets ORDER BY last_updated DESC LIMIT ? OFFSET ?');
  stmt.bind([limit, offset]);

  const tickets = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    tickets.push(deserializeTicket(row));
  }

  stmt.free();
  return { tickets, total };
}

/**
 * Get all archived tickets with pagination support
 */
function getAllTickets(paginationOrLimit = {}) {
  if (!db) throw new Error('Database not initialized');

  let limit = 100;
  let offset = 0;

  // Handle both object parameter and legacy limit parameter
  if (typeof paginationOrLimit === 'object' && paginationOrLimit !== null) {
    limit = paginationOrLimit.limit || 100;
    offset = paginationOrLimit.offset || 0;
  } else if (typeof paginationOrLimit === 'number') {
    limit = paginationOrLimit;
  }

  // Get total count
  const countStmt = db.prepare('SELECT COUNT(*) as total FROM tickets');
  let total = 0;
  if (countStmt.step()) {
    total = countStmt.getAsObject().total;
  }
  countStmt.free();

  // Get paginated results
  const stmt = db.prepare('SELECT * FROM tickets ORDER BY last_updated DESC LIMIT ? OFFSET ?');
  stmt.bind([limit, offset]);

  const tickets = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    tickets.push(deserializeTicket(row));
  }

  stmt.free();
  return { tickets, total };
}

/**
 * Read a single ticket by ID
 */
function readTicketById(id) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT * FROM tickets WHERE id = ?');
  stmt.bind([id]);

  let ticket = null;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    ticket = deserializeTicket(row);
  }

  stmt.free();
  return ticket;
}

/**
 * Update a ticket's fields
 */
function updateTicket(id, updates) {
  if (!db) throw new Error('Database not initialized');

  const ticket = readTicketById(id);
  if (!ticket) return null;

  const allowedFields = ['title', 'epic_ref', 'status', 'last_updated', 'dependencies', 'acceptance_criteria', 'files_touched', 'notes', 'assignee', 'agent'];
  const setClauses = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = ?`);
      if (['dependencies', 'acceptance_criteria', 'files_touched', 'assignee', 'agent'].includes(key)) {
        values.push(value ? JSON.stringify(value) : null);
      } else {
        values.push(value);
      }
    }
  }

  if (setClauses.length === 0) return ticket;

  values.push(id);
  const sql = `UPDATE tickets SET ${setClauses.join(', ')} WHERE id = ?`;

  const stmt = db.prepare(sql);
  stmt.bind(values);
  stmt.step();
  stmt.free();

  saveDb();
  return readTicketById(id);
}

/**
 * Delete a ticket by ID
 */
function deleteTicket(id) {
  if (!db) throw new Error('Database not initialized');

  // Check if ticket exists
  const ticket = readTicketById(id);
  if (!ticket) return false;

  const stmt = db.prepare('DELETE FROM tickets WHERE id = ?');
  stmt.bind([id]);
  stmt.step();
  stmt.free();

  saveDb();
  return true;
}

/**
 * Search tickets by query and/or epic_ref
 * Accepts either an object { query, epicRef, limit, offset } or individual parameters
 */
function searchTickets(queryOrParams = '', epicRef = '', limit = 100, offset = 0) {
  if (!db) throw new Error('Database not initialized');

  // Handle both object and individual parameter calls
  let query = '';
  if (typeof queryOrParams === 'object' && queryOrParams !== null) {
    query = queryOrParams.query || '';
    epicRef = queryOrParams.epicRef || '';
    limit = queryOrParams.limit || 100;
    offset = queryOrParams.offset || 0;
  } else {
    query = queryOrParams || '';
  }

  let sql = 'SELECT * FROM tickets WHERE 1=1';
  const params = [];

  if (query) {
    const searchTerm = `%${query}%`;
    sql += ' AND (id LIKE ? OR title LIKE ? OR notes LIKE ?)';
    params.push(searchTerm, searchTerm, searchTerm);
  }

  if (epicRef) {
    sql += ' AND epic_ref = ?';
    params.push(epicRef);
  }

  // Get total count
  const countStmt = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as total'));
  countStmt.bind(params);
  let total = 0;
  if (countStmt.step()) {
    total = countStmt.getAsObject().total;
  }
  countStmt.free();

  // Get paginated results
  sql += ' ORDER BY last_updated DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const stmt = db.prepare(sql);
  stmt.bind(params);

  const tickets = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    tickets.push(deserializeTicket(row));
  }

  stmt.free();
  return { tickets, total };
}

/**
 * Update metadata (uses namespaced keys in shared-db mode)
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

/**
 * Read metadata (uses namespaced keys in shared-db mode)
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
 * Get all metadata as an object.
 * In shared-db mode, returns only keys with the 'archive:' prefix (prefix stripped from keys).
 * In standalone mode, returns all keys as-is.
 */
function readAllMetadata() {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT key, value FROM metadata');
  const metadata = {};

  while (stmt.step()) {
    const row = stmt.getAsObject();
    if (metadataPrefix) {
      // In shared mode, only include keys with our prefix, and strip the prefix
      if (row.key.startsWith(metadataPrefix)) {
        metadata[row.key.slice(metadataPrefix.length)] = row.value;
      }
    } else {
      metadata[row.key] = row.value;
    }
  }

  stmt.free();
  return metadata;
}

/**
 * Get metadata with proper type conversion (version as number)
 */
function getMetadataFormatted() {
  const raw = readAllMetadata();
  return {
    version: parseInt(raw.version, 10) || 1,
    updated_at: raw.updated_at || ''
  };
}

/**
 * Migrate YAML archive to SQLite
 * Returns { success, count, error }
 */
async function migrateFromYaml(yamlPath) {
  // Check if YAML file exists
  if (!fs.existsSync(yamlPath)) {
    const error = `YAML file not found at ${yamlPath}`;
    console.error(`[archive-db] ${error}`);
    return { success: false, count: 0, error };
  }

  try {
    // Read YAML
    const yaml = require('js-yaml');
    const fileContent = fs.readFileSync(yamlPath, 'utf8');
    const data = yaml.load(fileContent);

    if (!data || !data.tickets) {
      console.log('[archive-db] No tickets in archive.yml');
      return { success: true, count: 0 };
    }

    // Ensure database is initialized (will use existing connection if already open)
    if (!db) {
      await open();
    }

    let count = 0;
    for (const ticket of data.tickets) {
      try {
        insertTicket(ticket);
        count++;
      } catch (err) {
        console.error(`[archive-db] Error migrating ticket ${ticket.id}:`, err.message);
      }
    }

    // Update metadata
    if (data.version) {
      updateMetadata('version', String(data.version));
    }
    if (data.updated_at) {
      updateMetadata('updated_at', data.updated_at);
    }

    saveDb();

    console.log(`[archive-db] Successfully migrated ${count} tickets from archive.yml`);

    // Rename the YAML file as a backup
    const backupPath = `${yamlPath}.migrated`;
    fs.renameSync(yamlPath, backupPath);
    console.log(`[archive-db] Original file backed up to ${backupPath}`);

    return { success: true, count };
  } catch (err) {
    console.error('[archive-db] Migration failed:', err.message);
    return { success: false, count: 0, error: err.message };
  }
}

/**
 * Check if migration from YAML is needed.
 * Migration is needed if archive.yml exists but archive.db does not.
 * @param {string} yamlPath - Path to archive.yml file
 * @param {string} dbPath - Path to archive.db file
 * @returns {boolean} True if migration is needed
 */
function isMigrationNeeded(yamlPath, dbPath) {
  return fs.existsSync(yamlPath) && !fs.existsSync(dbPath);
}

/**
 * Get distinct epic_ref values from all tickets.
 * @returns {string[]} Array of unique epic_ref values
 */
function getDistinctEpicRefs() {
  if (!db) throw new Error('Database not initialized. Call open() first.');

  const stmt = db.prepare("SELECT DISTINCT epic_ref FROM tickets WHERE epic_ref != '' ORDER BY epic_ref");
  const epicRefs = [];

  while (stmt.step()) {
    const row = stmt.getAsObject();
    epicRefs.push(row.epic_ref);
  }

  stmt.free();
  return epicRefs;
}

/**
 * Get the highest numeric suffix for ticket IDs matching a given prefix (e.g. 'AD_HOC-').
 * Returns 0 if no matching tickets exist.
 * @param {string} prefix - The ticket ID prefix to match (e.g. 'AD_HOC-')
 * @returns {number} The highest numeric suffix found, or 0
 */
function getMaxTicketNumericId(prefix = 'AD_HOC-') {
  if (!db) return 0;
  try {
    const stmt = db.prepare("SELECT id FROM tickets WHERE id LIKE ? || '%'");
    stmt.bind([prefix]);
    let max = 0;
    const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      const match = String(row.id || '').match(pattern);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
    stmt.free();
    return max;
  } catch {
    return 0;
  }
}

/**
 * Get all archive data in YAML-compatible format.
 * @returns {Object} Archive data with version, updated_at, and tickets
 */
function getArchiveData() {
  const metadata = readAllMetadata();
  const tickets = readAllTickets();

  return {
    version: parseInt(metadata.version, 10) || 1,
    updated_at: metadata.updated_at || '',
    tickets
  };
}

module.exports = {
  // Core database operations
  open,
  openDatabase: open,  // Alias for compatibility
  close,
  closeDatabase: close,  // Alias for compatibility
  initializeSchema,

  // CRUD operations
  insertTicket,
  readAllTickets,
  getAllTickets: getAllTicketsWithPagination,  // Returns paginated results with total
  readTicketById,
  getTicket: readTicketById,  // Alias for compatibility
  updateTicket,
  deleteTicket,
  searchTickets,

  // Metadata operations
  updateMetadata,
  readMetadata,
  getMetadata: getMetadataFormatted,  // Returns formatted metadata with version as number
  readAllMetadata,

  // Migration
  migrateFromYaml,
  isMigrationNeeded,

  // Data export
  getDistinctEpicRefs,
  getArchiveData,

  // ID helpers
  getMaxTicketNumericId,

  // Utilities
  saveDb,
  saveDatabase: saveDb,  // Alias for compatibility
  serializeJson,
  parseJson,
  rowToTicket,
  getDbPath: () => currentDbPath
};
