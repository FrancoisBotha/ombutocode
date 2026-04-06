const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const archiveDb = require('./archiveDb');
const requestsDb = require('./requestsDb');
const logsDb = require('./logsDb');
const backlogDb = require('./backlogDb');

let db = null;
let SQL = null;
let currentDbPath = null;
let lastLoadedMtime = null;

// No default path — callers must provide an explicit path

/**
 * Open (or create) the unified ombutocode.db and initialize both module schemas.
 * @param {string|null} dbPath - Optional path override for the database file
 * @returns {Object} The sql.js Database instance
 */
async function open(dbPath) {
  const targetPath = dbPath;
  if (!targetPath) {
    throw new Error('ombutocodeDb: no database path provided');
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

  currentDbPath = targetPath;
  let isNew = false;

  // Load existing database or create new
  if (fs.existsSync(currentDbPath)) {
    const buffer = fs.readFileSync(currentDbPath);
    db = new SQL.Database(buffer);
    lastLoadedMtime = fs.statSync(currentDbPath).mtimeMs;
  } else {
    db = new SQL.Database();
    isNew = true;
  }

  // Initialize all module schemas on the shared instance
  await archiveDb.open(db);
  await requestsDb.open(db);
  await logsDb.open(db);
  await backlogDb.open(db);

  // Insert db:version metadata if not present
  db.run("INSERT OR IGNORE INTO metadata (key, value) VALUES ('db:version', '1')");

  // Persist to disk if newly created
  if (isNew) {
    saveDb();
  }

  return db;
}

/**
 * Save the shared database to disk.
 */
function saveDb() {
  if (!db || !currentDbPath) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(currentDbPath, buffer);
    lastLoadedMtime = fs.statSync(currentDbPath).mtimeMs;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Close the shared database, saving first.
 */
function close() {
  if (db) {
    archiveDb.close();
    requestsDb.close();
    logsDb.close();
    backlogDb.close();
    saveDb();
    db.close();
    db = null;
    currentDbPath = null;
  }
}

/**
 * Migrate data from standalone archive.db and requests.db into the unified database.
 * Renames source files to .migrated after successful import.
 * Safe to call multiple times — skips files that don't exist.
 */
async function migrateFromStandalone(archiveDbPath, requestsDbPath) {
  if (!db || !SQL) throw new Error('Unified database not open');
  let migratedArchive = 0;
  let migratedRequests = 0;

  // Migrate archive tickets
  if (archiveDbPath && fs.existsSync(archiveDbPath)) {
    const buf = fs.readFileSync(archiveDbPath);
    const srcDb = new SQL.Database(buf);
    try {
      const ticketRows = srcDb.exec('SELECT * FROM tickets');
      if (ticketRows.length > 0) {
        const { columns, values } = ticketRows[0];
        const colList = columns.join(', ');
        const placeholders = columns.map(() => '?').join(', ');
        for (const row of values) {
          db.run(`INSERT OR REPLACE INTO tickets (${colList}) VALUES (${placeholders})`, row);
          migratedArchive++;
        }
      }
      // Copy metadata (version, updated_at)
      const metaRows = srcDb.exec('SELECT key, value FROM metadata');
      if (metaRows.length > 0) {
        for (const row of metaRows[0].values) {
          const [key, value] = row;
          // Skip if already prefixed — standalone keys have no prefix
          if (!key.startsWith('archive:')) {
            archiveDb.updateMetadata(key, value);
          }
        }
      }
    } finally {
      srcDb.close();
    }
    fs.renameSync(archiveDbPath, archiveDbPath + '.migrated');
    console.log(`[Database] Migrated ${migratedArchive} archive tickets`);
  }

  // Migrate requests
  if (requestsDbPath && fs.existsSync(requestsDbPath)) {
    const buf = fs.readFileSync(requestsDbPath);
    const srcDb = new SQL.Database(buf);
    try {
      const reqRows = srcDb.exec('SELECT * FROM requests');
      if (reqRows.length > 0) {
        const { columns, values } = reqRows[0];
        const colList = columns.join(', ');
        const placeholders = columns.map(() => '?').join(', ');
        for (const row of values) {
          db.run(`INSERT OR REPLACE INTO requests (${colList}) VALUES (${placeholders})`, row);
          migratedRequests++;
        }
      }
      // Copy metadata (last_request_id, version)
      const metaRows = srcDb.exec('SELECT key, value FROM metadata');
      if (metaRows.length > 0) {
        for (const row of metaRows[0].values) {
          const [key, value] = row;
          if (!key.startsWith('requests:')) {
            requestsDb.updateMetadata(key, value);
          }
        }
      }
    } finally {
      srcDb.close();
    }
    fs.renameSync(requestsDbPath, requestsDbPath + '.migrated');
    console.log(`[Database] Migrated ${migratedRequests} requests`);
  }

  saveDb();
  return { migratedArchive, migratedRequests };
}

/**
 * Reload the database from disk if the file has been modified externally.
 * Uses file mtime to skip unnecessary reloads.
 * @returns {boolean} true if the database was reloaded, false if skipped
 */
function reloadFromDisk() {
  if (!currentDbPath || !SQL) return false;

  // Check mtime — skip reload if file hasn't changed
  try {
    const stat = fs.statSync(currentDbPath);
    if (lastLoadedMtime && stat.mtimeMs <= lastLoadedMtime) {
      return false;
    }
  } catch {
    return false;
  }

  const buffer = fs.readFileSync(currentDbPath);
  const newDb = new SQL.Database(buffer);

  // Close old instance without saving — disk is source of truth
  if (db) db.close();

  db = newDb;
  archiveDb.open(db);
  requestsDb.open(db);
  logsDb.open(db);
  backlogDb.open(db);

  lastLoadedMtime = fs.statSync(currentDbPath).mtimeMs;
  return true;
}

/**
 * Get the shared database instance.
 * @returns {Object|null} The sql.js Database instance or null if not open
 */
function getDb() {
  return db;
}

module.exports = {
  open,
  close,
  saveDb,
  getDb,
  reloadFromDisk,
  migrateFromStandalone,
  getDbPath: () => currentDbPath
};
