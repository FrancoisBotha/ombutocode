'use strict';

/**
 * Read-only git access for showing what a merged ticket actually changed.
 *
 * A ticket's branch is deleted by `removeWorktree` immediately after its squash
 * merge, so the merge commit is the only surviving record of the change. Its
 * sha is stored on the ticket at merge time; for tickets that merged before
 * that existed, `findMergeCommitSha` recovers it from the commit message.
 *
 * Everything here is read-only — no checkout, no index writes, nothing that can
 * disturb the working tree the user is looking at.
 */

const path = require('path');
const { spawnSync } = require('child_process');

/** Files larger than this are not diffed inline unless explicitly requested. */
const MAX_INLINE_FILE_BYTES = 1024 * 1024;

/** Squash commits are titled `[TICKET-ID] Title` — see squashMergeTicketBranchSync. */
const COMMIT_SUBJECT_PREFIX = (ticketId) => `[${ticketId}]`;

class GitDiffError extends Error {
  constructor(message, code = 'GIT_DIFF_ERROR', details = {}) {
    super(message);
    this.name = 'GitDiffError';
    this.code = code;
    this.details = details;
  }
}

function runGit({ cwd, args, allowFailure = false, maxBuffer = 64 * 1024 * 1024 }) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    maxBuffer
  });

  if (result.error) {
    throw new GitDiffError(`Failed to run git ${args.join(' ')}: ${result.error.message}`, 'GIT_SPAWN_FAILED');
  }

  const response = {
    code: typeof result.status === 'number' ? result.status : null,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };

  if (allowFailure || response.code === 0) return response;

  throw new GitDiffError(
    `git ${args.join(' ')} failed with code ${response.code}: ${response.stderr.trim()}`,
    'GIT_COMMAND_FAILED',
    { args, code: response.code, stderr: response.stderr }
  );
}

/**
 * Reject anything that is not a plain repo-relative path.
 *
 * `filePath` arrives from the renderer and is handed to git as an argument, so
 * an absolute path or a `..` escape would read files outside the project.
 *
 * @param {string} filePath
 * @returns {string} normalized POSIX-style repo-relative path
 */
function assertSafeRepoPath(filePath) {
  const raw = String(filePath || '').trim();
  if (!raw) throw new GitDiffError('File path is required', 'INVALID_PATH');
  if (path.isAbsolute(raw) || /^[a-zA-Z]:/.test(raw)) {
    throw new GitDiffError('File path must be relative to the repository root', 'INVALID_PATH');
  }

  const normalized = raw.split('\\').join('/');
  const segments = normalized.split('/');
  if (segments.some(segment => segment === '..')) {
    throw new GitDiffError('File path must stay inside the repository', 'INVALID_PATH');
  }
  return normalized;
}

/**
 * True if the object exists in this repository.
 *
 * A stored sha can dangle if main's history was rewritten after the merge.
 *
 * @param {string} projectRoot
 * @param {string} sha
 * @returns {boolean}
 */
function commitExists(projectRoot, sha) {
  if (!sha) return false;
  const result = runGit({
    cwd: projectRoot,
    args: ['cat-file', '-e', `${sha}^{commit}`],
    allowFailure: true
  });
  return result.code === 0;
}

/**
 * Recover a ticket's squash commit by its subject line.
 *
 * Used for tickets that merged before merge_commit_sha was persisted.
 *
 * @param {string} projectRoot
 * @param {string} ticketId
 * @returns {string|null}
 */
function findMergeCommitSha(projectRoot, ticketId) {
  const id = String(ticketId || '').trim();
  if (!id) return null;

  // --fixed-strings keeps bracket characters in the ticket id literal.
  const result = runGit({
    cwd: projectRoot,
    args: [
      'log',
      '--max-count=1',
      '--format=%H',
      '--fixed-strings',
      `--grep=${COMMIT_SUBJECT_PREFIX(id)}`
    ],
    allowFailure: true
  });

  if (result.code !== 0) return null;
  const sha = result.stdout.trim().split('\n')[0] || '';
  return sha || null;
}

/**
 * Resolve the commit to diff for a ticket, preferring the stored sha.
 *
 * @param {{ projectRoot: string, ticket: Object }} params
 * @returns {{ sha: string, recovered: boolean }}
 */
