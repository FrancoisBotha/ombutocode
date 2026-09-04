const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { verifyEpicOutcome, runEpicCreate } = require('../src/cli/epicCreate');
const { verifyTicketOutcome, runTicketsCreate } = require('../src/cli/ticketsCreate');
const { buildProjectPaths } = require('../src/cli/bootstrap');
const { readEpicStatus, updateEpicStatus, resolveEpicPath } = require('../src/cli/epicFiles');
const { EPIC_DONE_SENTINEL, TICKETS_DONE_SENTINEL } = require('../src/main/planningPrompts');

const yml = {
  tools: [{
    id: 'claude', name: 'Claude', enabled: true,
    models: [{ id: 'opus-4.7', model_id: 'claude-opus-4-7', enabled: true }]
  }]
};

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-cli-'));
  fs.mkdirSync(path.join(root, 'docs', 'Epics'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'Skills', 'Epics'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'Skills', 'Ticket Generation'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'Product Requirements Document'), { recursive: true });
  fs.mkdirSync(path.join(root, '.ombutocode', 'tools'), { recursive: true });
  fs.mkdirSync(path.join(root, '.ombutocode', 'src', 'node_modules', 'sql.js'), { recursive: true });
  fs.mkdirSync(path.join(root, '.ombutocode', 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, '.ombutocode', 'tools', 'ticket-write.cjs'), '// stub');
  fs.writeFileSync(path.join(root, 'docs', 'Skills', 'Epics', 'Epic Generation - Unattended.md'), '---\nsystem: true\n---\n\n# Unattended skill body');
  fs.writeFileSync(path.join(root, 'docs', 'Skills', 'Ticket Generation', 'Ticket Generation.md'), '---\nsystem: true\n---\n\n# Ticket skill body');
  fs.writeFileSync(path.join(root, 'docs', 'Product Requirements Document', 'PRD.md'), '# PRD');
  fs.writeFileSync(path.join(root, 'spec.md'), '# Reference spec');
  fs.writeFileSync(path.join(root, 'docs', 'Epics', 'epic_01_EXISTING.md'), '# Epic: Existing\n\n- **Status:** NEW\n- **Created:** 2026-01-01\n');
  return root;
}

function makeCtx(root, { tickets = [] } = {}) {
  const paths = buildProjectPaths(root);
  const store = {};
  const logs = [];
  const updates = [];
  let saved = 0;
  return {
    paths,
    dbReady: true,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    settingsStore: { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; } },
    utils: {
      readAgentsConfig: () => yml,
      readBacklogData: () => ({ version: 1, updated_at: '', tickets: tickets.map((t) => ({ ...t })) }),
      appendAgentLog: (entry) => logs.push(entry)
    },
    backlogDb: {
      updateTicketFields: (id, fields) => {
        updates.push({ id, fields });
        const t = tickets.find((x) => x.id === id);
        if (t) Object.assign(t, fields);
      }
    },
    ombutocodeDb: { reloadFromDisk: () => true, saveDb: () => { saved += 1; } },
    resolveAgentTemplateConfig: () => ({ command: 'fake', args: [], stdin: null }),
    _tickets: tickets,
    _updates: updates,
    _logs: logs,
    get _saved() { return saved; }
  };
}

const fakeRun = (overrides = {}) => ({
  runId: 'cli-test-1', stage: 'epic', state: 'completed', exitCode: 0, timedOut: false, error: null,
  durationMs: 12, log: '.ombutocode/run-output/fake.log', tokens: { input_tokens: 1, output_tokens: 2 }, text: '',
  ...overrides
});

// ---------------------------------------------------------------------------
// Pure verification helpers
// ---------------------------------------------------------------------------

