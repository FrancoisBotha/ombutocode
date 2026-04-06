const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MIN_GIT_VERSION,
  parseGitVersionOutput,
  compareVersions,
  checkGitVersionSupport
} = require('../src/main/gitVersionCheck');

test('parseGitVersionOutput parses standard git --version output', () => {
  assert.deepEqual(parseGitVersionOutput('git version 2.43.0'), {
    major: 2,
    minor: 43,
    patch: 0
  });
});

test('parseGitVersionOutput parses platform-suffixed version output', () => {
  assert.deepEqual(parseGitVersionOutput('git version 2.39.2.windows.1'), {
    major: 2,
    minor: 39,
    patch: 2
  });
});

test('compareVersions compares major/minor/patch correctly', () => {
  assert.ok(compareVersions({ major: 2, minor: 5, patch: 0 }, MIN_GIT_VERSION) === 0);
  assert.ok(compareVersions({ major: 2, minor: 6, patch: 0 }, MIN_GIT_VERSION) > 0);
  assert.ok(compareVersions({ major: 2, minor: 4, patch: 9 }, MIN_GIT_VERSION) < 0);
});

test('checkGitVersionSupport reports supported for compatible versions', async () => {
  const result = await checkGitVersionSupport({
    runCommand: async () => ({
      code: 0,
      stdout: 'git version 2.30.1',
      stderr: ''
    }),
    logger: { warn() {} }
  });

  assert.equal(result.supported, true);
  assert.equal(result.reason, null);
  assert.deepEqual(result.version, { major: 2, minor: 30, patch: 1 });
});

test('checkGitVersionSupport warns for unsupported git version', async () => {
  const warnings = [];
  const userWarnings = [];
  const result = await checkGitVersionSupport({
    runCommand: async () => ({
      code: 0,
      stdout: 'git version 2.4.9',
      stderr: ''
    }),
    logger: {
      warn(...args) {
        warnings.push(args.join(' '));
      }
    },
    onWarning(payload) {
      userWarnings.push(payload);
    }
  });

  assert.equal(result.supported, false);
  assert.equal(result.reason, 'unsupported_version');
  assert.equal(warnings.length, 1);
  assert.equal(userWarnings.length, 1);
  assert.match(userWarnings[0].detail, /require git 2\.5\+/i);
});

test('checkGitVersionSupport warns when git command is missing', async () => {
  const warnings = [];
  const result = await checkGitVersionSupport({
    runCommand: async () => {
      throw new Error('ENOENT');
    },
    logger: {
      warn(message) {
        warnings.push(message);
      }
    }
  });

  assert.equal(result.supported, false);
  assert.equal(result.reason, 'not_found');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Worktree features/i);
});
