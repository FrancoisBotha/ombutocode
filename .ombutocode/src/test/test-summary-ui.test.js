const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf-8');

const panel = read('../src/renderer/components/TestSummaryPanel.vue');
const kanban = read('../src/renderer/components/KanbanColumn.vue');
const backlogDetail = read('../src/renderer/components/BacklogDetail.vue');
const archive = read('../src/renderer/components/ArchiveTable.vue');

test('the panel renders every field the test phase writes', () => {
  // Shape produced by buildTestSummary() in runLifecycle.js.
  assert.ok(/raw\.verdict/.test(panel) && /test-verdict-badge/.test(panel), 'verdict');
  assert.ok(/summary\.timestamp/.test(panel), 'timestamp');
  assert.ok(/summary\.value\?\.checks/.test(panel) && /test-checklist/.test(panel), 'per-check results');
  assert.ok(/summary\.raw_excerpt/.test(panel), 'raw excerpt fallback');
  assert.ok(/check\.details/.test(panel), 'per-check details');

  // The three checks the test prompt mandates get readable labels.
  for (const name of ['UNIT_TESTS', 'LINT_CHECK', 'TYPE_CHECK']) {
    assert.ok(panel.includes(name), `${name} should be labelled`);
  }

  // Same visual vocabulary as the eval summary panel.
  assert.ok(panel.includes('is-pass') && panel.includes('is-fail'), 'pass/fail badge classes');
  assert.ok(/mdi-check-circle/.test(panel) && /mdi-close-circle/.test(panel), 'pass/fail icons');
});

test('the panel only renders a real verdict', () => {
  // A missing or malformed test_summary must render nothing at all, rather
  // than an empty panel on every ticket that has never run the test phase.
  assert.ok(
    /verdict !== 'PASS' && verdict !== 'FAIL'/.test(panel),
    'anything other than PASS/FAIL should be treated as absent'
  );
  assert.ok(/v-if="summary"/.test(panel), 'the whole panel is conditional');
});

test('test_summary is surfaced everywhere eval_summary is', () => {
  const places = [
    ['KanbanColumn', kanban, 'selectedTask'],
    ['BacklogDetail', backlogDetail, 'ticket'],
    ['ArchiveTable', archive, 'selectedTicket'],
  ];
  for (const [name, content, subject] of places) {
    assert.ok(content.includes('TestSummaryPanel'), `${name} should import the panel`);
    assert.ok(
      content.includes(`<TestSummaryPanel`) && content.includes(`:ticket="${subject}"`),
      `${name} should pass its selected ticket to the panel`
    );
    // The eval summary is rendered in the same view — the two should sit together.
    assert.ok(content.includes('eval_summary'), `${name} renders eval summary (sanity)`);
  }
});

test('a failed test phase is visible on the board card', () => {
  // Previously only eval failures carried a badge, so a ticket bounced back to
  // todo by the test phase looked identical to one never started.
  assert.ok(kanban.includes('isTestFailure'), 'KanbanColumn should detect a test failure');
  assert.ok(
    /columnId === 'todo' && isTestFailure\(task\)/.test(kanban),
    'the badge should show on todo cards, matching the eval badge'
  );
  assert.ok(/>Test failed</.test(kanban), 'the badge should say what failed');
});

test('the test phase still writes the structured summary the UI reads', () => {
  const runLifecycle = read('../src/main/runLifecycle.js');
  assert.ok(/function buildTestSummary/.test(runLifecycle), 'builder exists');
  assert.ok(/verdict: normalizedVerdict/.test(runLifecycle), 'writes verdict');
  assert.ok(/summary\.raw_excerpt = /.test(runLifecycle), 'writes raw excerpt when unparseable');
  assert.ok(
    /check_name: label,[\s\S]*?result: match\[1\]\.toUpperCase\(\)/.test(runLifecycle),
    'writes per-check name and result'
  );
});
