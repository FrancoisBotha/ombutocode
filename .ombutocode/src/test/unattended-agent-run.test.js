const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

const {
  DEFAULT_TIMEOUTS_MS,
  buildUnattendedInvocation,
  parseAgentOutput,
  runUnattendedAgent
} = require('../src/main/unattendedAgentRun');

const claudeTemplate = {
  command: 'claude',
  args: ['--print', '--model', '{{modelId}}', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--add-dir', '{{workingDirectory}}'],
  stdin: 'Implement ticket {{ticketId}}'
};
const codexTemplate = { command: 'codex', args: ['exec', '--sandbox', 'workspace-write', '-C', '{{workingDirectory}}'], stdin: 'x' };
const kimiTemplate = { command: 'kimi', args: ['--print', '--work-dir', '{{repoRoot}}', '--prompt', 'Implement {{ticketId}}'], stdin: null };
const inlineTemplate = { command: 'agent', args: ['--flag', 'the prompt'], stdin: null };

test('claude templates take the prompt on stdin and are forced to --output-format json', () => {
  const inv = buildUnattendedInvocation(claudeTemplate, 'PROMPT', 'C:/proj', { modelId: 'claude-opus-4-7' });
  assert.equal(inv.command, 'claude');
  assert.deepEqual(inv.args, ['--print', '--model', 'claude-opus-4-7', '--output-format', 'json', '--dangerously-skip-permissions', '--add-dir', 'C:/proj']);
  assert.equal(inv.stdinData, 'PROMPT');
  assert.equal(inv.jsonOutput, true);
});

test('codex exec and kimi --prompt templates are handled; plain templates append the prompt', () => {
  const codex = buildUnattendedInvocation(codexTemplate, 'PROMPT', '/p');
  assert.deepEqual(codex.args, ['exec', '--sandbox', 'workspace-write', '-C', '/p']);
  assert.equal(codex.stdinData, 'PROMPT');

  const kimi = buildUnattendedInvocation(kimiTemplate, 'PROMPT', '/p');
  assert.deepEqual(kimi.args, ['--print', '--work-dir', '/p', '--prompt', 'PROMPT']);
  assert.equal(kimi.stdinData, null);

  const inline = buildUnattendedInvocation(inlineTemplate, 'PROMPT', '/p');
  assert.deepEqual(inline.args, ['--flag', 'PROMPT']);
  assert.equal(inline.stdinData, null);
});

test('parseAgentOutput extracts result text and usage from claude json, codex token lines, or passes text through', () => {
  const claude = parseAgentOutput(JSON.stringify({
    type: 'result', result: 'thinking...\nDONE - EPIC WRITTEN docs/Epics/epic_02_X.md',
    usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 1, cache_read_input_tokens: 2 },
    total_cost_usd: 0.05
  }));
  assert.equal(claude.text, 'thinking...\nDONE - EPIC WRITTEN docs/Epics/epic_02_X.md');
  assert.deepEqual(claude.tokens, { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 1, cache_read_input_tokens: 2, total_cost_usd: 0.05, source: 'claude-json' });

  const stream = parseAgentOutput('{"type":"system"}\n{"type":"assistant"}\n{"type":"result","result":"DONE - TICKETS WRITTEN","usage":{"input_tokens":3,"output_tokens":4}}\n');
  assert.equal(stream.text, 'DONE - TICKETS WRITTEN');
  assert.equal(stream.tokens.input_tokens, 3);

  const codex = parseAgentOutput('did things\nDONE - TICKETS WRITTEN\ntokens used: 12,345\n');
  assert.equal(codex.tokens.total_tokens, 12345);
  assert.match(codex.text, /DONE - TICKETS WRITTEN/);

  const plain = parseAgentOutput('just text\nDONE - EPIC WRITTEN x.md');
  assert.equal(plain.tokens, null);
  assert.equal(plain.text, 'just text\nDONE - EPIC WRITTEN x.md');
});

function fakeSpawn({ stdout = '', stderr = '', code = 0, delayMs = 5, error = null, onSpawn = null } = {}) {
  return (command, args, options) => {
    const child = new EventEmitter();
    child.pid = 4242;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { chunks: [], write(c) { this.chunks.push(c); }, end() { this.ended = true; }, on() {} };
    child.killed = null;
    child.kill = (signal) => { child.killed = signal; setTimeout(() => child.emit('close', null, signal), 2); };
    if (onSpawn) onSpawn({ command, args, options, child });
    setTimeout(() => {
      if (error) { child.emit('error', error); return; }
      if (stdout) child.stdout.emit('data', Buffer.from(stdout));
      if (stderr) child.stderr.emit('data', Buffer.from(stderr));
      if (code !== 'hang') setTimeout(() => child.emit('close', code, null), 2);
    }, delayMs);
    return child;
  };
}

