const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { extractImplTestMarkers } = require('../src/main/runLifecycle');

const templates = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../codingagent-templates.json'), 'utf-8')
);
const TEST_TEMPLATES = ['claude_test', 'codex_test', 'kimi_test'];

test('the test phase passes a docs-only ticket without demanding a marker', () => {
  for (const name of TEST_TEMPLATES) {
    const prompt = JSON.stringify(templates[name]);
    assert.ok(
      prompt.includes('NON-CODE TICKETS (check this first)'),
      `${name} should classify non-code tickets before anything else`
    );
    assert.ok(
      prompt.includes('no unit-testable code changed (docs/content only)'),
      `${name} should report a PASS for docs-only diffs`
    );
    assert.ok(
      prompt.includes('Do NOT require a `TESTS_SKIPPED:` marker for these'),
      `${name} should not require a skip marker for docs-only diffs`
    );
    // A retry cannot fix a missing marker on a docs ticket — the diff is the same.
    assert.ok(
      /false negative that no retry can fix/.test(prompt),
      `${name} should say why this was a repeat failure`
    );
    for (const ext of ['*.md', '*.html', '*.css', '*.svg']) {
      assert.ok(prompt.includes(ext), `${name} should list ${ext} as non-code`);
    }
  }
});

test('the test phase is told where the skip marker actually lives', () => {
  for (const name of TEST_TEMPLATES) {
    const prompt = JSON.stringify(templates[name]);
    assert.ok(prompt.includes('tests_skipped_reason'), `${name} should read the ticket field`);
    assert.ok(
      prompt.includes('Do NOT look in git commit messages'),
      `${name} should rule out commit messages — the reported false-failure looked there`
    );
  }
});

test('impl markers are extracted from agent output', () => {
  const output = [
    'Implemented the help page changes.',
    'TESTS_SKIPPED: docs-only ticket, only public/help.html changed',
    'TEST_COMMAND: none',
    'Done.'
  ].join('\n');

  const markers = extractImplTestMarkers(output);
  assert.equal(markers.testsSkipped, 'docs-only ticket, only public/help.html changed');
  assert.equal(markers.testCommand, 'none');
  assert.equal(markers.testsAdded, null);
});

test('impl marker extraction tolerates backticks and stray whitespace', () => {
  const markers = extractImplTestMarkers('  `TESTS_ADDED: test/foo.test.js, test/bar.test.js`  ');
  assert.equal(markers.testsAdded, 'test/foo.test.js, test/bar.test.js');

  // Markers must own their line — a mention mid-sentence is prose, not a marker.
  const prose = extractImplTestMarkers('I would normally emit TESTS_SKIPPED: but there is nothing here');
  assert.equal(prose.testsSkipped, null);

  // An empty marker is not a rationale.
  assert.equal(extractImplTestMarkers('TESTS_SKIPPED:').testsSkipped, null);
  assert.equal(extractImplTestMarkers('').testsSkipped, null);
});

test('both run-finished paths persist the markers onto the ticket', () => {
  const paths = [
    ['coreCallbacks', '../src/main/coreCallbacks.js'],
    ['main', '../main.js'],
  ];
  for (const [name, rel] of paths) {
    const src = fs.readFileSync(path.join(__dirname, rel), 'utf-8');
    assert.ok(src.includes('extractImplTestMarkers'), `${name} should extract the markers`);
    assert.ok(
      src.includes('ticket.tests_skipped_reason = markers.testsSkipped'),
      `${name} should store the skip reason on the ticket`
    );
    assert.ok(
      /appendTicketNote\(ticket, `TESTS_SKIPPED: /.test(src),
      `${name} should also copy it into notes`
    );
    // Only implementation runs carry these markers.
    assert.ok(
      /previousStatus === 'in_progress' && !run\.isTest && !run\.isEval/.test(src),
      `${name} should only parse markers from an implementation run`
    );
  }
});

test('the impl prompt says the markers go in the output, not the commit', () => {
  for (const name of ['claude', 'codex', 'kimi']) {
    const prompt = JSON.stringify(templates[name]);
    assert.ok(
      prompt.includes('never only in a commit message'),
      `${name} should tell the agent where the markers go`
    );
  }
});
