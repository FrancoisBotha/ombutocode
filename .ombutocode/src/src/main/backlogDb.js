'use strict';

const fs = require('fs');

let db = null;
let isSharedDb = false;
let metadataPrefix = '';
let ticketFileManager = null;

// Active statuses where ticket data lives in files, not DB
const ACTIVE_STATUSES = new Set(['in_progress', 'test', 'eval', 'merging']);

/**
 * Inject the ticketFileManager module for file overlay support.
 * @param {Object} tfm - The ticketFileManager module
 */
function setTicketFileManager(tfm) {
  ticketFileManager = tfm || null;
}

/**
 * Initialize the backlog schema on a sql.js Database instance (shared-db mode).
 * Detects old 15-column schema and migrates to new 3-column JSON schema.
 *
 * @param {Object} dbInstance - A sql.js Database instance (shared-db mode)
 */
async function open(dbInstance) {
  if (dbInstance && typeof dbInstance === 'object' && typeof dbInstance.run === 'function') {
    db = dbInstance;
    isSharedDb = true;
    metadataPrefix = 'backlog:';
    initializeSchema();
    return db;
  }
  throw new Error('backlogDb: only shared-db mode is supported — pass a sql.js Database instance');
}

/**
 * Close database connection.
 * In shared-db mode, nulls out the module reference without closing the db.
 */
function close() {
  if (db) {
    db = null;
    isSharedDb = false;
    metadataPrefix = '';
  }
}

/**
 * Detect if the old 15-column schema exists by checking for a 'title' column.
 * @returns {boolean}
 */
function isOldSchema() {
  try {
    const result = db.exec("PRAGMA table_info(backlog_tickets)");
    if (!result.length) return false;
    const columns = result[0].values.map(row => row[1]);
    return columns.includes('title');
  } catch {
    return false;
  }
}

/**
 * Migrate from old 15-column schema to new 3-column JSON schema.
 */
function migrateOldSchema() {
  console.log('[backlog-db] Migrating from 15-column schema to JSON-in-SQLite...');

  // Read all rows from old schema
  const rows = [];
  const stmt = db.prepare('SELECT * FROM backlog_tickets ORDER BY sort_order ASC');
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();

  // Build new rows as JSON blobs
  const migrated = rows.map((row, index) => {
    const { sort_order, ...fields } = row;

    // Parse JSON fields from old schema
    const JSON_FIELDS_OLD = ['dependencies', 'acceptance_criteria', 'files_touched', 'assignee', 'agent', 'eval_summary'];
    const data = { ...fields };
    for (const key of JSON_FIELDS_OLD) {
      if (data[key] !== null && data[key] !== undefined && typeof data[key] === 'string') {
        try { data[key] = JSON.parse(data[key]); } catch { /* keep as string */ }
      }
    }

    return {
      id: row.id,
      sort_order: sort_order !== undefined ? sort_order : index,
      data
    };
  });

  // Drop old table and create new
  db.run('DROP TABLE IF EXISTS backlog_tickets');
  db.run(`
    CREATE TABLE IF NOT EXISTS backlog_tickets (
      id         TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0,
      data       TEXT NOT NULL DEFAULT '{}'
    )
  `);

  // Re-create indexes on JSON-extracted fields for performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_backlog_status ON backlog_tickets(json_extract(data, '$.status'))`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_backlog_sort_order ON backlog_tickets(sort_order)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_backlog_epic_ref ON backlog_tickets(json_extract(data, '$.epic_ref'))`);

  // Insert migrated rows
  for (const row of migrated) {
    const ins = db.prepare('INSERT INTO backlog_tickets (id, sort_order, data) VALUES (?, ?, ?)');
    ins.bind([row.id, row.sort_order, JSON.stringify(row.data)]);
    ins.step();
    ins.free();
  }

  // Bump metadata version
  updateMetadata('version', '2');

  console.log(`[backlog-db] Migrated ${migrated.length} tickets to JSON schema`);
}

/**
 * Initialize backlog schema — table, indexes, default metadata.
 * If old schema detected, runs migration first.
 */