test('verifyEpicOutcome needs a done sentinel plus a new file', () => {
  const before = new Set(['epic_01_A.md']);
  assert.equal(verifyEpicOutcome({ sentinel: { state: 'done' }, before, after: new Set(['epic_01_A.md', 'epic_02_B.md']) }).epicFile, 'epic_02_B.md');
  assert.equal(verifyEpicOutcome({ sentinel: { state: 'done', path: 'docs/Epics/epic_03_C.md' }, before, after: new Set(['epic_01_A.md', 'epic_02_B.md', 'epic_03_C.md']) }).epicFile, 'epic_03_C.md');
  assert.equal(verifyEpicOutcome({ sentinel: { state: 'done' }, before, after: before }).ok, false);
  assert.equal(verifyEpicOutcome({ sentinel: { state: 'done' }, before, after: new Set(['epic_01_A.md', 'x.md', 'y.md']) }).ok, false);
  assert.equal(verifyEpicOutcome({ sentinel: { state: 'missing' }, before, after: new Set(['epic_01_A.md', 'epic_02_B.md']) }).ok, false);
  assert.equal(verifyEpicOutcome({ sentinel: { state: 'failed' }, before, after: before }).reason.includes('FAILED'), true);
});

test('verifyTicketOutcome finds new tickets for the epic and lists the fixes needed', () => {
  const assignee = { tool: 'claude', model: 'opus-4.7' };
  const after = [
    { id: 'OLD-001', status: 'review', epic_ref: 'docs/Epics/epic_02_NEW.md' },
    { id: 'NEW-001', status: 'todo', assignee, epic_ref: 'docs/Epics/epic_02_NEW.md' },
    { id: 'NEW-002', status: 'backlog', assignee: 'claude', epic_ref: 'Epics/epic_02_NEW.md' },
    { id: 'NEW-003', status: 'todo', assignee: null, epic_ref: 'docs\\Epics\\epic_02_NEW.md' },
    { id: 'STRAY-1', status: 'todo', assignee, epic_ref: 'docs/Epics/epic_09_OTHER.md' }
  ];
  const verdict = verifyTicketOutcome({
    sentinel: { state: 'done' }, before: new Set(['OLD-001']), after,
    epicRef: 'docs/Epics/epic_02_NEW.md', status: 'todo', assignee
  });
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.tickets.map((t) => t.id), ['NEW-001', 'NEW-002', 'NEW-003']);
  assert.deepEqual(verdict.strays, ['STRAY-1']);
  assert.deepEqual(verdict.fixes, [
    { id: 'NEW-002', field: 'status', from: 'backlog', to: 'todo' },
    { id: 'NEW-002', field: 'assignee', from: 'claude', to: assignee },
    { id: 'NEW-003', field: 'assignee', from: null, to: assignee }
  ]);

  assert.equal(verifyTicketOutcome({ sentinel: { state: 'done' }, before: new Set(['OLD-001']), after: after.slice(0, 1), epicRef: 'docs/Epics/epic_02_NEW.md', status: 'todo', assignee }).ok, false);
  assert.equal(verifyTicketOutcome({ sentinel: { state: 'missing' }, before: new Set(), after, epicRef: 'docs/Epics/epic_02_NEW.md', status: 'todo', assignee }).ok, false);
});

test('updateEpicStatus handles the bullet, bold and plain Status forms and inserts when absent', () => {
  const root = makeProject();
  const bullet = path.join(root, 'docs', 'Epics', 'epic_01_EXISTING.md');
  updateEpicStatus(bullet, 'TICKETS', { today: '2026-08-30' });
  const bulletText = fs.readFileSync(bullet, 'utf-8');
  assert.match(bulletText, /^- \*\*Status:\*\* TICKETS$/m);
  assert.match(bulletText, /^- \*\*Last Updated:\*\* 2026-08-30$/m);
  assert.equal(readEpicStatus(bullet), 'TICKETS');

  const plain = path.join(root, 'docs', 'Epics', 'epic_02_PLAIN.md');
  fs.writeFileSync(plain, '# Epic: Plain\nStatus: NEW\nCreated: 2026-01-01\nLast Updated: 2026-01-01\n');
  updateEpicStatus(plain, 'TICKETS', { today: '2026-08-30' });
  assert.equal(fs.readFileSync(plain, 'utf-8'), '# Epic: Plain\nStatus: TICKETS\nCreated: 2026-01-01\nLast Updated: 2026-08-30\n');

  const none = path.join(root, 'docs', 'Epics', 'epic_03_NONE.md');
  fs.writeFileSync(none, '# Epic: None\n\nBody\n');
  updateEpicStatus(none, 'TICKETS', { today: '2026-08-30' });
  assert.equal(fs.readFileSync(none, 'utf-8'), '# Epic: None\nStatus: TICKETS\nLast Updated: 2026-08-30\n\nBody\n');

  const resolved = resolveEpicPath(root, 'epic_02_PLAIN');
  assert.equal(resolved.docsRelative, 'Epics/epic_02_PLAIN.md');
  assert.equal(resolveEpicPath(root, 'docs/Epics/epic_02_PLAIN.md').epicRef, 'docs/Epics/epic_02_PLAIN.md');
  assert.equal(resolveEpicPath(root, 'Epics/epic_02_PLAIN.md').absolute, plain);
  assert.throws(() => resolveEpicPath(root, 'epic_99_MISSING.md'), /not found/);
});

