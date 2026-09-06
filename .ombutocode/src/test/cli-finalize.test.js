const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runFinalize } = require('../src/cli/finalize');
const { buildProjectPaths } = require('../src/cli/bootstrap');
const { parseCliArgs: parseArgs } = require('../src/cli/args');
const { buildFinalizePrompt, FINALIZE_DONE_SENTINEL, FINALIZE_FAILED_SENTINEL } = require('../src/main/planningPrompts');

const yml = {
  tools: [{
    id: 'claude', name: 'Claude', enabled: true,
    models: [{ id: 'sonnet-4.6', model_id: 'claude-sonnet-4-6', enabled: true }]
  }]
};

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-fin-'));
  fs.mkdirSync(path.join(root, 'docs', 'Epics'), { recursive: true });
  fs.mkdirSync(path.join(root, '.ombutocode', 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'Epics', 'epic_01_X.md'), '# Epic 1: X\n\nStatus: TICKETS\n');
  fs.writeFileSync(path.join(root, 'INSTRUCTION.md'), '# spec');
  return root;
}

function makeCtx(root) {
  return {
    paths: buildProjectPaths(root),
    dbReady: true,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    settingsStore: { get: (_k, d) => d, set: () => {} },
    utils: { readAgentsConfig: () => yml, appendAgentLog: () => {} },
    resolveAgentTemplateConfig: () => ({ command: 'fake', args: [], stdin: null })
  };
}

// A git stub: HEAD moves when the agent "commits"; `dirty` controls whether
// tracked changes are left behind for the CLI to commit.
function makeGit({ dirty = false, agentCommits = false } = {}) {
  let head = 'aaa111';
  const calls = [];
  return {
    calls,
    headSha: () => head,
    runGit: (_cwd, args) => {
      calls.push(args.join(' '));
      if (args[0] === 'status') return { code: 0, stdout: dirty ? ' M src/x.py\n' : '', stderr: '' };
      if (args[0] === 'add') return { code: 0, stdout: '', stderr: '' };
      if (args[0] === 'commit') { head = 'ccc333'; return { code: 0, stdout: '', stderr: '' }; }
      return { code: 0, stdout: '', stderr: '' };
    },
    simulateAgentCommit() { if (agentCommits) head = 'bbb222'; }
  };
}

const fakeRun = (text, overrides = {}) => ({
  runId: 'cli-fin-1', stage: 'finalize', state: 'completed', exitCode: 0, timedOut: false, error: null,
  durationMs: 5, log: '.ombutocode/run-output/fin.log', tokens: { total_cost_usd: 0.5 }, text, ...overrides
});

test('finalize prompt names the epic, the reference spec, the branch and the sentinels', () => {
  const p = buildFinalizePrompt({ epicPath: 'Epics/epic_01_X.md', referenceFile: 'INSTRUCTION.md', branch: 'main' });
  assert.match(p, /docs\/Epics\/epic_01_X\.md/);
  assert.match(p, /reference specification at "INSTRUCTION\.md"/);
  assert.match(p, /INTEGRATION VERIFICATION/);
  assert.match(p, /never modify existing tests/);
  assert.match(p, /DO NOT ASK ME ANYTHING/);
  assert.ok(p.trim().endsWith(`"${FINALIZE_FAILED_SENTINEL}" if you could not complete the verification.`));
  assert.ok(p.includes(`"${FINALIZE_DONE_SENTINEL}"`));
  assert.throws(() => buildFinalizePrompt({}), /epicPath is required/);
});

test('finalize args: --epic is required, defaults branch to main', () => {
  const bad = parseArgs(['node', 'headless.js', 'finalize']);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /--epic/);
  const good = parseArgs(['node', 'headless.js', 'finalize', '--epic', 'docs/Epics/epic_01_X.md', '--json']);
  assert.equal(good.ok, true);
  assert.equal(good.command, 'finalize');
  assert.equal(good.options.branch, 'main');
  assert.equal(good.options.json, true);
});

test('finalize succeeds on the done sentinel and records the agent commit', async () => {
  const root = makeProject();
  const ctx = makeCtx(root);
  const gitImpl = makeGit({ agentCommits: true });
  let captured = null;
  const runAgent = async (params) => { captured = params; gitImpl.simulateAgentCommit(); return fakeRun(`installed, ran 5 checks\n${FINALIZE_DONE_SENTINEL}\n`); };

  const outcome = await runFinalize(ctx, { epic: 'epic_01_X.md', input: 'INSTRUCTION.md', agent: 'claude', model: 'sonnet-4.6' }, { runAgent, gitImpl });
  assert.equal(outcome.ok, true, outcome.error);
  assert.equal(outcome.exitCode, 0);
  assert.equal(captured.stage, 'finalize');
  assert.equal(captured.modelId, 'claude-sonnet-4-6');
  assert.match(captured.prompt, /docs\/Epics\/epic_01_X\.md/);
  assert.equal(outcome.result.referenceFile, 'INSTRUCTION.md');
  assert.equal(outcome.result.committedBy, 'agent');
  assert.equal(outcome.result.headAfter, 'bbb222');
  assert.equal(outcome.result.sentinel.state, 'done');
  assert.match(outcome.result.report, /ran 5 checks/);
});

test('finalize commits tracked changes the agent left behind', async () => {
  const root = makeProject();
  const gitImpl = makeGit({ dirty: true });
  const runAgent = async () => fakeRun(`${FINALIZE_DONE_SENTINEL}\n`);
  const outcome = await runFinalize(makeCtx(root), { epic: 'epic_01_X.md', agent: 'claude' }, { runAgent, gitImpl });
  assert.equal(outcome.ok, true, outcome.error);
  assert.equal(outcome.result.committedBy, 'cli');
  assert.ok(gitImpl.calls.some((c) => c.startsWith('commit -m finalize:')));
  assert.ok(gitImpl.calls.includes('add -u'), 'only tracked files are staged');
});

test('finalize fails on the failed sentinel and on a missing sentinel', async () => {
  const root = makeProject();
  const failed = await runFinalize(makeCtx(root), { epic: 'epic_01_X.md', agent: 'claude' },
    { runAgent: async () => fakeRun(`no docker here\n${FINALIZE_FAILED_SENTINEL}\n`), gitImpl: makeGit() });
  assert.equal(failed.ok, false);
  assert.equal(failed.exitCode, 1);
  assert.match(failed.error, /could not complete/);

  const missing = await runFinalize(makeCtx(root), { epic: 'epic_01_X.md', agent: 'claude' },
    { runAgent: async () => fakeRun('I would like to confirm first'), gitImpl: makeGit() });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /without the completion sentinel/);

  const timeout = await runFinalize(makeCtx(root), { epic: 'epic_01_X.md', agent: 'claude' },
    { runAgent: async () => fakeRun('', { timedOut: true }), gitImpl: makeGit() });
  assert.equal(timeout.exitCode, 3);
});

test('finalize rejects an unknown epic or reference file with a usage error', async () => {
  const root = makeProject();
  const a = await runFinalize(makeCtx(root), { epic: 'nope.md', agent: 'claude' }, { runAgent: async () => fakeRun(''), gitImpl: makeGit() });
  assert.equal(a.exitCode, 2);
  const b = await runFinalize(makeCtx(root), { epic: 'epic_01_X.md', input: 'missing.md', agent: 'claude' }, { runAgent: async () => fakeRun(''), gitImpl: makeGit() });
  assert.equal(b.exitCode, 2);
});
