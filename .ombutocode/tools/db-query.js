#!/usr/bin/env node
/**
 * Ombuto Code Database Query Tool
 *
 * A Node.js CLI tool for querying the ombutocode SQLite database.
 * No Python or sqlite3 binary required — uses the bundled sql.js package.
 *
 * Usage:
 *   node .ombutocode/tools/db-query.js <command> [options]
 *
 * Commands:
 *   tables                        List all tables
 *   schema <table>                Show CREATE TABLE statement
 *   query <sql>                   Run arbitrary SELECT query
 *   tickets [--status <s>]        List backlog tickets (optionally filtered by status)
 *   ticket <id>                   Show single ticket details
 *   epics                         List all epics from docs/Epics/
 *   stats                         Show ticket count by status
 *
 * Examples:
 *   node .ombutocode/tools/db-query.js tables
 *   node .ombutocode/tools/db-query.js schema backlog_tickets
 *   node .ombutocode/tools/db-query.js query "SELECT id, json_extract(data, '$.title') as title FROM backlog_tickets LIMIT 10"
 *   node .ombutocode/tools/db-query.js tickets
 *   node .ombutocode/tools/db-query.js tickets --status todo
 *   node .ombutocode/tools/db-query.js ticket SCAFF-001
 *   node .ombutocode/tools/db-query.js stats
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

async function loadDb() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Error: Database not found at ${DB_PATH}`);
    process.exit(1);
  }
  const initSqlJs = require(SQL_JS_PATH);
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(DB_PATH);
  return new SQL.Database(buffer);
}

function printTable(columns, rows) {
  if (rows.length === 0) {
    console.log('(no results)');
    return;
  }
  // Calculate column widths
  const widths = columns.map((col, i) => {
    const values = rows.map(r => String(r[i] ?? '').length);
    return Math.min(60, Math.max(col.length, ...values));
  });
  // Header
  const header = columns.map((col, i) => col.padEnd(widths[i])).join(' | ');
  const separator = widths.map(w => '-'.repeat(w)).join('-+-');
  console.log(header);
  console.log(separator);
  // Rows
  for (const row of rows) {
    const line = row.map((val, i) => {
      const s = String(val ?? '');
      return s.length > widths[i] ? s.substring(0, widths[i] - 1) + '…' : s.padEnd(widths[i]);
    }).join(' | ');
    console.log(line);
  }
  console.log(`\n(${rows.length} row${rows.length !== 1 ? 's' : ''})`);
}

function printJson(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

// ── Commands ──

async function cmdTables(db) {
  const result = db.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name");
  if (result.length === 0) { console.log('No tables found'); return; }
  printTable(['Name', 'Type'], result[0].values);
}

async function cmdSchema(db, tableName) {
  if (!tableName) { console.error('Usage: schema <table_name>'); process.exit(1); }
  const result = db.exec(`SELECT sql FROM sqlite_master WHERE name = '${tableName.replace(/'/g, "''")}'`);
  if (result.length === 0 || result[0].values.length === 0) {
    console.error(`Table '${tableName}' not found`);
    process.exit(1);
  }
  console.log(result[0].values[0][0]);
}

async function cmdQuery(db, sql) {
  if (!sql) { console.error('Usage: query "<SQL>"'); process.exit(1); }
  if (!/^\s*SELECT/i.test(sql)) {
    console.error('Error: Only SELECT queries are allowed (read-only tool)');
    process.exit(1);
  }
  try {
    const result = db.exec(sql);
    if (result.length === 0) { console.log('(no results)'); return; }
    printTable(result[0].columns, result[0].values);
  } catch (e) {
    console.error('Query error:', e.message);
    process.exit(1);
  }
}

async function cmdTickets(db, statusFilter) {
  let sql = `
    SELECT
      id,
      json_extract(data, '$.title') as title,
      json_extract(data, '$.status') as status,
      json_extract(data, '$.assignee') as assignee,
      json_extract(data, '$.epic_ref') as epic_ref
    FROM backlog_tickets
  `;
  if (statusFilter) {
    sql += ` WHERE json_extract(data, '$.status') = '${statusFilter.replace(/'/g, "''")}'`;
  }
  sql += ' ORDER BY sort_order ASC';
  try {
    const result = db.exec(sql);
    if (result.length === 0) { console.log('No tickets found'); return; }
    printTable(result[0].columns, result[0].values);
  } catch (e) {
    console.error('Query error:', e.message);
  }
}

async function cmdTicket(db, ticketId) {
  if (!ticketId) { console.error('Usage: ticket <id>'); process.exit(1); }
  const sql = `SELECT id, data FROM backlog_tickets WHERE id = '${ticketId.replace(/'/g, "''")}'`;
  try {
    const result = db.exec(sql);
    if (result.length === 0 || result[0].values.length === 0) {
      console.error(`Ticket '${ticketId}' not found`);
      process.exit(1);
    }
    const data = JSON.parse(result[0].values[0][1]);
    printJson({ id: result[0].values[0][0], ...data });
  } catch (e) {
    console.error('Query error:', e.message);
  }
}

async function cmdEpics() {
  const epicsDir = path.join(PROJECT_ROOT, 'docs', 'Epics');
  if (!fs.existsSync(epicsDir)) { console.log('No docs/Epics/ directory found'); return; }
  const files = fs.readdirSync(epicsDir).filter(f => f.endsWith('.md')).sort();
  const rows = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(epicsDir, file), 'utf-8');
    const titleMatch = content.match(/^#\s+(.+)/m);
    const statusMatch = content.match(/status:\*?\*?\s*(.*)/i);
    const title = titleMatch ? titleMatch[1].trim() : file;
    const status = statusMatch ? statusMatch[1].replace(/\*\*/g, '').trim() : '—';
    rows.push([file, title, status]);
  }
  printTable(['File', 'Title', 'Status'], rows);
}

