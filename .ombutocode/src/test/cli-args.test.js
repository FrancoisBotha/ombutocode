const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCliArgs, EXIT_USAGE, EXIT_OK } = require('../src/cli/args');

const argv = (...rest) => ['node', 'headless.js', ...rest];

test('epic create parses every documented option', () => {
  const parsed = parseCliArgs(argv('epic', 'create', '--input', 'spec.md', '--agent', 'claude', '--model', 'opus-4.7',
    '--skill', 'Unattended', '--no-commit', '--timeout-sec', '90', '--json', '--project', '/tmp/p'));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command, 'epic');
  assert.equal(parsed.subcommand, 'create');
  assert.deepEqual(parsed.options, {
    input: 'spec.md',
    agent: 'claude',
    model: 'opus-4.7',
    skill: 'Unattended',
    noCommit: true,
    timeoutSec: 90,
    json: true,
    project: '/tmp/p'
  });
});

test('epic create requires --input', () => {
  const parsed = parseCliArgs(argv('epic', 'create'));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.exitCode, EXIT_USAGE);
  assert.match(parsed.error, /--input/);
});

test('epic create rejects unknown options and missing values', () => {
  assert.equal(parseCliArgs(argv('epic', 'create', '--input', 'x', '--bogus')).exitCode, EXIT_USAGE);
  assert.equal(parseCliArgs(argv('epic', 'create', '--input')).exitCode, EXIT_USAGE);
  assert.equal(parseCliArgs(argv('epic', 'create', '--input', 'x', '--timeout-sec', 'soon')).exitCode, EXIT_USAGE);
  assert.equal(parseCliArgs(argv('epic', 'delete')).exitCode, EXIT_USAGE);
});

test('tickets create defaults status to todo and then demands --assignee', () => {
  const missing = parseCliArgs(argv('tickets', 'create', '--epic', 'x.md'));
  assert.equal(missing.ok, false);
  assert.match(missing.error, /--assignee/);

  const backlog = parseCliArgs(argv('tickets', 'create', '--epic', 'x.md', '--status', 'backlog'));
  assert.equal(backlog.ok, true);
  assert.equal(backlog.options.status, 'backlog');
  assert.equal(backlog.options.assignee, undefined);

  const todo = parseCliArgs(argv('tickets', 'create', '--epic=Epics/x.md', '--assignee=claude:opus-4.7'));
  assert.equal(todo.ok, true);
  assert.equal(todo.options.status, 'todo');
  assert.equal(todo.options.epic, 'Epics/x.md');
  assert.equal(todo.options.assignee, 'claude:opus-4.7');

  assert.equal(parseCliArgs(argv('tickets', 'create', '--epic', 'x.md', '--assignee', 'claude', '--status', 'done')).exitCode, EXIT_USAGE);
});

test('run defaults --until drained when --json or --max-seconds is given', () => {
  assert.equal(parseCliArgs(argv('run')).options.until, undefined);
  assert.equal(parseCliArgs(argv('run', '--json')).options.until, 'drained');
  assert.equal(parseCliArgs(argv('run', '--max-seconds', '600')).options.until, 'drained');
  const full = parseCliArgs(argv('run', '--until', 'drained', '--profile', 'benchmark', '--stall-minutes', '2', '--max-merge-reverts', '1', '--poll-seconds', '1'));
  assert.equal(full.ok, true);
  assert.deepEqual(full.options, { until: 'drained', profile: 'benchmark', stallMinutes: 2, maxMergeReverts: 1, pollSeconds: 1 });
  assert.equal(parseCliArgs(argv('run', '--until', 'forever')).exitCode, EXIT_USAGE);
});

test('status accepts only --json and --project', () => {
  assert.deepEqual(parseCliArgs(argv('status', '--json')).options, { json: true });
  assert.equal(parseCliArgs(argv('status', 'extra')).exitCode, EXIT_USAGE);
  assert.equal(parseCliArgs(argv('status', '--agent', 'x')).exitCode, EXIT_USAGE);
});

test('unknown commands and --help are reported', () => {
  const unknown = parseCliArgs(argv('frobnicate'));
  assert.equal(unknown.ok, false);
  assert.equal(unknown.exitCode, EXIT_USAGE);
  const help = parseCliArgs(argv('run', '--help'));
  assert.equal(help.help, true);
  assert.equal(help.exitCode, EXIT_OK);
  assert.match(help.usage, /Exit codes/);
});
