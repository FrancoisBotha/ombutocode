'use strict';

const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

class WorktreeManagerError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'WorktreeManagerError';
    this.details = details;
  }
}

function assertTicketId(ticketId) {
  if (typeof ticketId !== 'string' || ticketId.trim() === '') {
    throw new WorktreeManagerError('ticketId must be a non-empty string');
  }
  return ticketId.trim();
}

function resolveTicketPaths(projectRoot, ticketId) {
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new WorktreeManagerError('projectRoot must be a non-empty string');
  }

  const resolvedProjectRoot = path.resolve(projectRoot.trim());
  const normalizedTicketId = assertTicketId(ticketId);
  const worktreesRoot = path.join(
    path.dirname(resolvedProjectRoot),
    `${path.basename(resolvedProjectRoot)}-worktrees`
  );

  return {
    projectRoot: resolvedProjectRoot,
    ticketId: normalizedTicketId,
    branch: `ticket/${normalizedTicketId}`,
    worktreesRoot,
    worktreePath: path.join(worktreesRoot, normalizedTicketId)
  };
}

function resolveEvalTrialPaths(projectRoot, ticketId) {
  const ticketPaths = resolveTicketPaths(projectRoot, ticketId);
  return {
    ...ticketPaths,
    evalBranch: `eval/${ticketPaths.ticketId}`,
    evalWorktreePath: path.join(ticketPaths.worktreesRoot, `${ticketPaths.ticketId}-eval`)
  };
}

async function runGit({ cwd, args, allowFailure = false }) {
  return await new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    });

    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
      });
    }

    child.on('error', (error) => {
      reject(new WorktreeManagerError(`Failed to run git ${args.join(' ')}: ${error.message}`, {
        cwd,
        args,
        stdout,
        stderr,
        code: null
      }));
    });

    child.on('close', (code) => {
      const result = {
        code: typeof code === 'number' ? code : null,
        stdout,
        stderr
      };

      if (allowFailure || code === 0) {
        resolve(result);
        return;
      }

      reject(new WorktreeManagerError(`git ${args.join(' ')} failed with code ${code}`, {
        cwd,
        args,
        ...result
      }));
    });
  });
}

function runGitSync({ cwd, args, allowFailure = false }) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false
  });

  if (result.error) {
    throw new WorktreeManagerError(`Failed to run git ${args.join(' ')}: ${result.error.message}`, {
      cwd,
      args,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      code: typeof result.status === 'number' ? result.status : null
    });
  }

  const response = {
    code: typeof result.status === 'number' ? result.status : null,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };

  if (allowFailure || response.code === 0) {
    return response;
  }

  throw new WorktreeManagerError(`git ${args.join(' ')} failed with code ${response.code}`, {
    cwd,
    args,
    ...response
  });
}

async function pathExists(targetPath) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * Auto-discover and symlink all node_modules directories from the main
 * repo into a worktree. Scans one level deep from projectRoot for any
 * subdirectory containing node_modules, plus the root node_modules itself.
 * Uses junctions on Windows to avoid requiring elevated privileges.
 */
function symlinkAllNodeModules(projectRoot, worktreePath) {
  const dirsToCheck = [''];  // '' = root-level node_modules

  // Scan one level deep for subdirectories that have node_modules
  try {
    const entries = fsSync.readdirSync(projectRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Skip hidden dirs, node_modules itself, and common non-project dirs
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'target') continue;
      const nmPath = path.join(projectRoot, entry.name, 'node_modules');
      if (fsSync.existsSync(nmPath)) {
        dirsToCheck.push(entry.name);
      }
    }
  } catch (e) {
    console.warn(`[WorktreeManager] Failed to scan for node_modules: ${e.message}`);
    return;
  }

  for (const dir of dirsToCheck) {
    const srcNM = dir ? path.join(projectRoot, dir, 'node_modules') : path.join(projectRoot, 'node_modules');
    const dstNM = dir ? path.join(worktreePath, dir, 'node_modules') : path.join(worktreePath, 'node_modules');
    if (fsSync.existsSync(srcNM) && !fsSync.existsSync(dstNM)) {
      try {
        fsSync.symlinkSync(srcNM, dstNM, 'junction');
      } catch (e) {
        console.warn(`[WorktreeManager] Failed to symlink ${dir || 'root'}/node_modules: ${e.message}`);
      }
    }
  }
}

