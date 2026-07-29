const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  PHASE_ORDER,
  resolveRunPhase,
  recordRunLogEntry,
  groupRunsByPhase,
  truncateForPrompt,
  readPhaseTranscript,
  buildRunSummaryPrompt,
  parseRunSummaryOutput,
  deleteTicketRunLogs,
  createRunSummarizer,
  resetStaleRunSummaries
} = require('../src/main/runSummary');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'run-summary-test-'));
}

describe('resolveRunPhase', () => {
  test('defaults to impl', () => {
    assert.strictEqual(resolveRunPhase({}), 'impl');
  });

  test('maps the test and eval flags', () => {
    assert.strictEqual(resolveRunPhase({ isTest: true }), 'test');
    assert.strictEqual(resolveRunPhase({ isEval: true }), 'eval');
  });

  test('merge resolve outranks the other flags', () => {
    assert.strictEqual(resolveRunPhase({ isMergeResolve: true, isEval: true }), 'merge_resolve');
  });
});

describe('recordRunLogEntry', () => {
  test('appends entries to a ticket with no manifest', () => {
    const ticket = { id: 'T-1' };
    recordRunLogEntry(ticket, { runId: 'r1', phase: 'impl', stdoutLogFile: 'a.log' });
    assert.strictEqual(ticket.run_log_index.length, 1);
    assert.strictEqual(ticket.run_log_index[0].stdout_log_file, 'a.log');
  });

  test('replaces an entry with the same run id rather than duplicating it', () => {
    const ticket = { id: 'T-1' };
    recordRunLogEntry(ticket, { runId: 'r1', phase: 'impl', stdoutLogFile: 'old.log' });
    recordRunLogEntry(ticket, { runId: 'r1', phase: 'impl', stdoutLogFile: 'new.log' });
    assert.strictEqual(ticket.run_log_index.length, 1);
    assert.strictEqual(ticket.run_log_index[0].stdout_log_file, 'new.log');
  });

  test('falls back to impl for an unknown phase', () => {
    const ticket = { id: 'T-1' };
    recordRunLogEntry(ticket, { runId: 'r1', phase: 'nonsense' });
    assert.strictEqual(ticket.run_log_index[0].phase, 'impl');
  });
});

describe('groupRunsByPhase', () => {
  test('returns phases in lifecycle order regardless of insertion order', () => {
    const groups = groupRunsByPhase([
      { runId: 'r3', phase: 'eval' },
      { runId: 'r1', phase: 'impl' },
      { runId: 'r2', phase: 'test' }
    ]);
    assert.deepStrictEqual(groups.map(g => g.phase), ['impl', 'test', 'eval']);
  });

  test('collects repeated runs of one phase chronologically', () => {
    const groups = groupRunsByPhase([
      { runId: 'b', phase: 'impl', finishedAt: '2026-01-02T00:00:00Z' },
      { runId: 'a', phase: 'impl', finishedAt: '2026-01-01T00:00:00Z' }
    ]);
    assert.strictEqual(groups.length, 1);
    assert.deepStrictEqual(groups[0].entries.map(e => e.runId), ['a', 'b']);
  });

  test('omits phases that have no runs', () => {
    const groups = groupRunsByPhase([{ runId: 'r1', phase: 'impl' }]);
    assert.strictEqual(groups.length, 1);
  });

  test('tolerates a missing or malformed manifest', () => {
    assert.deepStrictEqual(groupRunsByPhase(undefined), []);
    assert.deepStrictEqual(groupRunsByPhase(null), []);
    assert.deepStrictEqual(groupRunsByPhase([null]), []);
  });
});

describe('truncateForPrompt', () => {
  test('leaves short text untouched', () => {
    assert.strictEqual(truncateForPrompt('hello', { head: 10, tail: 10 }), 'hello');
  });

  test('keeps both ends and marks the gap', () => {
    const text = `START${'x'.repeat(500)}END`;
    const result = truncateForPrompt(text, { head: 10, tail: 10 });
    assert.ok(result.startsWith('START'), 'head is preserved');
    assert.ok(result.endsWith('END'), 'tail is preserved');
    assert.ok(result.includes('omitted'), 'gap is signposted');
    assert.ok(result.length < text.length);
  });
});