function initializeSchema() {
  // Check if table exists at all
  const tableExists = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='backlog_tickets'");

  if (tableExists.length > 0 && isOldSchema()) {
    migrateOldSchema();
    return;
  }

  // Create new schema if table doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS backlog_tickets (
      id         TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0,
      data       TEXT NOT NULL DEFAULT '{}'
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_backlog_status ON backlog_tickets(json_extract(data, '$.status'))`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_backlog_sort_order ON backlog_tickets(sort_order)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_backlog_epic_ref ON backlog_tickets(json_extract(data, '$.epic_ref'))`);

  // Initialize metadata with defaults (prefixed keys)
  const today = new Date().toISOString().split('T')[0];
  db.run(`INSERT OR IGNORE INTO metadata (key, value) VALUES ('${metadataPrefix}version', '1')`);
  db.run(`INSERT OR IGNORE INTO metadata (key, value) VALUES ('${metadataPrefix}updated_at', '${today}')`);
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Deserialize a row from the new 3-column schema into a ticket object.
 * @param {Object} row - { id, sort_order, data }
 * @returns {Object} Ticket object with all fields
 */
function deserializeTicket(row) {
  let data;
  if (typeof row.data === 'string') {
    try { data = JSON.parse(row.data); } catch { data = {}; }
  } else {
    data = row.data || {};
  }

  // Ensure id is always set from the row
  data.id = row.id;

  // Ensure numeric fields default correctly
  if (typeof data.fail_count !== 'number') data.fail_count = 0;
  if (typeof data.eval_fail_count !== 'number') data.eval_fail_count = 0;

  // Ensure array fields default correctly
  if (!Array.isArray(data.dependencies)) data.dependencies = [];
  if (!Array.isArray(data.acceptance_criteria)) data.acceptance_criteria = [];
  if (!Array.isArray(data.files_touched)) data.files_touched = [];

  // Ensure string defaults
  if (data.title === undefined) data.title = '';
  if (data.epic_ref === undefined) data.epic_ref = '';
  if (data.status === undefined) data.status = 'backlog';
  if (data.last_updated === undefined) data.last_updated = '';
  if (data.notes === undefined) data.notes = '';
  if (data.description === undefined) data.description = '';

  // Ensure nullable fields
  if (data.assignee === undefined) data.assignee = null;
  if (data.agent === undefined) data.agent = null;
  if (data.eval_summary === undefined) data.eval_summary = null;

  return data;
}

/**
 * Serialize a ticket object for storage in the data column.
 * @param {Object} ticket - Ticket object
 * @returns {string} JSON string
 */
function serializeTicketData(ticket) {
  // Remove id — it's stored in its own column
  const { id, ...rest } = ticket;
  return JSON.stringify(rest);
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

function updateMetadata(key, value) {
  if (!db) throw new Error('backlogDb: not initialized');
  const prefixedKey = `${metadataPrefix}${key}`;
  const stmt = db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)');
  stmt.bind([prefixedKey, value]);
  stmt.step();
  stmt.free();
}

function readMetadata(key) {
  if (!db) throw new Error('backlogDb: not initialized');
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

// ---------------------------------------------------------------------------
// Core CRUD
// ---------------------------------------------------------------------------

/**
 * Read all backlog data:
 *   { version, updated_at, tickets: [...] }
 * Tickets are ordered by sort_order ASC.
 * Active ticket files are merged on top of DB data.
 */
function readBacklogData() {
  if (!db) throw new Error('backlogDb: not initialized');

  const version = parseInt(readMetadata('version'), 10) || 1;
  const updated_at = readMetadata('updated_at') || '';

  const stmt = db.prepare('SELECT id, sort_order, data FROM backlog_tickets ORDER BY sort_order ASC');
  const tickets = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    tickets.push(deserializeTicket(row));
  }
  stmt.free();

  // Merge active ticket file overlays
  if (ticketFileManager) {
    const activeIds = ticketFileManager.listTicketFiles();
    if (activeIds.length > 0) {
      const activeSet = new Set(activeIds);
      for (let i = 0; i < tickets.length; i++) {
        if (activeSet.has(tickets[i].id)) {
          const fileData = ticketFileManager.readTicketFile(tickets[i].id);
          if (fileData) {
            tickets[i] = { ...tickets[i], ...fileData, id: tickets[i].id };
          }
        }
      }
    }
  }

  return { version, updated_at, tickets };
}