// ---------------------------------------------------------------------------
// epic create with an injected runner
// ---------------------------------------------------------------------------

test('runEpicCreate builds the unattended prompt, verifies the new file and commits it when the agent forgot', async () => {
  const root = makeProject();
  const ctx = makeCtx(root);
  const gitCalls = [];
  const gitImpl = {
    isFileCommitted: (cwd, file) => { gitCalls.push(['status', file]); return false; },
    commitFile: (cwd, file, message) => { gitCalls.push(['commit', file, message]); return { ok: true, sha: 'abc123', output: '' }; },
    headSha: () => 'abc123'
  };
  let captured = null;
  const runAgent = async (params) => {
    captured = params;
    fs.writeFileSync(path.join(root, 'docs', 'Epics', 'epic_02_NEW.md'), '# Epic: New\n\n- **Status:** NEW\n');
    return fakeRun({ text: `analysis...\n${EPIC_DONE_SENTINEL} docs/Epics/epic_02_NEW.md\n` });
  };

  const outcome = await runEpicCreate(ctx, { input: 'spec.md', agent: 'claude', model: 'opus-4.7' }, { runAgent, gitImpl });
  assert.equal(outcome.ok, true, outcome.error);
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.agent, 'claude');
  assert.equal(outcome.model, 'opus-4.7');
  assert.deepEqual(outcome.tokens, { input_tokens: 1, output_tokens: 2 });
  assert.equal(outcome.result.epicPath, 'docs/Epics/epic_02_NEW.md');
  assert.equal(outcome.result.epicStem, 'epic_02_NEW');
  assert.equal(outcome.result.committed, true);
  assert.equal(outcome.result.committedBy, 'cli');
  assert.deepEqual(gitCalls[1], ['commit', 'docs/Epics/epic_02_NEW.md', 'docs: add epic_02_NEW']);
  assert.equal(outcome.result.sentinel.state, 'done');
  assert.equal(outcome.result.runId, 'cli-test-1');

  assert.equal(captured.agent, 'claude');
  assert.equal(captured.modelId, 'claude-opus-4-7');
  assert.equal(captured.stage, 'epic');
  assert.equal(captured.timeoutMs, 30 * 60 * 1000);
  assert.match(captured.prompt, /^# Unattended skill body\n\n---\n\n/);
  assert.match(captured.prompt, /reference specification at "spec\.md"/);
  assert.match(captured.prompt, /PRD at "docs\/Product Requirements Document\/PRD\.md"/);
  assert.match(captured.prompt, /- epic_01_EXISTING \(NEW\)/);
  assert.match(captured.prompt, /Commit the new epic file/);
});