describe('parseRunSummaryOutput', () => {
  test('parses a clean JSON response', () => {
    const parsed = parseRunSummaryOutput(JSON.stringify({
      what_changed: 'Added a parser.',
      files_touched: ['src/a.js'],
      decisions: ['Used regex'],
      problems: [],
      follow_ups: ['Add tests']
    }));
    assert.strictEqual(parsed.what_changed, 'Added a parser.');
    assert.deepStrictEqual(parsed.files_touched, ['src/a.js']);
    assert.deepStrictEqual(parsed.problems, []);
    assert.strictEqual(parsed.raw, undefined);
  });

  test('parses JSON wrapped in a code fence', () => {
    const parsed = parseRunSummaryOutput('```json\n{"what_changed":"Did a thing"}\n```');
    assert.strictEqual(parsed.what_changed, 'Did a thing');
  });

  test('parses JSON embedded in surrounding prose', () => {
    const parsed = parseRunSummaryOutput('Sure! {"what_changed":"Embedded"} Hope that helps.');
    assert.strictEqual(parsed.what_changed, 'Embedded');
  });

  test('falls back to raw text when the response is not JSON', () => {
    const parsed = parseRunSummaryOutput('The agent just rambled at length.');
    assert.strictEqual(parsed.raw, 'The agent just rambled at length.');
    assert.strictEqual(parsed.what_changed, '');
    assert.deepStrictEqual(parsed.files_touched, []);
  });

  test('coerces a string into a single-item list', () => {
    const parsed = parseRunSummaryOutput('{"files_touched":"src/only.js"}');
    assert.deepStrictEqual(parsed.files_touched, ['src/only.js']);
  });

  test('drops empty list entries', () => {
    const parsed = parseRunSummaryOutput('{"decisions":["real","","  "]}');
    assert.deepStrictEqual(parsed.decisions, ['real']);
  });

  test('handles empty input without throwing', () => {
    const parsed = parseRunSummaryOutput('');
    assert.strictEqual(parsed.raw, '');
  });
});

describe('readPhaseTranscript', () => {
  test('flattens stream-json into readable text', () => {
    const dir = tempDir();
    const logFile = path.join(dir, 'x.stdout.log');
    fs.writeFileSync(logFile, [
      JSON.stringify({ type: 'system', subtype: 'init' }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Implemented the parser.' }] } })
    ].join('\n'));

    const text = readPhaseTranscript([{ stdout_log_file: 'x.stdout.log' }], dir);
    assert.ok(text.includes('Implemented the parser.'));
  });

  test('skips missing files instead of throwing', () => {
    const dir = tempDir();
    const text = readPhaseTranscript([{ stdout_log_file: 'nope.log' }], dir);
    assert.strictEqual(text, '');
  });
});

describe('buildRunSummaryPrompt', () => {
  test('names the ticket and demands bare JSON', () => {
    const prompt = buildRunSummaryPrompt({
      ticket: { id: 'AUTH-001', title: 'Add login' },
      phase: 'impl',
      transcript: 'transcript body'
    });
    assert.ok(prompt.includes('AUTH-001'));
    assert.ok(prompt.includes('Add login'));
    assert.ok(prompt.includes('implementation phase'));
    assert.ok(prompt.includes('ONLY a JSON object'));
    assert.ok(prompt.includes('transcript body'));
  });
});

describe('deleteTicketRunLogs', () => {
  test('removes only the target ticket\'s files', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'T-1__a.stdout.log'), 'x');
    fs.writeFileSync(path.join(dir, 'T-1__a.stderr.log'), 'x');
    fs.writeFileSync(path.join(dir, 'T-2__b.stdout.log'), 'x');

    const removed = deleteTicketRunLogs('T-1', dir, { log() {}, error() {} });
    assert.strictEqual(removed, 2);
    assert.deepStrictEqual(fs.readdirSync(dir), ['T-2__b.stdout.log']);
  });

  test('is a no-op for a directory that does not exist', () => {
    assert.strictEqual(deleteTicketRunLogs('T-1', path.join(tempDir(), 'missing'), { log() {}, error() {} }), 0);
  });
});

/**
 * Build a summariser over a temp run-output dir with a stubbed agent call.
 */
