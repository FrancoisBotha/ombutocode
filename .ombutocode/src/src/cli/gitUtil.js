'use strict';

/**
 * Tiny synchronous git wrapper for the CLI commands. Never throws — callers
 * look at `code` so a missing git binary reads as a failed check, not a crash.
 */

const { spawnSync } = require('child_process');

function runGit(cwd, args, { input = null } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    input,
    encoding: 'utf-8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  return {
    code: typeof result.status === 'number' ? result.status : -1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || result.error?.message || '')
  };
}

/** `git status --porcelain -- <file>` is empty ⇒ the file is committed and clean. */
function isFileCommitted(cwd, relativeFile) {
  const result = runGit(cwd, ['status', '--porcelain', '--', relativeFile]);
  return result.code === 0 && result.stdout.trim() === '';
}

/** Commit one path with the given message. Returns { ok, sha, output }. */
function commitFile(cwd, relativeFile, message) {
  const add = runGit(cwd, ['add', '--', relativeFile]);
  if (add.code !== 0) return { ok: false, sha: null, output: add.stderr || add.stdout };
  const commit = runGit(cwd, ['commit', '-m', message, '--', relativeFile]);
  if (commit.code !== 0) return { ok: false, sha: null, output: commit.stderr || commit.stdout };
  const head = runGit(cwd, ['rev-parse', 'HEAD']);
  return { ok: true, sha: head.stdout.trim() || null, output: commit.stdout };
}

/** True when `sha` is reachable from HEAD of the repo at `cwd`. */
function isAncestorOfHead(cwd, sha) {
  if (!sha) return false;
  return runGit(cwd, ['merge-base', '--is-ancestor', sha, 'HEAD']).code === 0;
}

function branchExists(cwd, branch) {
  return runGit(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).code === 0;
}

/** Sha of the newest commit on HEAD whose subject contains `[<ticketId>]`, or null. */
function findSquashCommitForTicket(cwd, ticketId) {
  const result = runGit(cwd, ['log', '-1', '--fixed-strings', `--grep=[${ticketId}]`, '--format=%H', 'HEAD']);
  const sha = result.stdout.trim();
  return result.code === 0 && sha ? sha : null;
}

function headSha(cwd) {
  const result = runGit(cwd, ['rev-parse', 'HEAD']);
  return result.code === 0 ? result.stdout.trim() : null;
}

module.exports = {
  runGit,
  isFileCommitted,
  commitFile,
  isAncestorOfHead,
  branchExists,
  findSquashCommitForTicket,
  headSha
};
