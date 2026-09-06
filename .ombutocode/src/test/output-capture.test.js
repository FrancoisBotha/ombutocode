const test = require('node:test');
const assert = require('node:assert/strict');

const { createOutputCapture } = require('../src/main/codingAgentRuntime');
const { extractTextFromStreamJson } = require('../src/main/runLifecycle');

function toolResultLine(i, size) {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t${i}`, content: 'x'.repeat(size) }] } });
}
function assistantLine(text) {
  return JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
}
function resultLine(text) {
  return JSON.stringify({ type: 'result', subtype: 'success', result: text, total_cost_usd: 0.5 });
}

test('an eval verdict written after the size cap is filled still survives (head-keeping capture)', () => {
  // Reproduces the terminal-bench_task failure: the evaluator reads files
  // worth far more than the cap, then writes EVALUATION_RESULT last.
  const cap = 20000;
  const c = createOutputCapture({ keepHead: true, maxChars: cap });
  c.append(assistantLine('Let me read the changed files.') + '\n');
  for (let i = 0; i < 40; i++) c.append(toolResultLine(i, 2000) + '\n');
  c.append(assistantLine('EVALUATION_RESULT: PASS\nACCEPTANCE_CRITERIA_CHECKS:\n- PASS: everything | evidence: x\nEPIC_REFERENCE_CHECK: PASS | evidence: y') + '\n');
  c.append(resultLine('EVALUATION_RESULT: PASS') + '\n');

  assert.equal(c.truncated, true);
  const out = c.toString();
  assert.ok(out.length < cap + 2000, `bulk stays near the cap (got ${out.length})`);
  const text = extractTextFromStreamJson(out);
  assert.match(text, /EVALUATION_RESULT: PASS/);
  assert.match(text, /EPIC_REFERENCE_CHECK: PASS/);
});

test('tail-keeping capture (implementation runs) keeps recent bulk and all assistant text', () => {
  const cap = 5000;
  const c = createOutputCapture({ keepHead: false, maxChars: cap });
  c.append(assistantLine('first words') + '\n');
  for (let i = 0; i < 30; i++) c.append(toolResultLine(i, 500) + '\n');
  c.append(assistantLine('TESTS_ADDED: tests/x.test.js') + '\n');
  const out = c.toString();
  assert.equal(c.truncated, true);
  assert.match(out, /"t29"/, 'most recent bulk line kept');
  assert.doesNotMatch(out, /"t0"/, 'oldest bulk line dropped');
  const text = extractTextFromStreamJson(out);
  assert.match(text, /first words/);
  assert.match(text, /TESTS_ADDED/);
});

test('chunks that split a line mid-way are reassembled', () => {
  const c = createOutputCapture({ keepHead: true, maxChars: 100000 });
  const line = assistantLine('EVALUATION_RESULT: FAIL');
  c.append(line.slice(0, 15));
  c.append(line.slice(15) + '\n' + toolResultLine(1, 10).slice(0, 5));
  c.append(toolResultLine(1, 10).slice(5) + '\n');
  const text = extractTextFromStreamJson(c.toString());
  assert.match(text, /EVALUATION_RESULT: FAIL/);
  assert.equal(c.truncated, false);
});

test('plain (non stream-json) output falls back to a simple head/tail slice', () => {
  const head = createOutputCapture({ keepHead: true, maxChars: 50 });
  for (let i = 0; i < 20; i++) head.append(`line ${i} of plain text output\n`);
  assert.ok(head.toString().startsWith('line 0'));
  assert.equal(head.truncated, true);

  const tail = createOutputCapture({ keepHead: false, maxChars: 50 });
  for (let i = 0; i < 20; i++) tail.append(`line ${i} of plain text output\n`);
  assert.match(tail.toString(), /line 19/);
});
