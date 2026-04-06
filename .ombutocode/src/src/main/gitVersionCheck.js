'use strict';

const { spawn } = require('child_process');

const MIN_GIT_VERSION = Object.freeze({
  major: 2,
  minor: 5,
  patch: 0
});

function parseGitVersionOutput(output) {
  const text = String(output || '').trim();
  const match = text.match(/git version\s+(\d+)\.(\d+)(?:\.(\d+))?/i);
  if (!match) return null;

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3] || '0', 10)
  };
}

function compareVersions(left, right) {
  const leftPatch = Number.isFinite(left.patch) ? left.patch : 0;
  const rightPatch = Number.isFinite(right.patch) ? right.patch : 0;
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return leftPatch - rightPatch;
}

function formatVersion(version) {
  if (!version) return 'unknown';
  const patch = Number.isFinite(version.patch) ? version.patch : 0;
  return `${version.major}.${version.minor}.${patch}`;
}

function runGitVersionCommand() {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
    });

    child.stderr?.on('data', (chunk) => {
      stderr += Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      resolve({
        code: typeof code === 'number' ? code : null,
        stdout,
        stderr
      });
    });
  });
}

async function checkGitVersionSupport(options = {}) {
  const {
    minVersion = MIN_GIT_VERSION,
    runCommand = runGitVersionCommand,
    logger = console,
    onWarning = null
  } = options;

  const minimumText = `${minVersion.major}.${minVersion.minor}`;

  let result;
  try {
    result = await runCommand();
  } catch (error) {
    const detail = `Git was not found on PATH or failed to execute. Worktree features require git ${minimumText}+ and will be disabled.`;
    logger.warn(`[Git] ${detail}`);
    if (typeof onWarning === 'function') {
      onWarning({
        message: 'Git dependency warning',
        detail
      });
    }
    return {
      supported: false,
      reason: 'not_found',
      version: null
    };
  }

  if (result.code !== 0) {
    const detail = `Unable to determine git version (exit code ${result.code ?? 'unknown'}). Worktree features require git ${minimumText}+ and will be disabled.`;
    logger.warn('[Git] %s stderr=%s', detail, (result.stderr || '').trim() || '(none)');
    if (typeof onWarning === 'function') {
      onWarning({
        message: 'Git dependency warning',
        detail
      });
    }
    return {
      supported: false,
      reason: 'command_failed',
      version: null
    };
  }

  const version = parseGitVersionOutput(result.stdout);
  if (!version) {
    const detail = `Unexpected git version output: "${String(result.stdout || '').trim() || '(empty)'}". Worktree features require git ${minimumText}+ and will be disabled.`;
    logger.warn('[Git] %s', detail);
    if (typeof onWarning === 'function') {
      onWarning({
        message: 'Git dependency warning',
        detail
      });
    }
    return {
      supported: false,
      reason: 'unparseable',
      version: null
    };
  }

  const supported = compareVersions(version, minVersion) >= 0;
  if (!supported) {
    const detail = `Detected git ${formatVersion(version)}; worktree features require git ${minimumText}+ and will be disabled.`;
    logger.warn('[Git] %s', detail);
    if (typeof onWarning === 'function') {
      onWarning({
        message: 'Git dependency warning',
        detail
      });
    }
    return {
      supported: false,
      reason: 'unsupported_version',
      version
    };
  }

  return {
    supported: true,
    reason: null,
    version
  };
}

module.exports = {
  MIN_GIT_VERSION,
  parseGitVersionOutput,
  compareVersions,
  checkGitVersionSupport
};
