'use strict';

const path = require('path');
const simpleGit = require('simple-git');
const { PROJECT_ROOT, DOCS_DIR } = require('./planCoreUtilities');

const git = simpleGit(PROJECT_ROOT);

/**
 * Get the git log for a file under docs/.
 * @param {string} relativePath - path relative to docs/
 * @param {number} [count=30] - maximum number of log entries to return
 * @returns {Promise<Array<{ hash: string, date: string, message: string, author: string }>>}
 *   Results sorted newest first.
 */
async function getFileLog(relativePath, count = 30) {
  const fullPath = path.resolve(DOCS_DIR, relativePath);
  if (!fullPath.startsWith(DOCS_DIR)) {
    throw new Error('Path is outside docs/ directory');
  }

  // Build path relative to PROJECT_ROOT for git
  const gitRelPath = path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/');

  const log = await git.log({
    file: gitRelPath,
    maxCount: count,
    '--follow': null,
  });

  return log.all.map((entry) => ({
    hash: entry.hash,
    date: entry.date,
    message: entry.message,
    author: entry.author_name,
  }));
}

/**
 * Get the content of a file at a specific commit.
 * @param {string} hash - git commit hash
 * @param {string} relativePath - path relative to docs/
 * @returns {Promise<string|null>} raw Markdown string, or null if not found
 */
async function getFileAtCommit(hash, relativePath) {
  const fullPath = path.resolve(DOCS_DIR, relativePath);
  if (!fullPath.startsWith(DOCS_DIR)) {
    throw new Error('Path is outside docs/ directory');
  }

  const gitRelPath = path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/');

  try {
    const content = await git.show([`${hash}:${gitRelPath}`]);
    return content;
  } catch (err) {
    return null;
  }
}

module.exports = { getFileLog, getFileAtCommit };