function makeSummarizer({ ticket, respond, onUpdate = () => {} }) {
  const dir = tempDir();
  const calls = [];

  for (const entry of ticket.run_log_index || []) {
    if (!entry.stdout_log_file) continue;
    fs.writeFileSync(
      path.join(dir, path.basename(entry.stdout_log_file)),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: `output for ${entry.phase}` }] } })
    );
  }

  const stored = { ...ticket };
  const summarizer = createRunSummarizer({
    projectRoot: dir,
    runOutputDir: dir,
    resolveTemplateConfig: () => ({ command: 'stub', args: ['--print'] }),
    readSummaryAgent: () => 'claude',
    readSummaryModel: () => null,
    getTicketById: () => stored,
    updateTicketFields: (id, fields) => {
      Object.assign(stored, fields);
      onUpdate(id, fields);
    },
    runDraftCommand: async (options) => {
      calls.push(options);
      return respond(options, calls.length);
    },
    logger: { log() {}, error() {} }
  });

  return { summarizer, dir, calls, stored };
}

describe('createRunSummarizer', () => {
  const ticketWithPhases = {
    id: 'T-1',
    title: 'Something',
    run_log_index: [
      { runId: 'r1', phase: 'impl', stdout_log_file: 'T-1__r1.stdout.log' },
      { runId: 'r2', phase: 'test', stdout_log_file: 'T-1__r2.stdout.log' },
      { runId: 'r3', phase: 'eval', stdout_log_file: 'T-1__r3.stdout.log' }
    ]
  };

  test('produces one section per phase and marks the summary ready', async () => {
    const { summarizer, stored, calls } = makeSummarizer({
      ticket: ticketWithPhases,
      respond: () => ({ stdout: '{"what_changed":"did work"}' })
    });

    const result = await summarizer.summarizeTicketRuns('T-1');
    assert.strictEqual(result.status, 'ready');
    assert.strictEqual(calls.length, 3, 'one agent call per phase');
    assert.deepStrictEqual(result.sections.map(s => s.phase), ['impl', 'test', 'eval']);
    assert.strictEqual(stored.run_summary.status, 'ready');
  });

  test('deletes the logs once the summary is stored', async () => {
    const { summarizer, dir } = makeSummarizer({
      ticket: ticketWithPhases,
      respond: () => ({ stdout: '{"what_changed":"done"}' })
    });

    await summarizer.summarizeTicketRuns('T-1');
    assert.deepStrictEqual(fs.readdirSync(dir), [], 'run-output is emptied');
  });

  test('one failing phase does not lose the others', async () => {
    const { summarizer } = makeSummarizer({
      ticket: ticketWithPhases,
      respond: (_options, callNumber) => {
        if (callNumber === 2) throw new Error('agent exploded');
        return { stdout: '{"what_changed":"fine"}' };
      }
    });

    const result = await summarizer.summarizeTicketRuns('T-1');
    assert.strictEqual(result.status, 'ready');
    assert.strictEqual(result.sections.length, 3);
    assert.strictEqual(result.sections[1].error, 'agent exploded');
    assert.strictEqual(result.sections[2].what_changed, 'fine');
  });

  test('a missing ticket yields a failed summary, not a rejection', async () => {
    const dir = tempDir();
    const summarizer = createRunSummarizer({
      projectRoot: dir,
      runOutputDir: dir,
      resolveTemplateConfig: () => ({ command: 'stub', args: [] }),
      readSummaryAgent: () => 'claude',
      readSummaryModel: () => null,
      getTicketById: () => null,
      updateTicketFields: () => {},
      runDraftCommand: async () => ({ stdout: '{}' }),
      logger: { log() {}, error() {} }
    });

    const result = await summarizer.summarizeTicketRuns('ghost');
    assert.strictEqual(result.status, 'failed');
    assert.match(result.error, /not found/);
  });

  test('logs are still deleted when summarisation fails outright', async () => {
    const { summarizer, dir } = makeSummarizer({
      ticket: ticketWithPhases,
      respond: () => { throw new Error('always fails'); }
    });

    const result = await summarizer.summarizeTicketRuns('T-1');
    // Every phase errored, but the run still completed and cleaned up.
    assert.strictEqual(result.status, 'ready');
    assert.ok(result.sections.every(s => s.error === 'always fails'));
    assert.deepStrictEqual(fs.readdirSync(dir), []);
  });

  test('a ticket with no manifest is marked unavailable without calling an agent', async () => {
    const { summarizer, calls } = makeSummarizer({
      ticket: { id: 'T-1', title: 'Old ticket' },
      respond: () => ({ stdout: '{}' })
    });

    const result = await summarizer.summarizeTicketRuns('T-1');
    assert.strictEqual(result.status, 'unavailable');
    assert.strictEqual(calls.length, 0);
  });

  test('concurrent calls share one job', async () => {
    const { summarizer, calls } = makeSummarizer({
      ticket: ticketWithPhases,
      respond: () => ({ stdout: '{"what_changed":"once"}' })
    });

    const [a, b] = await Promise.all([
      summarizer.summarizeTicketRuns('T-1'),
      summarizer.summarizeTicketRuns('T-1')
    ]);
    assert.strictEqual(a, b, 'both callers get the same result object');
    assert.strictEqual(calls.length, 3, 'phases were summarised once, not twice');
  });

  test('isSummarizing reports true only while the job runs', async () => {
    const { summarizer } = makeSummarizer({
      ticket: ticketWithPhases,
      respond: () => ({ stdout: '{}' })
    });

    const pending = summarizer.summarizeTicketRuns('T-1');
    assert.strictEqual(summarizer.isSummarizing('T-1'), true);
    await pending;
    assert.strictEqual(summarizer.isSummarizing('T-1'), false);
  });

  test('the configured model reaches the agent template', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'T-1__r1.stdout.log'), 'plain output');
    const seen = [];
    const summarizer = createRunSummarizer({
      projectRoot: dir,
      runOutputDir: dir,
      resolveTemplateConfig: () => ({ command: 'claude', args: ['--print', '--model', '{{modelId}}'] }),
      readSummaryAgent: () => 'claude',
      readSummaryModel: () => 'opus-x',
      getTicketById: () => ({
        id: 'T-1',
        run_log_index: [{ runId: 'r1', phase: 'impl', stdout_log_file: 'T-1__r1.stdout.log' }]
      }),
      updateTicketFields: () => {},
      runDraftCommand: async (options) => { seen.push(options); return { stdout: '{}' }; },
      logger: { log() {}, error() {} }
    });

    await summarizer.summarizeTicketRuns('T-1');
    assert.ok(seen[0].args.includes('opus-x'), 'model id was substituted');
    assert.ok(seen[0].stdinData.includes('plain output'), '--print templates use stdin');
  });
});