/**
 * Write full backlog data (drop-in replacement for YAML write).
 * Accepts { version, updated_at, tickets: [...] }.
 * Upserts all tickets with sort_order derived from array index.
 * Tickets not in the new array are deleted.
 */
function writeBacklogData(data) {
  if (!db) throw new Error('backlogDb: not initialized');

  const tickets = Array.isArray(data.tickets) ? data.tickets : [];
  const updatedAt = data.updated_at || new Date().toISOString().split('T')[0];

  // Update metadata
  if (data.version !== undefined) {
    updateMetadata('version', String(data.version));
  }
  updateMetadata('updated_at', updatedAt);

  // Collect IDs that should exist after the write
  const newIds = new Set(tickets.map(t => t.id));

  // Delete tickets not in the new set
  const existingStmt = db.prepare('SELECT id FROM backlog_tickets');
  const existingIds = [];
  while (existingStmt.step()) {
    existingIds.push(existingStmt.getAsObject().id);
  }
  existingStmt.free();

  for (const id of existingIds) {
    if (!newIds.has(id)) {
      const delStmt = db.prepare('DELETE FROM backlog_tickets WHERE id = ?');
      delStmt.bind([id]);
      delStmt.step();
      delStmt.free();
    }
  }

  // Upsert each ticket
  for (let i = 0; i < tickets.length; i++) {
    upsertTicketRow(tickets[i], i);
  }
}

/**
 * Internal: upsert a single ticket row in the new 3-column schema.
 */