test('runUnattendedAgent streams a transcript to run-output, logs start/finish and returns parsed text + tokens', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-unattended-'));
  const runOutputDir = path.join(root, '.ombutocode', 'run-output');
  const logs = [];
  let spawned = null;
  const result = await runUnattendedAgent({
    projectRoot: root,
    agent: 'claude',
    modelId: 'claude-opus-4-7',
    prompt: 'THE PROMPT',
    stage: 'epic',
    runOutputDir,
    appendAgentLog: (e) => logs.push(e),
    resolveTemplateConfig: () => claudeTemplate,
    spawnImpl: fakeSpawn({
      stdout: JSON.stringify({ type: 'result', result: 'ok\nDONE - EPIC WRITTEN docs/Epics/epic_02_X.md', usage: { input_tokens: 5, output_tokens: 6 }, total_cost_usd: 0.01 }),
      stderr: 'warn line\n',
      onSpawn: (s) => { spawned = s; }
    })
  });

  assert.equal(result.state, 'completed');
  assert.equal(result.exitCode, 0);
  assert.equal(result.timedOut, false);
  assert.equal(result.stage, 'epic');
  assert.match(result.runId, /^cli-epic-/);
  assert.equal(result.text, 'ok\nDONE - EPIC WRITTEN docs/Epics/epic_02_X.md');
  assert.equal(result.tokens.input_tokens, 5);
  assert.equal(result.tokens.total_cost_usd, 0.01);
  assert.equal(spawned.command, 'claude');
  assert.equal(spawned.options.cwd, root);
  assert.equal(spawned.options.shell, process.platform === 'win32');
  assert.deepEqual(spawned.child.stdin.chunks, ['THE PROMPT']);
  assert.equal(spawned.child.stdin.ended, true);

  const transcript = fs.readFileSync(result.logPath, 'utf-8');
  assert.match(transcript, /^# epic run cli-epic-/);
  assert.match(transcript, /"type":"result"/);
  assert.match(transcript, /warn line/);
  assert.match(transcript, /# finished .* state=completed exit=0/);
  assert.equal(path.dirname(result.logPath), runOutputDir);
  assert.match(result.log, /^\.ombutocode[\\/]run-output[\\/]epic-/);

  assert.deepEqual(logs.map((e) => e.event), ['run_started', 'run_finished']);
  assert.equal(logs[0].ticketId, 'CLI-EPIC');
  assert.equal(logs[0].agentName, 'claude');
  assert.equal(logs[1].exitCode, 0);
  assert.equal(logs[1].durationMs >= 0, true);
  assert.deepEqual(logs[1].tokens, result.tokens);
});

test('runUnattendedAgent reports timeouts and non-zero exits without throwing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-unattended-'));
  const runOutputDir = path.join(root, 'out');
  const common = { projectRoot: root, agent: 'codex', prompt: 'p', stage: 'tickets', runOutputDir, resolveTemplateConfig: () => codexTemplate };

  const timedOut = await runUnattendedAgent({ ...common, timeoutMs: 20, spawnImpl: fakeSpawn({ stdout: 'partial', code: 'hang' }) });
  assert.equal(timedOut.timedOut, true);
  assert.equal(timedOut.state, 'timeout');
  assert.match(fs.readFileSync(timedOut.logPath, 'utf-8'), /partial[\s\S]*# timeout after 20ms/);

  const failed = await runUnattendedAgent({ ...common, spawnImpl: fakeSpawn({ stderr: 'boom', code: 7 }) });
  assert.equal(failed.state, 'failed');
  assert.equal(failed.exitCode, 7);
  assert.equal(failed.stderr, 'boom');

  const spawnError = await runUnattendedAgent({ ...common, logger: { error() {} }, spawnImpl: fakeSpawn({ error: new Error('ENOENT') }) });
  assert.equal(spawnError.state, 'failed');
  assert.match(spawnError.error, /ENOENT/);

  assert.equal(DEFAULT_TIMEOUTS_MS.epic, 30 * 60 * 1000);
  assert.equal(DEFAULT_TIMEOUTS_MS.tickets, 20 * 60 * 1000);
});