test('runEpicCreate honours --no-commit, --timeout-sec and reports agent-committed files', async () => {
  const root = makeProject();
  const ctx = makeCtx(root);
  const gitImpl = { isFileCommitted: () => true, commitFile: () => { throw new Error('must not commit'); }, headSha: () => 'deadbeef' };
  let captured = null;
  const runAgent = async (params) => {
    captured = params;
    fs.writeFileSync(path.join(root, 'docs', 'Epics', 'epic_02_NEW.md'), '# Epic: New\n');
    return fakeRun({ text: `${EPIC_DONE_SENTINEL}\n` });
  };
  const outcome = await runEpicCreate(ctx, { input: 'spec.md', agent: 'claude', noCommit: true, timeoutSec: 42 }, { runAgent, gitImpl });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.result.committed, false);
  assert.equal(outcome.result.committedBy, null);
  assert.equal(captured.timeoutMs, 42000);
  assert.match(captured.prompt, /Do NOT commit/);

  const committed = await runEpicCreate(makeCtx(makeProject()), { input: 'spec.md', agent: 'claude' }, {
    runAgent: async (params) => {
      fs.writeFileSync(path.join(params.projectRoot, 'docs', 'Epics', 'epic_02_X.md'), '# x');
      return fakeRun({ text: `${EPIC_DONE_SENTINEL} docs/Epics/epic_02_X.md` });
    },
    gitImpl
  });
  assert.equal(committed.result.committedBy, 'agent');
  assert.equal(committed.result.commitSha, 'deadbeef');
});

test('runEpicCreate fails (exit 1) when the sentinel is missing or no file appeared, exit 2 for bad input, exit 3 on timeout', async () => {
  const root = makeProject();
  const gitImpl = { isFileCommitted: () => true, commitFile: () => ({ ok: true }), headSha: () => 'x' };

  const noFile = await runEpicCreate(makeCtx(root), { input: 'spec.md', agent: 'claude' }, { runAgent: async () => fakeRun({ text: `${EPIC_DONE_SENTINEL} docs/Epics/epic_02_NEW.md` }), gitImpl });
  assert.equal(noFile.ok, false);
  assert.equal(noFile.exitCode, 1);
  assert.match(noFile.error, /no new epic file/);

  const noSentinel = await runEpicCreate(makeCtx(root), { input: 'spec.md', agent: 'claude' }, {
    runAgent: async () => { fs.writeFileSync(path.join(root, 'docs', 'Epics', 'epic_02_NEW.md'), '# x'); return fakeRun({ text: 'done, I think' }); },
    gitImpl
  });
  assert.equal(noSentinel.ok, false);
  assert.equal(noSentinel.exitCode, 1);
  assert.deepEqual(noSentinel.result.newFiles, ['epic_02_NEW.md']);

  const badInput = await runEpicCreate(makeCtx(root), { input: 'missing.md', agent: 'claude' }, { runAgent: async () => { throw new Error('must not run'); }, gitImpl });
  assert.equal(badInput.exitCode, 2);

  const badAgent = await runEpicCreate(makeCtx(root), { input: 'spec.md', agent: 'gemini' }, { runAgent: async () => { throw new Error('must not run'); }, gitImpl });
  assert.equal(badAgent.exitCode, 2);

  const timeout = await runEpicCreate(makeCtx(root), { input: 'spec.md', agent: 'claude' }, { runAgent: async () => fakeRun({ timedOut: true, state: 'timeout', exitCode: null, text: '' }), gitImpl });
  assert.equal(timeout.exitCode, 3);
});

// ---------------------------------------------------------------------------
// tickets create with an injected runner
// ---------------------------------------------------------------------------

