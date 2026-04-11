#!/usr/bin/env node
/**
 * Ombuto Code Ticket Write Tool
 *
 * A Node.js CLI tool for inserting tickets into the ombutocode backlog database.
 * Companion to the read-only db-query.js tool — this one handles mutations.
 *
 * Usage:
 *   node .ombutocode/tools/ticket-write.js insert <file.json> [--dry-run] [--no-backup] [--force]
 *
 * The input JSON file must contain an array of ticket objects. Each ticket must
 * have at minimum: id, title, status, epic_ref. Every other field becomes part
 * of the JSON blob stored in backlog_tickets.data (the id is stripped before
 * storage since it lives in its own column).
 *
 * Behavior:
 *   1. Validates ticket shape (required fields present, id format sane)
 *   2. Checks for id collisions with existing tickets (blocks unless --force)
 *   3. Backs up the database to ombutocode.db.before-insert-<timestamp>
 *      (skip with --no-backup; backup is not auto-deleted — caller removes it
 *      after verification)
 *   4. Appends new tickets after MAX(sort_order)
 *   5. Bumps metadata key 'backlog:updated_at' to today's date
 *   6. Persists the database with fs.writeFileSync
 *   7. Prints a summary of inserted ticket ids
 *
 * Examples:
 *   node .ombutocode/tools/ticket-write.js insert /tmp/jobs-tickets.json
 *   node .ombutocode/tools/ticket-write.js insert /tmp/jobs-tickets.json --dry-run
 *
 * Input file shape:
 *   [
 *     {
 *       "id": "JOBS-001",
 *       "title": "Implement Job Manager main-process module",
 *       "status": "backlog",
 *       "assignee": null,
 *       "epic_ref": "docs/Epics/epic_BACKUP_JOB_MANAGEMENT.md",
 *       "acceptance_criteria": ["[ ] ..."],
 *       "dependencies": [],
 *       "references": { "prd": "...", "architecture": "..." },
 *       "notes": "...",
 *       "last_updated": "2026-04-11"
 *     }
 *   ]
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Resolve paths relative to project root
const SCRIPT_DIR = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const OMBUTOCODE_DIR = path.join(PROJECT_ROOT, '.ombutocode');
const DB_PATH = path.join(OMBUTOCODE_DIR, 'data', 'ombutocode.db');
const SQL_JS_PATH = path.join(OMBUTOCODE_DIR, 'src', 'node_modules', 'sql.js');

const REQUIRED_FIELDS = ['id', 'title', 'status', 'epic_ref'];
const VALID_STATUSES = new Set(['backlog', 'todo', 'in_progress', 'eval', 'review', 'done', 'blocked']);

async function loadDb() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Error: Database not found at ${DB_PATH}`);
    process.exit(1);
  }
  const initSqlJs = require(SQL_JS_PATH);
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(DB_PATH);
  return { db: new SQL.Database(buffer), SQL };
}

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function timestampTag() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function validateTicket(ticket, index) {
  const errors = [];
  if (!ticket || typeof ticket !== 'object' || Array.isArray(ticket)) {
    return [`ticket[${index}] is not an object`];
  }
  for (const field of REQUIRED_FIELDS) {
    if (ticket[field] === undefined || ticket[field] === null || ticket[field] === '') {
      errors.push(`ticket[${index}] (id=${ticket.id ?? '?'}) missing required field '${field}'`);
    }
  }
  if (ticket.id && !/^[A-Z][A-Z0-9]*-\d+$/.test(ticket.id)) {
    errors.push(`ticket[${index}] id '${ticket.id}' does not match PREFIX-NNN format`);
  }
  if (ticket.status && !VALID_STATUSES.has(ticket.status)) {
    errors.push(`ticket[${index}] (id=${ticket.id}) status '${ticket.status}' is not a known value`);
  }
  if (ticket.dependencies !== undefined && !Array.isArray(ticket.dependencies)) {
    errors.push(`ticket[${index}] (id=${ticket.id}) dependencies must be an array`);
  }
  if (ticket.acceptance_criteria !== undefined && !Array.isArray(ticket.acceptance_criteria)) {
    errors.push(`ticket[${index}] (id=${ticket.id}) acceptance_criteria must be an array`);
  }
  return errors;
}

function getExistingIds(db) {
  const ids = new Set();
  const stmt = db.prepare('SELECT id FROM backlog_tickets');
  while (stmt.step()) {
    ids.add(stmt.getAsObject().id);
  }
  stmt.free();
  return ids;
}

function getMaxSortOrder(db) {
  const stmt = db.prepare('SELECT MAX(sort_order) as max_order FROM backlog_tickets');
  let max = -1;
  if (stmt.step()) {
    const val = stmt.getAsObject().max_order;
    if (val !== null && val !== undefined) max = val;
  }
  stmt.free();
  return max;
}

function insertTicketRow(db, ticket, sortOrder) {
  // Strip id from JSON blob — it lives in its own column
  const { id, ...rest } = ticket;
  const dataJson = JSON.stringify(rest);
  const stmt = db.prepare('INSERT OR REPLACE INTO backlog_tickets (id, sort_order, data) VALUES (?, ?, ?)');
  stmt.bind([id, sortOrder, dataJson]);
  stmt.step();
  stmt.free();
}

function updateMetadata(db, key, value) {
  const stmt = db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)');
  stmt.bind([key, value]);
  stmt.step();
  stmt.free();
}

async function cmdInsert(args) {
  const filePath = args.find(a => !a.startsWith('--'));
  if (!filePath) {
    console.error('Usage: insert <file.json> [--dry-run] [--no-backup] [--force]');
    process.exit(1);
  }
  const dryRun = args.includes('--dry-run');
  const noBackup = args.includes('--no-backup');
  const force = args.includes('--force');

  const absFilePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absFilePath)) {
    console.error(`Error: Input file not found: ${absFilePath}`);
    process.exit(1);
  }

  let tickets;
  try {
    const raw = fs.readFileSync(absFilePath, 'utf-8');
    tickets = JSON.parse(raw);
  } catch (e) {
    console.error(`Error: Failed to parse JSON from ${absFilePath}: ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(tickets)) {
    console.error('Error: Input file must contain a JSON array of ticket objects');
    process.exit(1);
  }
  if (tickets.length === 0) {
    console.error('Error: Input file contains an empty array');
    process.exit(1);
  }

  // Validate all tickets up front
  const validationErrors = [];
  for (let i = 0; i < tickets.length; i++) {
    validationErrors.push(...validateTicket(tickets[i], i));
  }
  if (validationErrors.length > 0) {
    console.error('Validation failed:');
    for (const err of validationErrors) console.error(`  - ${err}`);
    process.exit(1);
  }

  // Check for duplicate ids within the batch
  const batchIds = new Set();
  for (const t of tickets) {
    if (batchIds.has(t.id)) {
      console.error(`Error: Duplicate ticket id '${t.id}' within input file`);
      process.exit(1);
    }
    batchIds.add(t.id);
  }

  const { db } = await loadDb();

  // Check for collisions with existing ids
  const existingIds = getExistingIds(db);
  const collisions = tickets.filter(t => existingIds.has(t.id)).map(t => t.id);
  if (collisions.length > 0 && !force) {
    console.error(`Error: The following ticket ids already exist in the backlog: ${collisions.join(', ')}`);
    console.error('Use --force to overwrite (INSERT OR REPLACE).');
    db.close();
    process.exit(1);
  }

  const startSortOrder = getMaxSortOrder(db) + 1;

  console.log(`Input file : ${absFilePath}`);
  console.log(`Tickets    : ${tickets.length}`);
  console.log(`Start order: ${startSortOrder}`);
  if (collisions.length > 0) {
    console.log(`Overwriting: ${collisions.join(', ')}`);
  }
  console.log('');
  console.log('Planned inserts:');
  for (let i = 0; i < tickets.length; i++) {
    console.log(`  ${String(startSortOrder + i).padStart(4)}  ${tickets[i].id.padEnd(14)} ${tickets[i].title}`);
  }
  console.log('');

  if (dryRun) {
    console.log('--dry-run specified — no changes written.');
    db.close();
    return;
  }

  // Back up DB before writing
  let backupPath = null;
  if (!noBackup) {
    backupPath = `${DB_PATH}.before-insert-${timestampTag()}`;
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`Backup     : ${backupPath}`);
  }

  // Insert each ticket in a single transaction
  try {
    db.run('BEGIN TRANSACTION');
    for (let i = 0; i < tickets.length; i++) {
      insertTicketRow(db, tickets[i], startSortOrder + i);
    }
    updateMetadata(db, 'backlog:updated_at', todayIso());
    db.run('COMMIT');
  } catch (e) {
    try { db.run('ROLLBACK'); } catch { /* ignore */ }
    console.error(`Insert failed: ${e.message}`);
    if (backupPath) {
      console.error(`Database unchanged — original preserved. Backup at ${backupPath}`);
    }
    db.close();
    process.exit(1);
  }

  // Persist to disk
  const buffer = Buffer.from(db.export());
  fs.writeFileSync(DB_PATH, buffer);
  db.close();

  console.log('');
  console.log(`Inserted ${tickets.length} ticket(s):`);
  for (const t of tickets) console.log(`  + ${t.id}  ${t.title}`);
  console.log('');
  console.log('Verify with:');
  console.log('  node .ombutocode/tools/db-query.js tickets --status backlog');
  if (backupPath) {
    console.log('');
    console.log(`Backup retained at ${backupPath}`);
    console.log('Remove it once you have verified the inserts.');
  }
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`Ombuto Code Ticket Write Tool

Commands:
  insert <file.json>           Insert tickets from a JSON array file

Flags (for insert):
  --dry-run        Validate and preview inserts without writing
  --no-backup      Skip creating a pre-insert database backup
  --force          Overwrite existing ticket ids (INSERT OR REPLACE)

The input file must be a JSON array of ticket objects. Required fields:
  id, title, status, epic_ref
Other common fields: assignee, acceptance_criteria, dependencies,
references, notes, description, last_updated.

Example:
  node .ombutocode/tools/ticket-write.js insert /tmp/jobs-tickets.json
  node .ombutocode/tools/ticket-write.js insert /tmp/jobs-tickets.json --dry-run
`);
    return;
  }

  switch (command) {
    case 'insert':
      await cmdInsert(args.slice(1));
      break;
    default:
      console.error(`Unknown command: ${command}\nRun with --help for usage.`);
      process.exit(1);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
