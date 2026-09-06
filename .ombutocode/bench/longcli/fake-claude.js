#!/usr/bin/env node
'use strict';

/**
 * fake-claude — stand-in for `claude --print` used by the Ombuto adapter's
 * dry run (OMBUTO_FAKE_AGENT=1). It never calls a model: it reads the prompt
 * Ombuto sends on stdin, works out which pipeline phase it is being asked to
 * perform, does the minimum the phase contract requires on disk, and prints
 * the markers Ombuto parses, in Claude's `--output-format stream-json` /
 * `json` shape (see unattendedAgentRun.parseAgentOutput and
 * runLifecycle.extractTextFromStreamJson in the Ombuto source).
 *
 * Phase detection (markers taken from planningPrompts.js and
 * codingagent-templates.json):
 *   epic          prompt contains "DONE - EPIC WRITTEN"
 *   tickets       prompt contains "DONE - TICKETS WRITTEN"
 *   test          "You are in TEST mode"
 *   eval          "You are in EVAL mode"
 *   epic_eval     "EPIC EVALUATION mode"
 *   merge_resolve "Merge-resolve ticket"
 *   impl          "Implement ticket"
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const outputFormat = argValue('--output-format') || 'text';
const cliModel = argValue('--model') || '';
const cwd = process.cwd();
const today = new Date().toISOString().slice(0, 10);

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function git(argv, options = {}) {
  const result = spawnSync('git', argv, { cwd, encoding: 'utf8', ...options });
  return { code: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function emit(text) {
  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const result = {
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 1,
    num_turns: 1,
    result: text,
    session_id: 'fake-claude',
    total_cost_usd: 0,
    usage
  };
  if (outputFormat === 'stream-json') {
    const lines = [
      { type: 'system', subtype: 'init', model: cliModel, tools: [], session_id: 'fake-claude' },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] }, session_id: 'fake-claude' },
      result
    ];
    process.stdout.write(lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  } else if (outputFormat === 'json') {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    process.stdout.write(text + '\n');
  }
}

function detectPhase(prompt) {
  if (prompt.includes('DONE - EPIC WRITTEN')) return 'epic';
  if (prompt.includes('DONE - TICKETS WRITTEN')) return 'tickets';
  if (prompt.includes('DONE - FINALIZED')) return 'finalize';
  if (/You are in TEST mode/i.test(prompt)) return 'test';
  if (/You are in EVAL mode/i.test(prompt)) return 'eval';
  if (/EPIC EVALUATION mode/i.test(prompt)) return 'epic_eval';
  if (/Merge-resolve ticket/i.test(prompt)) return 'merge_resolve';
  if (/Implement ticket/i.test(prompt)) return 'impl';
  return 'unknown';
}

// --- epic ---------------------------------------------------------------
function runEpic(prompt) {
  const refMatch = prompt.match(/reference specification at "([^"]+)"/);
  const reference = refMatch ? refMatch[1] : '(unknown)';
  const epicsDir = path.join(cwd, 'docs', 'Epics');
  fs.mkdirSync(epicsDir, { recursive: true });
  let next = 1;
  for (const name of fs.readdirSync(epicsDir)) {
    const m = name.match(/^epic_(\d+)_/i);
    if (m) next = Math.max(next, Number(m[1]) + 1);
  }
  const stem = `epic_${String(next).padStart(2, '0')}_FAKE`;
  const rel = `docs/Epics/${stem}.md`;
  const content = [
    `# Epic ${next}: Fake`,
    '',
    'Status: NEW',
    `Last Updated: ${today}`,
    '',
    '## Purpose',
    '',
    `Dry-run epic written by fake-claude from the reference specification at \`${reference}\`.`,
    'No real analysis was performed; this epic only exercises the Ombuto pipeline.',
    '',
    '## Scope',
    '',
    '- Create one marker file per ticket in the repository root.',
    '',
    '## Acceptance Criteria',
    '',
    '- [ ] `FAKE-001.txt` exists in the repository root.',
    '- [ ] `FAKE-002.txt` exists in the repository root.',
    '',
    '## Risks & Unknowns',
    '',
    '- Assumption: this is a benchmark dry run; the reference specification was not implemented.',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(cwd, rel), content);
  git(['add', '--', rel]);
  git(['commit', '-q', '-m', `docs: add ${stem}`, '--', rel]);
  emit(`Proposed epic: ${stem} (fake dry run).\nWrote ${rel} and committed it.\n\nDONE - EPIC WRITTEN ${rel}`);
}

// --- tickets ------------------------------------------------------------
function runTickets(prompt) {
  const epicMatch = prompt.match(/epic specification at "([^"]+)"/);
  const epicRef = epicMatch ? epicMatch[1] : 'docs/Epics/epic_01_FAKE.md';
  const statusMatch = prompt.match(/^- status:\s*(\S+)/m);
  const status = statusMatch ? statusMatch[1] : 'todo';
  let assignee = null;
  const assigneeMatch = prompt.match(/^- assignee:\s*(.+)$/m);
  if (assigneeMatch) {
    try { assignee = JSON.parse(assigneeMatch[1].trim()); } catch { assignee = null; }
  }
  if (!assignee) {
    assignee = { tool: 'claude', model: process.env.OMBUTO_MODEL_YML_ID || cliModel };
  }
  const base = (id, title, deps) => ({
    id,
    title,
    status,
    assignee,
    epic_ref: epicRef,
    acceptance_criteria: [`[ ] File ${id}.txt exists in the repository root and contains the ticket id`],
    dependencies: deps,
    references: { epic: epicRef },
    notes: 'Generated by fake-claude for the LongCLI dry run.',
    last_updated: today
  });
  const tickets = [
    base('FAKE-001', 'Create the FAKE-001 marker file', []),
    base('FAKE-002', 'Create the FAKE-002 marker file', ['FAKE-001'])
  ];
  const file = path.join(os.tmpdir(), `fake-tickets-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(tickets, null, 2));
  const tool = path.join(cwd, '.ombutocode', 'tools', 'ticket-write.cjs');
  const result = spawnSync(process.execPath, [tool, 'insert', file], { cwd, encoding: 'utf8' });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.status !== 0) {
    emit(`ticket-write failed (exit ${result.status}):\n${output}\n\nFAILED - NO TICKETS WRITTEN`);
    return;
  }
  emit(`| id | title | deps |\n| FAKE-001 | ${tickets[0].title} | |\n| FAKE-002 | ${tickets[1].title} | FAKE-001 |\n\n${output.trim()}\n\nDONE - TICKETS WRITTEN`);
}

// --- impl ---------------------------------------------------------------
function runImpl(prompt) {
  const idMatch = prompt.match(/Implement ticket\s+([A-Z][A-Z0-9]*-\d+)/);
  const ticketId = idMatch ? idMatch[1] : 'UNKNOWN-000';
  const file = `${ticketId}.txt`;
  fs.writeFileSync(path.join(cwd, file), `${ticketId}\nfake implementation written by fake-claude on ${new Date().toISOString()}\n`);
  emit([
    `Implemented ${ticketId} (fake dry run): wrote ${file} in ${cwd}.`,
    '',
    'BUILD_GATES: format=NONE lint=NONE type=NONE tests=NONE',
    'TESTS_SKIPPED: fake dry-run agent only writes a marker file; nothing is unit-testable',
    'TEST_COMMAND: none',
    '',
    `Files changed: ${file}`
  ].join('\n'));
}

// --- test ---------------------------------------------------------------
function runTest(prompt) {
  const idMatch = prompt.match(/Test ticket\s+([A-Z][A-Z0-9]*-\d+)/);
  const ticketId = idMatch ? idMatch[1] : 'UNKNOWN-000';
  emit([
    'TEST_RESULT: PASS',
    `UNIT_TESTS: PASS | ${ticketId}: fake dry run, marker file only (TESTS_SKIPPED honoured)`,
    'LINT_CHECK: PASS | no linter configured',
    'TYPE_CHECK: PASS | no static type checker configured',
    'FAILURE_DETAILS: none'
  ].join('\n'));
}

// --- eval ---------------------------------------------------------------
function runEval(prompt) {
  const head = prompt.match(/Evaluate ticket\s+([A-Z][A-Z0-9]*-\d+)\s+\(title:\s*([^)]*)\)\s+against epic reference\s+(\S+?)\.(?:\s|$)/);
  const ticketId = head ? head[1] : 'UNKNOWN-000';
  const epicRef = head ? head[3] : 'docs/Epics';
  const file = path.join(cwd, `${ticketId}.txt`);
  const exists = fs.existsSync(file);
  const verdict = exists ? 'PASS' : 'FAIL';
  const lines = [
    `EVALUATION_RESULT: ${verdict}`,
    'ACCEPTANCE_CRITERIA_CHECKS:',
    exists
      ? `- PASS: File ${ticketId}.txt exists in the repository root | evidence: ${file}`
      : `- FAIL: File ${ticketId}.txt exists in the repository root | failure_reason: ${file} missing | suggestion: rerun the implementation phase`,
    `EPIC_REFERENCE_CHECK: PASS | evidence: fake dry run checked ${epicRef}`,
    `SUMMARY: ${verdict} (fake dry run)`
  ];
  emit(lines.join('\n'));
}

// --- epic eval ----------------------------------------------------------
function runEpicEval(prompt) {
  const ids = [...new Set((prompt.match(/\b[A-Z][A-Z0-9]*-\d{3}\b/g) || []))];
  emit([
    'EPIC_EVALUATION_RESULT: PASS',
    'TICKETS_VERIFIED:',
    ...ids.map((id) => `- PASS: ${id} | fake ticket | all criteria marked [x]`),
    `CRITERIA_STATUS: ${ids.length}/${ids.length} criteria marked complete`,
    'EPIC_SPEC_CHECK: PASS | evidence: fake dry run',
    'SUMMARY: PASS (fake dry run)'
  ].join('\n'));
}

// --- merge resolve ------------------------------------------------------
function runMergeResolve() {
  const rebase = git(['rebase', 'main']);
  if (rebase.code === 0) {
    emit('Rebased onto main without conflicts.\n\nMERGE_RESOLVE_RESULT: SUCCESS');
    return;
  }
  git(['rebase', '--abort']);
  emit(`MERGE_RESOLVE_RESULT: FAIL\nFAILURE_REASON: git rebase main failed in fake dry run:\n${rebase.stderr}`);
}

const prompt = readStdin();
const phase = detectPhase(prompt);
try {
  fs.appendFileSync(path.join(os.tmpdir(), 'fake-claude.log'), `${new Date().toISOString()} phase=${phase} cwd=${cwd} model=${cliModel} format=${outputFormat}\n`);
} catch {
  // best effort
}
switch (phase) {
  case 'epic': runEpic(prompt); break;
  case 'tickets': runTickets(prompt); break;
  case 'impl': runImpl(prompt); break;
  case 'test': runTest(prompt); break;
  case 'eval': runEval(prompt); break;
  case 'epic_eval': runEpicEval(prompt); break;
  case 'merge_resolve': runMergeResolve(); break;
  case 'finalize':
    emit('Fake finalize: nothing to install, no acceptance commands to run in a dry run.\n\nDONE - FINALIZED');
    break;
  default:
    emit(`fake-claude: could not classify the prompt (${prompt.length} chars). First line: ${prompt.split('\n')[0]}`);
    process.exitCode = 1;
}
