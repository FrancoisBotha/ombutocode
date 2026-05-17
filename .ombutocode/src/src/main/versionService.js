'use strict';

const path = require('path');
const simpleGit = require('simple-git');
const planCore = require('./planCoreUtilities');

// PROJECT_ROOT and DOCS_DIR are exposed as getters on planCoreUtilities and
// stay null until planCore.init(projectRoot) runs. Destructuring them at
// require time captured the pre-init nulls — read them lazily instead, and
// build the simple-git client on first use so it sees the initialised root.
let git = null;
function getGit() {
  if (!git) git = simpleGit(planCore.PROJECT_ROOT);
  return git;
}

/**
 * Get the git log for a file under docs/.
 * @param {string} relativePath - path relative to docs/
 * @param {number} [count=30] - maximum number of log entries to return
 * @returns {Promise<Array<{ hash: string, date: string, message: string, author: string }>>}
 *   Results sorted newest first.
 */
async function getFileLog(relativePath, count = 30) {
  const docsDir = planCore.DOCS_DIR;
  const projectRoot = planCore.PROJECT_ROOT;
  if (!docsDir || !projectRoot) {
    throw new Error('versionService used before planCoreUtilities.init() ran');
  }
  const fullPath = path.resolve(docsDir, relativePath);
  if (!fullPath.startsWith(docsDir)) {
    throw new Error('Path is outside docs/ directory');
  }

  // Build path relative to PROJECT_ROOT for git
  const gitRelPath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');

  const log = await getGit().log({
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
  const docsDir = planCore.DOCS_DIR;
  const projectRoot = planCore.PROJECT_ROOT;
  if (!docsDir || !projectRoot) {
    throw new Error('versionService used before planCoreUtilities.init() ran');
  }
  const fullPath = path.resolve(docsDir, relativePath);
  if (!fullPath.startsWith(docsDir)) {
    throw new Error('Path is outside docs/ directory');
  }

  const gitRelPath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');

  try {
    const content = await getGit().show([`${hash}:${gitRelPath}`]);
    return content;
  } catch (err) {
    return null;
  }
}

module.exports = { getFileLog, getFileAtCommit };