function resolveTicketCommit({ projectRoot, ticket }) {
  const stored = String(ticket?.merge_commit_sha || '').trim();
  if (stored && commitExists(projectRoot, stored)) {
    return { sha: stored, recovered: false };
  }

  const recovered = findMergeCommitSha(projectRoot, ticket?.id);
  if (recovered) return { sha: recovered, recovered: true };

  throw new GitDiffError(
    stored
      ? `The merge commit for ${ticket?.id} no longer exists in this repository.`
      : `No merge commit could be found for ${ticket?.id}.`,
    stored ? 'COMMIT_MISSING' : 'COMMIT_NOT_FOUND',
    { ticketId: ticket?.id, storedSha: stored || null }
  );
}

const STATUS_LABELS = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'typechange'
};

/**
 * Parse `--name-status -z` output into records.
 *
 * NUL separation is what makes paths containing spaces or quotes safe; renames
 * occupy three fields (status, old path, new path) instead of two.
 *
 * @param {string} raw
 * @returns {Array<{ status: string, path: string, oldPath: string|null }>}
 */
function parseNameStatus(raw) {
  const fields = String(raw || '').split('\0').filter(f => f !== '');
  const entries = [];

  for (let i = 0; i < fields.length; i += 1) {
    const code = fields[i];
    if (!/^[A-Z]/.test(code)) continue;

    const letter = code[0];
    if (letter === 'R' || letter === 'C') {
      const oldPath = fields[i + 1];
      const newPath = fields[i + 2];
      if (newPath === undefined) break;
      entries.push({ status: letter, path: newPath, oldPath });
      i += 2;
    } else {
      const filePath = fields[i + 1];
      if (filePath === undefined) break;
      entries.push({ status: letter, path: filePath, oldPath: null });
      i += 1;
    }
  }

  return entries;
}

/**
 * Parse `--numstat -z` output. Binary files report `-` instead of counts.
 *
 * @param {string} raw
 * @returns {Map<string, { additions: number|null, deletions: number|null, binary: boolean }>}
 */
function parseNumstat(raw) {
  const fields = String(raw || '').split('\0').filter(f => f !== '');
  const stats = new Map();

  for (let i = 0; i < fields.length; i += 1) {
    const match = fields[i].match(/^(-|\d+)\t(-|\d+)\t(.*)$/);
    if (!match) continue;

    const [, addRaw, delRaw, pathField] = match;
    const binary = addRaw === '-' || delRaw === '-';
    let filePath = pathField;

    // A rename with -z emits an empty path field followed by old and new paths.
    if (filePath === '') {
      const newPath = fields[i + 2];
      if (newPath === undefined) break;
      filePath = newPath;
      i += 2;
    }

    stats.set(filePath, {
      additions: binary ? null : Number(addRaw),
      deletions: binary ? null : Number(delRaw),
      binary
    });
  }

  return stats;
}

/**
 * List every file a ticket's merge commit touched, with per-file stats.
 *
 * Cheap enough to run on open — it reads no file contents.
 *
 * @param {{ projectRoot: string, ticket: Object }} params
 * @returns {{ sha: string, shortSha: string, recovered: boolean, subject: string, committedAt: string, files: Array, totals: Object }}
 */
function getChangedFiles({ projectRoot, ticket }) {
  const { sha, recovered } = resolveTicketCommit({ projectRoot, ticket });

  const meta = runGit({
    cwd: projectRoot,
    args: ['show', '--no-patch', '--format=%h%x00%s%x00%aI', sha]
  });
  const [shortSha = '', subject = '', committedAt = ''] = meta.stdout.trim().split('\0');

  const nameStatus = runGit({
    cwd: projectRoot,
    args: ['show', '--find-renames', '--name-status', '-z', '--format=', sha]
  });
  const numstat = runGit({
    cwd: projectRoot,
    args: ['show', '--find-renames', '--numstat', '-z', '--format=', sha]
  });

  const stats = parseNumstat(numstat.stdout);
  const files = parseNameStatus(nameStatus.stdout).map((entry) => {
    const stat = stats.get(entry.path) || { additions: 0, deletions: 0, binary: false };
    return {
      path: entry.path,
      oldPath: entry.oldPath,
      status: entry.status,
      statusLabel: STATUS_LABELS[entry.status] || 'changed',
      additions: stat.additions,
      deletions: stat.deletions,
      binary: stat.binary
    };
  });

  const totals = files.reduce((acc, file) => ({
    files: acc.files + 1,
    additions: acc.additions + (file.additions || 0),
    deletions: acc.deletions + (file.deletions || 0)
  }), { files: 0, additions: 0, deletions: 0 });

  return { sha, shortSha, recovered, subject, committedAt, files, totals };
}