test('runTicketsCreate verifies new rows, fixes status/assignee and flips the epic to TICKETS', async () => {
  const root = makeProject();
  const tickets = [{ id: 'OLD-001', title: 'old', status: 'review', epic_ref: 'docs/Epics/epic_01_EXISTING.md' }];
  const ctx = makeCtx(root, { tickets });
  let captured = null;
  const runAgent = async (params) => {
    captured = params;
    tickets.push(
      { id: 'EX-001', title: 'First', status: 'todo', assignee: { tool: 'claude', model: 'opus-4.7' }, dependencies: [], epic_ref: 'docs/Epics/epic_01_EXISTING.md' },
      { id: 'EX-002', title: 'Second', status: 'backlog', assignee: 'claude', dependencies: ['EX-001'], epic_ref: 'docs/Epics/epic_01_EXISTING.md' },
      { id: 'EX-003', title: 'Third', status: 'todo', assignee: null, dependencies: ['EX-002'], epic_ref: 'docs/Epics/epic_01_EXISTING.md' }
    );
    return fakeRun({ stage: 'tickets', text: `table...\n${TICKETS_DONE_SENTINEL}\n` });
  };

  const outcome = await runTicketsCreate(ctx, { epic: 'epic_01_EXISTING.md', assignee: 'claude:opus-4.7', status: 'todo', agent: 'claude' }, { runAgent });
  assert.equal(outcome.ok, true, outcome.error);
  assert.equal(outcome.exitCode, 0);
  assert.deepEqual(outcome.result.tickets.map((t) => t.id), ['EX-001', 'EX-002', 'EX-003']);
  for (const t of outcome.result.tickets) {
    assert.equal(t.status, 'todo');
    assert.deepEqual(t.assignee, { tool: 'claude', model: 'opus-4.7' });
  }
  assert.deepEqual(outcome.result.tickets[1].dependencies, ['EX-001']);
  assert.deepEqual(outcome.result.fixedUp.map((f) => `${f.id}.${f.field}`), ['EX-002.status', 'EX-002.assignee', 'EX-003.assignee']);
  assert.deepEqual(ctx._updates, [
    { id: 'EX-002', fields: { status: 'todo', assignee: { tool: 'claude', model: 'opus-4.7' } } },
    { id: 'EX-003', fields: { assignee: { tool: 'claude', model: 'opus-4.7' } } }
  ]);
  assert.equal(ctx._saved, 1);
  assert.equal(outcome.result.epicStatus, 'TICKETS');
  assert.equal(outcome.result.epicStatusUpdated, true);
  assert.equal(readEpicStatus(path.join(root, 'docs', 'Epics', 'epic_01_EXISTING.md')), 'TICKETS');
  assert.equal(outcome.result.epicPath, 'docs/Epics/epic_01_EXISTING.md');

  assert.equal(captured.stage, 'tickets');
  assert.equal(captured.timeoutMs, 20 * 60 * 1000);
  assert.match(captured.prompt, /^# Ticket skill body\n\n/);
  assert.match(captured.prompt, /epic specification at "docs\/Epics\/epic_01_EXISTING\.md"/);
  assert.match(captured.prompt, /- status: todo/);
  assert.match(captured.prompt, /- assignee: \{"tool":"claude","model":"opus-4\.7"\}/);
});

test('runTicketsCreate rejects bad assignees (exit 2) and fails without new rows (exit 1)', async () => {
  const root = makeProject();
  const never = async () => { throw new Error('must not run'); };

  const badModel = await runTicketsCreate(makeCtx(root), { epic: 'epic_01_EXISTING.md', assignee: 'claude:opus-9', status: 'todo', agent: 'claude' }, { runAgent: never });
  assert.equal(badModel.exitCode, 2);
  assert.match(badModel.error, /Valid model ids: opus-4\.7/);

  const missingEpic = await runTicketsCreate(makeCtx(root), { epic: 'epic_77.md', assignee: 'claude', status: 'todo', agent: 'claude' }, { runAgent: never });
  assert.equal(missingEpic.exitCode, 2);

  const noRows = await runTicketsCreate(makeCtx(root), { epic: 'epic_01_EXISTING.md', assignee: 'claude', status: 'todo', agent: 'claude' }, {
    runAgent: async () => fakeRun({ text: `${TICKETS_DONE_SENTINEL}` })
  });
  assert.equal(noRows.ok, false);
  assert.equal(noRows.exitCode, 1);
  assert.match(noRows.error, /no new ticket/);
  // epic status must not be touched on failure
  assert.equal(readEpicStatus(path.join(root, 'docs', 'Epics', 'epic_01_EXISTING.md')), 'NEW');

  // missing sql.js for ticket-write surfaces clearly
  const noSql = makeProject();
  fs.rmSync(path.join(noSql, '.ombutocode', 'src', 'node_modules', 'sql.js'), { recursive: true });
  const missingSql = await runTicketsCreate(makeCtx(noSql), { epic: 'epic_01_EXISTING.md', assignee: 'claude', status: 'todo', agent: 'claude' }, { runAgent: never });
  assert.equal(missingSql.exitCode, 1);
  assert.match(missingSql.error, /sql\.js/);
});