async function cmdStats(db) {
  const sql = `
    SELECT
      json_extract(data, '$.status') as status,
      COUNT(*) as count
    FROM backlog_tickets
    GROUP BY json_extract(data, '$.status')
    ORDER BY count DESC
  `;
  try {
    const result = db.exec(sql);
    if (result.length === 0) { console.log('No tickets in backlog'); return; }
    printTable(result[0].columns, result[0].values);
  } catch (e) {
    console.error('Query error:', e.message);
  }
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`Ombuto Code Database Query Tool

Commands:
  tables                        List all tables in the database
  schema <table>                Show CREATE TABLE statement for a table
  query "<sql>"                 Run a read-only SELECT query
  tickets [--status <status>]   List backlog tickets (optionally filter by status)
  ticket <id>                   Show full details of a single ticket
  epics                         List all epics from docs/Epics/ with their status
  stats                         Show ticket counts grouped by status

Examples:
  node .ombutocode/tools/db-query.js tables
  node .ombutocode/tools/db-query.js tickets --status todo
  node .ombutocode/tools/db-query.js ticket AUTH-001
  node .ombutocode/tools/db-query.js query "SELECT id, json_extract(data, '$.title') FROM backlog_tickets LIMIT 5"
`);
    return;
  }

  if (command === 'epics') {
    await cmdEpics();
    return;
  }

  const db = await loadDb();

  switch (command) {
    case 'tables': await cmdTables(db); break;
    case 'schema': await cmdSchema(db, args[1]); break;
    case 'query': await cmdQuery(db, args[1]); break;
    case 'tickets': {
      const statusIdx = args.indexOf('--status');
      await cmdTickets(db, statusIdx >= 0 ? args[statusIdx + 1] : null);
      break;
    }
    case 'ticket': await cmdTicket(db, args[1]); break;
    case 'stats': await cmdStats(db); break;
    default:
      console.error(`Unknown command: ${command}\nRun with --help for usage.`);
      process.exit(1);
  }

  db.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