function pathExistsSync(targetPath) {
  try {
    fsSync.statSync(targetPath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function branchExists(projectRoot, branch) {
  const result = await runGit({
    cwd: projectRoot,
    args: ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`],
    allowFailure: true
  });

  return result.code === 0;
}

function branchExistsSync(projectRoot, branch) {
  const result = runGitSync({
    cwd: projectRoot,
    args: ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`],
    allowFailure: true
  });

  return result.code === 0;
}

function resolveBaseBranchSync(projectRoot) {
  if (branchExistsSync(projectRoot, 'main')) {
    return 'main';
  }

  const headResult = runGitSync({
    cwd: projectRoot,
    args: ['rev-parse', '--abbrev-ref', 'HEAD'],
    allowFailure: true
  });
  const fallback = String(headResult.stdout || '').trim();
  return fallback || 'HEAD';
}

async function pruneWorktrees(projectRoot) {
  await runGit({
    cwd: projectRoot,
    args: ['worktree', 'prune']
  });
}

function pruneWorktreesSync(projectRoot) {
  runGitSync({
    cwd: projectRoot,
    args: ['worktree', 'prune']
  });
}

async function addWorktree({
  projectRoot,
  worktreePath,
  branch,
  createBranch,
  startPoint = 'HEAD'
}) {
  const args = createBranch
    ? ['worktree', 'add', '-b', branch, worktreePath, startPoint]
    : ['worktree', 'add', '--force', worktreePath, branch];

  await runGit({ cwd: projectRoot, args });
}

function addWorktreeSync({
  projectRoot,
  worktreePath,
  branch,
  createBranch,
  startPoint = 'HEAD'
}) {
  const args = createBranch
    ? ['worktree', 'add', '-b', branch, worktreePath, startPoint]
    : ['worktree', 'add', '--force', worktreePath, branch];

  runGitSync({ cwd: projectRoot, args });
}

async function removeWorktreeRegistration({ projectRoot, worktreePath }) {
  const removeResult = await runGit({
    cwd: projectRoot,
    args: ['worktree', 'remove', '--force', worktreePath],
    allowFailure: true
  });

  if (removeResult.code !== 0) {
    await fs.rm(worktreePath, { recursive: true, force: true });
  }
}

function removeWorktreeRegistrationSync({ projectRoot, worktreePath }) {
  const removeResult = runGitSync({
    cwd: projectRoot,
    args: ['worktree', 'remove', '--force', worktreePath],
    allowFailure: true
  });

  if (removeResult.code !== 0) {
    fsSync.rmSync(worktreePath, { recursive: true, force: true });
  }
}

async function createWorktree(ticketId, options = {}) {
  const {
    projectRoot
  } = options;

  const paths = resolveTicketPaths(projectRoot, ticketId);

  await fs.mkdir(paths.worktreesRoot, { recursive: true });
  await pruneWorktrees(paths.projectRoot);

  let existsOnDisk = await pathExists(paths.worktreePath);
  let hasBranch = await branchExists(paths.projectRoot, paths.branch);

  if (existsOnDisk && !hasBranch) {
    await removeWorktreeRegistration(paths);
    existsOnDisk = false;
  }

  let reused = false;

  if (existsOnDisk && hasBranch) {
    const headResult = await runGit({
      cwd: paths.worktreePath,
      args: ['rev-parse', '--abbrev-ref', 'HEAD'],
      allowFailure: true
    });

    const activeBranch = (headResult.stdout || '').trim();
    if (headResult.code === 0 && activeBranch === paths.branch) {
      reused = true;
    } else {
      await removeWorktreeRegistration(paths);
      existsOnDisk = false;
    }
  }

  if (!existsOnDisk) {
    await addWorktree({
      projectRoot: paths.projectRoot,
      worktreePath: paths.worktreePath,
      branch: paths.branch,
      createBranch: !hasBranch
    });
    hasBranch = true;
  }

  return {
    ticketId: paths.ticketId,
    branch: paths.branch,
    worktreePath: paths.worktreePath,
    created: !reused,
    reused,
    branchExists: hasBranch
  };
}

function createWorktreeSync(ticketId, options = {}) {
  const {
    projectRoot
  } = options;

  const paths = resolveTicketPaths(projectRoot, ticketId);

  fsSync.mkdirSync(paths.worktreesRoot, { recursive: true });
  pruneWorktreesSync(paths.projectRoot);

  let existsOnDisk = pathExistsSync(paths.worktreePath);
  let hasBranch = branchExistsSync(paths.projectRoot, paths.branch);

  if (existsOnDisk && !hasBranch) {
    removeWorktreeRegistrationSync(paths);
    existsOnDisk = false;
  }

  let reused = false;

  if (existsOnDisk && hasBranch) {
    const headResult = runGitSync({
      cwd: paths.worktreePath,
      args: ['rev-parse', '--abbrev-ref', 'HEAD'],
      allowFailure: true
    });

    const activeBranch = (headResult.stdout || '').trim();
    if (headResult.code === 0 && activeBranch === paths.branch) {
      reused = true;
    } else {
      removeWorktreeRegistrationSync(paths);
      existsOnDisk = false;
    }
  }

  if (!existsOnDisk) {
    addWorktreeSync({
      projectRoot: paths.projectRoot,
      worktreePath: paths.worktreePath,
      branch: paths.branch,
      createBranch: !hasBranch
    });
    hasBranch = true;
  }

  // Auto-discover and symlink all node_modules directories so sandboxed
  // agents can run npm scripts, lint, and typecheck without network access.
  // Scans one level deep from project root for any dir containing node_modules.
  symlinkAllNodeModules(paths.projectRoot, paths.worktreePath);

  return {
    ticketId: paths.ticketId,
    branch: paths.branch,
    worktreePath: paths.worktreePath,
    created: !reused,
    reused,
    branchExists: hasBranch
  };
}

async function removeWorktree(ticketId, options = {}) {
  const {
    projectRoot
  } = options;

  const paths = resolveTicketPaths(projectRoot, ticketId);

  await pruneWorktrees(paths.projectRoot);

  const existedOnDisk = await pathExists(paths.worktreePath);
  if (existedOnDisk) {
    await removeWorktreeRegistration(paths);
  }

  const hasBranch = await branchExists(paths.projectRoot, paths.branch);
  if (hasBranch) {
    await runGit({
      cwd: paths.projectRoot,
      args: ['branch', '-D', paths.branch]
    });
  }

  return {
    ticketId: paths.ticketId,
    branch: paths.branch,
    worktreePath: paths.worktreePath,
    removedWorktree: existedOnDisk,
    removedBranch: hasBranch
  };
}

function cleanupEvalTrialMergeSync(ticketId, options = {}) {
  const {
    projectRoot
  } = options;

  const paths = resolveEvalTrialPaths(projectRoot, ticketId);
  pruneWorktreesSync(paths.projectRoot);

  const existedOnDisk = pathExistsSync(paths.evalWorktreePath);
  if (existedOnDisk) {
    removeWorktreeRegistrationSync({
      projectRoot: paths.projectRoot,
      worktreePath: paths.evalWorktreePath
    });
  }

  // Prune again after worktree removal so git no longer considers the eval
  // branch "checked out", which would cause `git branch -D` to fail.
  pruneWorktreesSync(paths.projectRoot);

  const hasEvalBranch = branchExistsSync(paths.projectRoot, paths.evalBranch);
  if (hasEvalBranch) {
    const deleteResult = runGitSync({
      cwd: paths.projectRoot,
      args: ['branch', '-D', paths.evalBranch],
      allowFailure: true
    });

    // If branch deletion failed (e.g. still considered checked out), force
    // removal by updating the ref directly as a last resort.
    if (deleteResult.code !== 0) {
      runGitSync({
        cwd: paths.projectRoot,
        args: ['update-ref', '-d', `refs/heads/${paths.evalBranch}`],
        allowFailure: true
      });
    }
  }

  return {
    ticketId: paths.ticketId,
    branch: paths.evalBranch,
    worktreePath: paths.evalWorktreePath,
    removedWorktree: existedOnDisk,
    removedBranch: hasEvalBranch
  };
}

function prepareEvalTrialMergeSync(ticketId, options = {}) {
  const {
    projectRoot
  } = options;

  const paths = resolveEvalTrialPaths(projectRoot, ticketId);
  fsSync.mkdirSync(paths.worktreesRoot, { recursive: true });
  cleanupEvalTrialMergeSync(paths.ticketId, { projectRoot: paths.projectRoot });

  const hasFeatureBranch = branchExistsSync(paths.projectRoot, paths.branch);
  if (!hasFeatureBranch) {
    throw new WorktreeManagerError(`Feature branch ${paths.branch} does not exist for ${paths.ticketId}`, {
      ticketId: paths.ticketId,
      branch: paths.branch,
      conflict: false
    });
  }

  const baseBranch = resolveBaseBranchSync(paths.projectRoot);

  addWorktreeSync({
    projectRoot: paths.projectRoot,
    worktreePath: paths.evalWorktreePath,
    branch: paths.evalBranch,
    createBranch: true,
    startPoint: baseBranch
  });

  const mergeResult = runGitSync({
    cwd: paths.evalWorktreePath,
    args: ['merge', '--no-ff', '--no-commit', paths.branch],
    allowFailure: true
  });

  if (mergeResult.code !== 0) {
    // Check if all conflicting files are auto-resolvable (e.g. codingagent-state.json)
    const conflictResult = runGitSync({
      cwd: paths.evalWorktreePath,
      args: ['diff', '--name-only', '--diff-filter=U'],
      allowFailure: true
    });
    const conflictFiles = String(conflictResult.stdout || '').trim().split('\n').filter(Boolean);
    const allAutoResolvable = conflictFiles.length > 0 &&
      conflictFiles.every(file =>
        AUTO_RESOLVE_PATTERNS.some(pattern => file === pattern || file.endsWith(pattern))
      );

    if (allAutoResolvable) {
      // Auto-resolve by keeping the base branch version (--ours).
      for (const file of conflictFiles) {
        runGitSync({
          cwd: paths.evalWorktreePath,
          args: ['checkout', '--ours', '--', file],
          allowFailure: false
        });
        runGitSync({
          cwd: paths.evalWorktreePath,
          args: ['add', file],
          allowFailure: false
        });
      }
    } else {
      runGitSync({
        cwd: paths.evalWorktreePath,
        args: ['merge', '--abort'],
        allowFailure: true
      });
      cleanupEvalTrialMergeSync(paths.ticketId, { projectRoot: paths.projectRoot });
      throw new WorktreeManagerError(`Trial merge failed for ${paths.ticketId}`, {
        ticketId: paths.ticketId,
        branch: paths.evalBranch,
        featureBranch: paths.branch,
        conflict: true,
        stdout: mergeResult.stdout,
        stderr: mergeResult.stderr,
        code: mergeResult.code
      });
    }
  }

  // Check if the merge staged any changes. A merge can succeed (code 0) but
  // produce no staged changes when the ticket branch is already an ancestor of
  // the eval branch ("Already up to date"). In that case, fast-forward the eval
  // branch to the ticket branch so the eval agent sees the implementation code.
  const diffIndex = runGitSync({
    cwd: paths.evalWorktreePath,
    args: ['diff', '--cached', '--quiet'],
    allowFailure: true
  });
  const hasStagedChanges = diffIndex.code !== 0; // --quiet exits 1 when there are diffs

  if (hasStagedChanges) {
    // Commit the trial merge so the eval agent sees a clean working tree
    runGitSync({
      cwd: paths.evalWorktreePath,
      args: ['commit', '-m', `Eval trial merge: ${paths.branch} into ${baseBranch}`],
      allowFailure: false
    });
  } else {
    // No staged changes — the merge was "Already up to date".
    // Fast-forward the eval branch to the ticket branch so the eval worktree
    // contains the implementation changes.
    runGitSync({
      cwd: paths.evalWorktreePath,
      args: ['merge', '--ff-only', paths.branch],
      allowFailure: false
    });
  }

  // Symlink node_modules from the main repo so agents can run Node.js code
  // in the worktree without a separate npm install. Use 'junction' on Windows
  // to avoid requiring elevated privileges.
  const mainNodeModules = path.join(paths.projectRoot, '.ombutocode', 'src', 'node_modules');
  const wtNodeModules = path.join(paths.evalWorktreePath, '.ombutocode', 'src', 'node_modules');
  if (fsSync.existsSync(mainNodeModules) && !fsSync.existsSync(wtNodeModules)) {
    fsSync.symlinkSync(mainNodeModules, wtNodeModules, 'junction');
  }

  // Symlink project-level node_modules directories so sandboxed agents
  // (e.g. Codex) can run lint/typecheck without network access.
  const projectDirsWithNodeModules = ['frontend', 'gateway', 'frontend-practice'];
  for (const dir of projectDirsWithNodeModules) {
    const srcNM = path.join(paths.projectRoot, dir, 'node_modules');
    const dstNM = path.join(paths.evalWorktreePath, dir, 'node_modules');
    if (fsSync.existsSync(srcNM) && !fsSync.existsSync(dstNM)) {
      try {
        fsSync.symlinkSync(srcNM, dstNM, 'junction');
      } catch (e) {
        // Non-fatal: agent can still run, just without cached deps
        console.warn(`[WorktreeManager] Failed to symlink ${dir}/node_modules: ${e.message}`);
      }
    }
  }

  return {
    ticketId: paths.ticketId,
    branch: paths.evalBranch,
    baseBranch,
    featureBranch: paths.branch,
    worktreePath: paths.evalWorktreePath,
    created: true
  };
}

function rebaseTicketBranchSync(ticketId, options = {}) {
  const { projectRoot } = options;
  const paths = resolveTicketPaths(projectRoot, ticketId);

  const hasFeatureBranch = branchExistsSync(paths.projectRoot, paths.branch);
  if (!hasFeatureBranch) {
    throw new WorktreeManagerError(
      `Feature branch ${paths.branch} does not exist for ${paths.ticketId}`,
      { ticketId: paths.ticketId, branch: paths.branch, conflict: false }
    );
  }

  const baseBranch = resolveBaseBranchSync(paths.projectRoot);

  // Rebase requires the branch to be checked out — use the ticket worktree
  if (!pathExistsSync(paths.worktreePath)) {
    throw new WorktreeManagerError(
      `Worktree for ${paths.ticketId} does not exist; cannot rebase`,
      { ticketId: paths.ticketId, branch: paths.branch, conflict: false }
    );
  }

  const rebaseResult = runGitSync({
    cwd: paths.worktreePath,
    args: ['rebase', baseBranch],
    allowFailure: true
  });

  if (rebaseResult.code !== 0) {
    // Abort to leave branch in clean pre-rebase state
    runGitSync({
      cwd: paths.worktreePath,
      args: ['rebase', '--abort'],
      allowFailure: true
    });

    throw new WorktreeManagerError(
      `Rebase of ${paths.branch} onto ${baseBranch} failed`,
      {
        ticketId: paths.ticketId,
        branch: paths.branch,
        baseBranch,
        conflict: true,
        stdout: rebaseResult.stdout,
        stderr: rebaseResult.stderr,
        code: rebaseResult.code
      }
    );
  }

  return {
    ticketId: paths.ticketId,
    branch: paths.branch,
    baseBranch,
    worktreePath: paths.worktreePath,
    rebased: true
  };
}

/**
 * Pre-process a ticket branch by merging latest main into it.
 * Designed to be called before the implementation agent runs on a reused worktree
 * so the agent works on up-to-date code.
 *
 * Never throws — returns a result object indicating success, skip, or conflict.
 *
 * @param {string} ticketId
 * @param {object} options
 * @param {string} options.projectRoot
 * @returns {{ updated: boolean, reason?: string, conflictFiles?: string[] }}
 */
function updateTicketBranchSync(ticketId, options = {}) {
  const { projectRoot } = options;

  let paths;
  try {
    paths = resolveTicketPaths(projectRoot, ticketId);
  } catch (e) {
    return { updated: false, reason: 'invalid_paths', error: e.message };
  }

  // Validate branch exists
  if (!branchExistsSync(paths.projectRoot, paths.branch)) {
    return { updated: false, reason: 'no_branch' };
  }

  // Validate worktree exists
  if (!pathExistsSync(paths.worktreePath)) {
    return { updated: false, reason: 'no_worktree' };
  }

  const baseBranch = resolveBaseBranchSync(paths.projectRoot);

  // Fetch latest main so we have current refs
  runGitSync({
    cwd: paths.worktreePath,
    args: ['fetch', 'origin', baseBranch],
    allowFailure: true
  });

  // Check if main tip is already an ancestor of HEAD (branch is up to date)
  const ancestorCheck = runGitSync({
    cwd: paths.worktreePath,
    args: ['merge-base', '--is-ancestor', baseBranch, 'HEAD'],
    allowFailure: true
  });

  if (ancestorCheck.code === 0) {
    return { updated: false, reason: 'already_up_to_date' };
  }

  // Attempt merge
  const mergeResult = runGitSync({
    cwd: paths.worktreePath,
    args: ['merge', baseBranch, '-m', `Merge ${baseBranch} into ${paths.branch}`],
    allowFailure: true
  });

  if (mergeResult.code === 0) {
    return { updated: true };
  }

  // Merge failed — check if all conflicts are auto-resolvable
  const diffResult = runGitSync({
    cwd: paths.worktreePath,
    args: ['diff', '--name-only', '--diff-filter=U'],
    allowFailure: true
  });

  const conflictFiles = (diffResult.stdout || '').split('\n').map(f => f.trim()).filter(Boolean);

  const allResolvable = conflictFiles.length > 0 && conflictFiles.every(file =>
    AUTO_RESOLVE_PATTERNS.some(pattern => file === pattern || file.endsWith(pattern))
  );

  if (allResolvable) {
    // Auto-resolve by keeping main's version (--theirs in merge context)
    let resolved = true;
    for (const file of conflictFiles) {
      const checkout = runGitSync({
        cwd: paths.worktreePath,
        args: ['checkout', '--theirs', file],
        allowFailure: true
      });
      if (checkout.code !== 0) { resolved = false; break; }

      const add = runGitSync({
        cwd: paths.worktreePath,
        args: ['add', file],
        allowFailure: true
      });
      if (add.code !== 0) { resolved = false; break; }
    }

    if (resolved) {
      const commitResult = runGitSync({
        cwd: paths.worktreePath,
        args: ['commit', '--no-edit'],
        allowFailure: true
      });
      if (commitResult.code === 0) {
        return { updated: true, autoResolved: conflictFiles };
      }
    }

    // Auto-resolve failed — abort
    runGitSync({ cwd: paths.worktreePath, args: ['merge', '--abort'], allowFailure: true });
    return { updated: false, reason: 'auto_resolve_failed', conflictFiles };
  }

  // Non-resolvable conflicts — abort merge
  runGitSync({ cwd: paths.worktreePath, args: ['merge', '--abort'], allowFailure: true });
  return { updated: false, reason: 'conflict', conflictFiles };
}

function isMergeConflictResult(result = {}) {
  const output = `${String(result.stdout || '')}\n${String(result.stderr || '')}`.toLowerCase();
  return output.includes('conflict');
}

// Planning/config files that are safe to auto-resolve by keeping main's version (--ours).
// These files are constantly modified by the scheduler and are never the deliverable of a ticket.
// Note: backlog.yml was removed — backlog is now in SQLite (ombutocode.db), so conflicts can't happen.
const AUTO_RESOLVE_PATTERNS = [
  '.ombutocode/codingagent-state.json'
];

/**
 * After a squash merge with conflicts, check if ALL unmerged files are in the
 * auto-resolvable set. If so, resolve them by keeping main's version and stage.
 * Returns true if all conflicts were resolved, false if any non-resolvable file found.
 */
function tryAutoResolveConflicts(cwd) {
  // List unmerged (conflicting) files
  const diffResult = runGitSync({
    cwd,
    args: ['diff', '--name-only', '--diff-filter=U'],
    allowFailure: true
  });

  if (diffResult.code !== 0) return false;

  const conflictedFiles = (diffResult.stdout || '').split('\n').map(f => f.trim()).filter(Boolean);
  if (conflictedFiles.length === 0) return false;

  // Check every conflicting file is in the auto-resolve set
  const allResolvable = conflictedFiles.every(file =>
    AUTO_RESOLVE_PATTERNS.some(pattern => file === pattern || file.endsWith(pattern))
  );

  if (!allResolvable) return false;

  // Auto-resolve each file by keeping main's version (--ours in squash merge context)
  for (const file of conflictedFiles) {
    const checkoutResult = runGitSync({
      cwd,
      args: ['checkout', '--ours', file],
      allowFailure: true
    });
    if (checkoutResult.code !== 0) return false;

    const addResult = runGitSync({
      cwd,
      args: ['add', file],
      allowFailure: true
    });
    if (addResult.code !== 0) return false;
  }

  return true;
}

/**
 * Check if the ticket branch in a worktree has commits ahead of the base branch.
 * Used to detect implementation work from a prior run that was already committed.
 */
function branchHasCommitsAheadSync(ticketId, options = {}) {
  const { projectRoot, worktreePath } = options;
  const paths = resolveTicketPaths(projectRoot, ticketId);
  const cwd = worktreePath || paths.worktreePath;

  try {
    const baseBranch = resolveBaseBranchSync(projectRoot);

    // FIX: Resolve the base branch to a concrete SHA from the main repo first,
    // then use that SHA in the worktree context. Using a branch name like 'main'
    // in a worktree's rev-list can fail silently on some platforms (especially
    // Windows) when the ref doesn't resolve correctly from the worktree's linked
    // gitdir. Resolving to a SHA from projectRoot avoids this ambiguity.
    const baseShaResult = runGitSync({
      cwd: projectRoot,
      args: ['rev-parse', baseBranch],
      allowFailure: true
    });
    const baseSha = String(baseShaResult.stdout || '').trim();

    const headShaResult = runGitSync({
      cwd,
      args: ['rev-parse', 'HEAD'],
      allowFailure: true
    });
    const headSha = String(headShaResult.stdout || '').trim();

    // Quick check: if the SHAs differ, the branch has diverged from base.
    // If they're the same, there are definitely no commits ahead.
    if (!baseSha || !headSha) {
      console.warn(`[WorktreeManager] branchHasCommitsAheadSync(${ticketId}): SHA resolution failed — baseSha=${baseSha || '(empty)'}, headSha=${headSha || '(empty)'}`);
      return false;
    }
    if (baseSha === headSha) {
      return false;
    }

    // SHAs differ — try rev-list with the concrete SHA for an accurate count,
    // but even if it fails we know the branch has diverged (fall through below).
    const result = runGitSync({
      cwd,
      args: ['rev-list', '--count', `${baseSha}..HEAD`],
      allowFailure: true
    });
    const count = parseInt(String(result.stdout || '').trim(), 10);
    // If rev-list succeeded and returned a valid count, use it.
    // If it failed (NaN), fall back to the SHA comparison which already showed divergence.
    const hasCommits = Number.isNaN(count) ? true : count > 0;
    console.log(`[WorktreeManager] branchHasCommitsAheadSync(${ticketId}): baseSha=${baseSha.slice(0, 8)}, headSha=${headSha.slice(0, 8)}, count=${count}, result=${hasCommits}`);
    return hasCommits;
  } catch (e) {
    console.error(`[WorktreeManager] branchHasCommitsAheadSync(${ticketId}) threw: ${e?.message || e}`);
    // Re-throw so callers can distinguish "no commits" from "check failed"
    throw e;
  }
}

function commitWorktreeChangesSync(ticketId, options = {}) {
  const {
    projectRoot,
    worktreePath,
    commitMessage = null
  } = options;

  const paths = resolveTicketPaths(projectRoot, ticketId);
  const cwd = worktreePath || paths.worktreePath;
  const message = commitMessage || `${paths.ticketId}: Implementation changes`;

  // Stage all changes
  runGitSync({
    cwd,
    args: ['add', '-A']
  });

  // Check if there are any changes to commit
  const statusResult = runGitSync({
    cwd,
    args: ['status', '--porcelain'],
    allowFailure: true
  });

  const hasChanges = String(statusResult.stdout || '').trim().length > 0;
  if (!hasChanges) {
    // Nothing to commit - this is not an error
    return {
      ticketId: paths.ticketId,
      committed: false,
      commitSha: null,
      message: 'No changes to commit'
    };
  }

  // Commit the changes
  const commitResult = runGitSync({
    cwd,
    args: ['commit', '-m', message],
    allowFailure: false
  });

  // Get the commit SHA
  const commitShaResult = runGitSync({
    cwd,
    args: ['rev-parse', 'HEAD']
  });

  return {
    ticketId: paths.ticketId,
    committed: true,
    commitSha: String(commitShaResult.stdout || '').trim(),
    message
  };
}

function squashMergeTicketBranchSync(ticketId, options = {}) {
  const {
    projectRoot,
    title = ''
  } = options;

  const paths = resolveTicketPaths(projectRoot, ticketId);
  const baseBranch = resolveBaseBranchSync(paths.projectRoot);
  const commitMessage = `[${paths.ticketId}] ${String(title || '').trim() || paths.ticketId}`;

  const hasFeatureBranch = branchExistsSync(paths.projectRoot, paths.branch);
  if (!hasFeatureBranch) {
    throw new WorktreeManagerError(`Feature branch ${paths.branch} does not exist for ${paths.ticketId}`, {
      ticketId: paths.ticketId,
      branch: paths.branch,
      baseBranch,
      conflict: false
    });
  }

  // Count stash entries before so we can reliably detect if stash created a new entry
  const stashListBefore = runGitSync({
    cwd: paths.projectRoot,
    args: ['stash', 'list'],
    allowFailure: true
  });
  const stashCountBefore = (stashListBefore.stdout || '').split('\n').filter(Boolean).length;

  // Stash any uncommitted changes (e.g. backlog.yml updated by scheduler) so the merge can proceed
  runGitSync({
    cwd: paths.projectRoot,
    args: ['stash', '--include-untracked'],
    allowFailure: true
  });

  const stashListAfter = runGitSync({
    cwd: paths.projectRoot,
    args: ['stash', 'list'],
    allowFailure: true
  });
  const stashCountAfter = (stashListAfter.stdout || '').split('\n').filter(Boolean).length;
  const didStash = stashCountAfter > stashCountBefore;
  let stashRestored = false;

  const originalRefResult = runGitSync({
    cwd: paths.projectRoot,
    args: ['rev-parse', '--abbrev-ref', 'HEAD'],
    allowFailure: true
  });
  const originalRef = String(originalRefResult.stdout || '').trim() || 'HEAD';

  let checkoutMoved = false;

  try {
    if (originalRef !== baseBranch) {
      runGitSync({
        cwd: paths.projectRoot,
        args: ['checkout', baseBranch]
      });
      checkoutMoved = true;
    }

    const mergeResult = runGitSync({
      cwd: paths.projectRoot,
      args: ['merge', '--squash', paths.branch],
      allowFailure: true
    });

    if (mergeResult.code !== 0) {
      // Check if conflicts are limited to auto-resolvable planning files
      const resolved = isMergeConflictResult(mergeResult)
        && tryAutoResolveConflicts(paths.projectRoot);

      if (!resolved) {
        runGitSync({
          cwd: paths.projectRoot,
          args: ['merge', '--abort'],
          allowFailure: true
        });
        runGitSync({
          cwd: paths.projectRoot,
          args: ['reset', '--merge'],
          allowFailure: true
        });
        throw new WorktreeManagerError(`Squash merge failed for ${paths.ticketId}`, {
          ticketId: paths.ticketId,
          branch: paths.branch,
          baseBranch,
          conflict: isMergeConflictResult(mergeResult),
          stdout: mergeResult.stdout,
          stderr: mergeResult.stderr,
          code: mergeResult.code
        });
      }
    }

    const commitResult = runGitSync({
      cwd: paths.projectRoot,
      args: ['commit', '-m', commitMessage],
      allowFailure: true
    });

    if (commitResult.code !== 0) {
      runGitSync({
        cwd: paths.projectRoot,
        args: ['reset', '--merge'],
        allowFailure: true
      });
      throw new WorktreeManagerError(`Squash merge commit failed for ${paths.ticketId}`, {
        ticketId: paths.ticketId,
        branch: paths.branch,
        baseBranch,
        conflict: false,
        stdout: commitResult.stdout,
        stderr: commitResult.stderr,
        code: commitResult.code
      });
    }

    const commitShaResult = runGitSync({
      cwd: paths.projectRoot,
      args: ['rev-parse', 'HEAD']
    });

    return {
      ticketId: paths.ticketId,
      branch: paths.branch,
      baseBranch,
      commitMessage,
      commitSha: String(commitShaResult.stdout || '').trim()
    };
  } finally {
    if (checkoutMoved) {
      runGitSync({
        cwd: paths.projectRoot,
        args: ['checkout', originalRef],
        allowFailure: true
      });
    }
    if (didStash && !stashRestored) {
      // Try pop first; if it conflicts (e.g. merge touched a stashed file), drop and log
      const popResult = runGitSync({
        cwd: paths.projectRoot,
        args: ['stash', 'pop'],
        allowFailure: true
      });
      if (popResult.code === 0) {
        stashRestored = true;
      } else {
        // Pop failed (likely conflict with merged changes) — use checkout to accept theirs then drop
        runGitSync({ cwd: paths.projectRoot, args: ['checkout', '--theirs', '.'], allowFailure: true });
        runGitSync({ cwd: paths.projectRoot, args: ['reset', 'HEAD'], allowFailure: true });
        runGitSync({ cwd: paths.projectRoot, args: ['stash', 'drop'], allowFailure: true });
        stashRestored = true;
      }
    }
  }
}

module.exports = {
  WorktreeManagerError,
  resolveTicketPaths,
  createWorktree,
  createWorktreeSync,
  removeWorktree,
  prepareEvalTrialMergeSync,
  cleanupEvalTrialMergeSync,
  squashMergeTicketBranchSync,
  commitWorktreeChangesSync,
  branchHasCommitsAheadSync,
  rebaseTicketBranchSync,
  updateTicketBranchSync
};