describe('resetStaleRunSummaries', () => {
  test('turns an interrupted job into a failure and drops its logs', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'T-1__r1.stdout.log'), 'x');
    const updates = [];

    const count = resetStaleRunSummaries({
      listTickets: () => [
        { id: 'T-1', run_summary: { status: 'generating', started_at: 'then' } },
        { id: 'T-2', run_summary: { status: 'ready' } },
        { id: 'T-3' }
      ],
      updateTicketFields: (id, fields) => updates.push({ id, fields }),
      runOutputDir: dir,
      logger: { log() {}, error() {} }
    });

    assert.strictEqual(count, 1);
    assert.strictEqual(updates.length, 1);
    assert.strictEqual(updates[0].id, 'T-1');
    assert.strictEqual(updates[0].fields.run_summary.status, 'failed');
    assert.match(updates[0].fields.run_summary.error, /restart/);
    assert.deepStrictEqual(fs.readdirSync(dir), [], 'stranded logs are removed');
  });

  test('does nothing when no job was interrupted', () => {
    const count = resetStaleRunSummaries({
      listTickets: () => [{ id: 'T-1', run_summary: { status: 'ready' } }],
      updateTicketFields: () => { throw new Error('should not be called'); },
      runOutputDir: tempDir(),
      logger: { log() {}, error() {} }
    });
    assert.strictEqual(count, 0);
  });
});

describe('PHASE_ORDER', () => {
  test('covers every phase the lifecycle can produce', () => {
    assert.deepStrictEqual(PHASE_ORDER, ['impl', 'test', 'eval', 'merge_resolve']);
  });
});