/**
 * Read one blob at a commit, or null when the path does not exist there.
 *
 * @returns {{ content: string|null, bytes: number, tooLarge: boolean }}
 */
function readBlob({ projectRoot, sha, filePath, allowLarge }) {
  if (!filePath) return { content: null, bytes: 0, tooLarge: false };

  const spec = `${sha}:${filePath}`;
  const sizeResult = runGit({
    cwd: projectRoot,
    args: ['cat-file', '-s', spec],
    allowFailure: true
  });

  // Non-zero means the path does not exist at this commit — an added file has
  // no "before" side and a deleted file has no "after" side.
  if (sizeResult.code !== 0) return { content: null, bytes: 0, tooLarge: false };

  const bytes = Number(sizeResult.stdout.trim()) || 0;
  if (!allowLarge && bytes > MAX_INLINE_FILE_BYTES) {
    return { content: null, bytes, tooLarge: true };
  }

  const blob = runGit({ cwd: projectRoot, args: ['show', spec] });
  return { content: blob.stdout, bytes, tooLarge: false };
}

/**
 * Fetch the before and after contents of a single file in a ticket's merge.
 *
 * Called lazily per file selection so a large ticket does not stall the view.
 *
 * @param {{ projectRoot: string, ticket: Object, filePath: string, oldPath?: string|null, allowLarge?: boolean }} params
 * @returns {{ path: string, before: string|null, after: string|null, binary: boolean, tooLarge: boolean, bytes: number }}
 */
function getFileDiff({ projectRoot, ticket, filePath, oldPath = null, allowLarge = false }) {
  const safePath = assertSafeRepoPath(filePath);
  const safeOldPath = oldPath ? assertSafeRepoPath(oldPath) : null;
  const { sha } = resolveTicketCommit({ projectRoot, ticket });

  // A root commit has no parent, so everything in it counts as added.
  const hasParent = runGit({
    cwd: projectRoot,
    args: ['rev-parse', '--verify', `${sha}^`],
    allowFailure: true
  }).code === 0;

  const before = hasParent
    ? readBlob({ projectRoot, sha: `${sha}^`, filePath: safeOldPath || safePath, allowLarge })
    : { content: null, bytes: 0, tooLarge: false };
  const after = readBlob({ projectRoot, sha, filePath: safePath, allowLarge });

  const binary = isProbablyBinary(before.content) || isProbablyBinary(after.content);

  return {
    path: safePath,
    oldPath: safeOldPath,
    before: binary ? null : before.content,
    after: binary ? null : after.content,
    binary,
    tooLarge: before.tooLarge || after.tooLarge,
    bytes: Math.max(before.bytes, after.bytes)
  };
}

/**
 * Treat content with NUL bytes as binary — the same heuristic git uses.
 *
 * @param {string|null} content
 * @returns {boolean}
 */
function isProbablyBinary(content) {
  if (typeof content !== 'string' || content === '') return false;
  return content.slice(0, 8000).includes('\0');
}

/**
 * Stamp a completed squash merge onto the ticket.
 *
 * The ticket branch is deleted right after the merge, so without this the
 * change becomes unreachable except by grepping commit subjects.
 *
 * @param {Object} ticket - mutated in place
 * @param {{ commitSha?: string, baseBranch?: string }} mergeResult
 */
function recordMergeCommitOnTicket(ticket, mergeResult) {
  if (!ticket || !mergeResult) return;
  ticket.merge_commit_sha = mergeResult.commitSha || null;
  ticket.merge_base_branch = mergeResult.baseBranch || null;
}

module.exports = {
  GitDiffError,
  recordMergeCommitOnTicket,
  MAX_INLINE_FILE_BYTES,
  assertSafeRepoPath,
  commitExists,
  findMergeCommitSha,
  resolveTicketCommit,
  parseNameStatus,
  parseNumstat,
  isProbablyBinary,
  getChangedFiles,
  getFileDiff
};
