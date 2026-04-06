'use strict';

const fs = require('fs');
const path = require('path');

let ticketsDir = null;

/**
 * Set the tickets directory path.
 * @param {string} dir - Absolute path to .ombutocode/data/tickets/
 */
function setTicketsDir(dir) {
  ticketsDir = dir;
}

/**
 * Get the tickets directory path.
 * @returns {string|null}
 */
function getTicketsDir() {
  return ticketsDir;
}

/**
 * Ensure the tickets directory exists.
 */
function ensureTicketsDir() {
  if (!ticketsDir) throw new Error('ticketFileManager: ticketsDir not set');
  fs.mkdirSync(ticketsDir, { recursive: true });
}

/**
 * Get the file path for a ticket ID.
 * @param {string} ticketId
 * @returns {string}
 */
function ticketFilePath(ticketId) {
  if (!ticketsDir) throw new Error('ticketFileManager: ticketsDir not set');
  return path.join(ticketsDir, `${ticketId}.json`);
}

/**
 * Read a ticket file. Returns parsed JSON or null if file doesn't exist.
 * @param {string} ticketId
 * @returns {Object|null}
 */
function readTicketFile(ticketId) {
  const filePath = ticketFilePath(ticketId);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Write a ticket file atomically (write to temp + rename).
 * @param {string} ticketId
 * @param {Object} data
 */
function writeTicketFile(ticketId, data) {
  ensureTicketsDir();
  const filePath = ticketFilePath(ticketId);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Delete a ticket file. No-op if file doesn't exist.
 * @param {string} ticketId
 */
function deleteTicketFile(ticketId) {
  const filePath = ticketFilePath(ticketId);
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/**
 * List all ticket IDs that have active ticket files.
 * @returns {string[]}
 */
function listTicketFiles() {
  if (!ticketsDir) return [];
  try {
    const files = fs.readdirSync(ticketsDir);
    return files
      .filter(f => f.endsWith('.json') && !f.endsWith('.tmp'))
      .map(f => f.replace(/\.json$/, ''));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

module.exports = {
  setTicketsDir,
  getTicketsDir,
  ensureTicketsDir,
  readTicketFile,
  writeTicketFile,
  deleteTicketFile,
  listTicketFiles
};