function upsertTicketRow(ticket, sortOrder) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO backlog_tickets (id, sort_order, data)
    VALUES (?, ?, ?)
  `);

  stmt.bind([
    ticket.id,
    sortOrder,
    serializeTicketData(ticket)
  ]);

  stmt.step();
  stmt.free();
}

/**
 * Get a single ticket by ID.
 * Checks active ticket file first, falls back to DB.
 * Returns deserialized ticket or null.
 */
function getTicketById(id) {
  if (!db) throw new Error('backlogDb: not initialized');

  // Check ticket file first
  if (ticketFileManager) {
    const fileData = ticketFileManager.readTicketFile(id);
    if (fileData) {
      // Merge with DB record to preserve sort_order context, but file wins on data
      const stmt = db.prepare('SELECT id, sort_order, data FROM backlog_tickets WHERE id = ?');
      stmt.bind([id]);
      let dbTicket = null;
      if (stmt.step()) {
        dbTicket = deserializeTicket(stmt.getAsObject());
      }
      stmt.free();
      // File data takes precedence, but ensure id is set
      return { ...(dbTicket || {}), ...fileData, id };
    }
  }

  const stmt = db.prepare('SELECT id, sort_order, data FROM backlog_tickets WHERE id = ?');
  stmt.bind([id]);

  let ticket = null;
  if (stmt.step()) {
    ticket = deserializeTicket(stmt.getAsObject());
  }
  stmt.free();
  return ticket;
}

/**
 * Update specific fields of a single ticket — the key race-condition fix.
 *
 * For active statuses (in_progress, test, eval, merging), writes go to ticket file.
 * For other statuses, writes go to DB. On transition to review, flushes file to DB.
 *
 * @param {string} id - Ticket ID
 * @param {Object} updates - Object with fields to update
 * @returns {Object|null} Updated ticket or null if not found
 */
function updateTicketFields(id, updates) {
  if (!db) throw new Error('backlogDb: not initialized');

  // Get current ticket (checks file first, then DB)
  const existing = getTicketById(id);
  if (!existing) return null;

  // Merge updates into existing ticket
  const merged = { ...existing };
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'id') continue; // never change id
    merged[key] = value;
  }

  const newStatus = merged.status;

  // Route writes based on status
  if (ticketFileManager && ACTIVE_STATUSES.has(newStatus)) {
    // Write to ticket file (create if doesn't exist)
    ticketFileManager.writeTicketFile(id, merged);
  } else if (ticketFileManager && newStatus === 'review') {
    // Flush: upsert to DB and delete ticket file
    upsertToDb(id, merged);
    ticketFileManager.deleteTicketFile(id);
  } else {
    // Non-active status — write directly to DB
    upsertToDb(id, merged);
    // Also clean up any orphaned ticket file
    if (ticketFileManager) {
      ticketFileManager.deleteTicketFile(id);
    }
  }

  // Update metadata timestamp
  updateMetadata('updated_at', new Date().toISOString().split('T')[0]);

  return getTicketById(id);
}

/**
 * Internal: upsert a ticket to DB, preserving its sort_order.
 */
function upsertToDb(id, ticket) {
  // Get existing sort_order
  let sortOrder = 0;
  const soStmt = db.prepare('SELECT sort_order FROM backlog_tickets WHERE id = ?');
  soStmt.bind([id]);
  if (soStmt.step()) {
    sortOrder = soStmt.getAsObject().sort_order;
  }
  soStmt.free();

  upsertTicketRow(ticket, sortOrder);
}

/**
 * Insert a new ticket, optionally at a specific position.
 * If position is null/undefined, appends to end.
 */
function insertTicket(ticket, position) {
  if (!db) throw new Error('backlogDb: not initialized');

  // Determine sort_order
  let sortOrder;
  if (position !== null && position !== undefined) {
    // Shift subsequent tickets down
    db.run('UPDATE backlog_tickets SET sort_order = sort_order + 1 WHERE sort_order >= ?', [position]);
    sortOrder = position;
  } else {
    // Append to end
    const maxStmt = db.prepare('SELECT MAX(sort_order) as max_order FROM backlog_tickets');
    let maxOrder = -1;
    if (maxStmt.step()) {
      const val = maxStmt.getAsObject().max_order;
      maxOrder = val !== null ? val : -1;
    }
    maxStmt.free();
    sortOrder = maxOrder + 1;
  }

  upsertTicketRow(ticket, sortOrder);
  updateMetadata('updated_at', new Date().toISOString().split('T')[0]);

  return getTicketById(ticket.id);
}

/**
 * Get all tickets linked to a specific epic_ref.
 * Uses the idx_backlog_epic_ref index for performance.
 * Merges active ticket file overlays (same pattern as readBacklogData).
 * @param {string} epicRef - The epic_ref value to match
 * @returns {Object[]} Array of deserialized ticket objects
 */
function getTicketsByEpicRef(epicRef) {
  if (!db) throw new Error('backlogDb: not initialized');
  if (!epicRef) return [];

  const stmt = db.prepare(
    "SELECT id, sort_order, data FROM backlog_tickets WHERE json_extract(data, '$.epic_ref') = ? ORDER BY sort_order ASC"
  );
  stmt.bind([epicRef]);

  const tickets = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    tickets.push(deserializeTicket(row));
  }
  stmt.free();

  // Merge active ticket file overlays
  if (ticketFileManager) {
    const activeIds = ticketFileManager.listTicketFiles();
    if (activeIds.length > 0) {
      const activeSet = new Set(activeIds);
      for (let i = 0; i < tickets.length; i++) {
        if (activeSet.has(tickets[i].id)) {
          const fileData = ticketFileManager.readTicketFile(tickets[i].id);
          if (fileData) {
            tickets[i] = { ...tickets[i], ...fileData, id: tickets[i].id };
          }
        }
      }
    }
  }

  return tickets;
}

/**
 * Delete a ticket by ID.
 * Also deletes any active ticket file.
 * @returns {boolean} true if deleted, false if not found
 */
function deleteTicket(id) {
  if (!db) throw new Error('backlogDb: not initialized');

  const existing = getTicketById(id);
  if (!existing) return false;

  const stmt = db.prepare('DELETE FROM backlog_tickets WHERE id = ?');
  stmt.bind([id]);
  stmt.step();
  stmt.free();

  // Clean up ticket file if exists
  if (ticketFileManager) {
    ticketFileManager.deleteTicketFile(id);
  }

  updateMetadata('updated_at', new Date().toISOString().split('T')[0]);
  return true;
}

/**
 * Reorder tickets by assigning sort_order from array position.
 * @param {string[]} orderedIds - Array of ticket IDs in desired order
 */
function reorderTickets(orderedIds) {
  if (!db) throw new Error('backlogDb: not initialized');

  for (let i = 0; i < orderedIds.length; i++) {
    const stmt = db.prepare('UPDATE backlog_tickets SET sort_order = ? WHERE id = ?');
    stmt.bind([i, orderedIds[i]]);
    stmt.step();
    stmt.free();
  }

  updateMetadata('updated_at', new Date().toISOString().split('T')[0]);
}

// ---------------------------------------------------------------------------
// Crash Recovery
// ---------------------------------------------------------------------------

/**
 * Recover orphaned ticket files by syncing them back to DB.
 * Called on startup to handle tickets left in active state after a crash.
 * @returns {{ recovered: string[] }}
 */
function recoverOrphanedTicketFiles() {
  if (!ticketFileManager) return { recovered: [] };

  const activeIds = ticketFileManager.listTicketFiles();
  const recovered = [];

  for (const ticketId of activeIds) {
    try {
      const fileData = ticketFileManager.readTicketFile(ticketId);
      if (!fileData) continue;

      // Upsert file data back to DB
      upsertToDb(ticketId, { ...fileData, id: ticketId });

      // Delete the ticket file
      ticketFileManager.deleteTicketFile(ticketId);
      recovered.push(ticketId);

      console.log(`[backlog-db] Recovered orphaned ticket file: ${ticketId}`);
    } catch (err) {
      console.error(`[backlog-db] Failed to recover ticket file ${ticketId}:`, err.message);
    }
  }

  if (recovered.length > 0) {
    console.log(`[backlog-db] Recovered ${recovered.length} orphaned ticket file(s)`);
  }

  return { recovered };
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

/**
 * Check if migration from YAML is needed.
 * Migration is needed if YAML file exists and the backlog_tickets table is empty.
 */
function isMigrationNeeded(yamlPath) {
  if (!fs.existsSync(yamlPath)) return false;
  if (!db) return false;

  const stmt = db.prepare('SELECT COUNT(*) as cnt FROM backlog_tickets');
  let count = 0;
  if (stmt.step()) {
    count = stmt.getAsObject().cnt;
  }
  stmt.free();
  return count === 0;
}

/**
 * Migrate tickets from backlog.yml into the SQLite table.
 * Renames the YAML file to .migrated on success.
 *
 * @param {string} yamlPath - Path to backlog.yml
 * @returns {{ success: boolean, count: number, error?: string }}
 */
function migrateFromYaml(yamlPath) {
  if (!fs.existsSync(yamlPath)) {
    return { success: false, count: 0, error: `YAML file not found at ${yamlPath}` };
  }
  if (!db) {
    return { success: false, count: 0, error: 'backlogDb: not initialized' };
  }

  try {
    const yaml = require('js-yaml');
    const content = fs.readFileSync(yamlPath, 'utf-8');
    const data = yaml.load(content);

    if (!data || !Array.isArray(data.tickets)) {
      console.log('[backlog-db] No tickets in backlog.yml');
      // Still rename to mark migration as done
      fs.renameSync(yamlPath, `${yamlPath}.migrated`);
      return { success: true, count: 0 };
    }

    let count = 0;
    for (let i = 0; i < data.tickets.length; i++) {
      try {
        upsertTicketRow(data.tickets[i], i);
        count++;
      } catch (err) {
        console.error(`[backlog-db] Error migrating ticket ${data.tickets[i]?.id}:`, err.message);
      }
    }

    // Migrate metadata
    if (data.version) {
      updateMetadata('version', String(data.version));
    }
    if (data.updated_at) {
      updateMetadata('updated_at', data.updated_at);
    }

    console.log(`[backlog-db] Successfully migrated ${count} tickets from backlog.yml`);

    // Rename YAML as backup
    fs.renameSync(yamlPath, `${yamlPath}.migrated`);
    console.log(`[backlog-db] Original file backed up to ${yamlPath}.migrated`);

    return { success: true, count };
  } catch (err) {
    console.error('[backlog-db] Migration failed:', err.message);
    return { success: false, count: 0, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  open,
  close,
  initializeSchema,

  // CRUD
  readBacklogData,
  writeBacklogData,
  getTicketById,
  getTicketsByEpicRef,
  updateTicketFields,
  insertTicket,
  deleteTicket,
  reorderTickets,

  // Migration
  isMigrationNeeded,
  migrateFromYaml,

  // Crash recovery
  recoverOrphanedTicketFiles,

  // Ticket file manager injection
  setTicketFileManager,

  // Metadata
  updateMetadata,
  readMetadata,

  // For tests
  deserializeTicket,

  // Constants
  ACTIVE_STATUSES
};
