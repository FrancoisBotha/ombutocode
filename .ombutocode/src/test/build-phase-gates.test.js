const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { extractImplTestMarkers } = require('../src/main/runLifecycle');

const templates = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../codingagent-templates.json'), 'utf-8')
);
const IMPL = ['claude', 'codex', 'kimi'];
const TEST_PHASE = ['claude_test', 'codex_test', 'kimi_test'];

const skill = fs.readFileSync(
  path.join(__dirname, '../../templates/skills/Bootstrapping/Initiate Stack.md'),
  'utf-8'
);
const skillDocsCopy = fs.readFileSync(
  path.join(__dirname, '../../../docs/Skills/Bootstrapping/Initiate Stack.md'),
  'utf-8'
);

test('the build agent runs its own gates instead of deferring everything', () => {
  for (const name of IMPL) {
    const prompt = JSON.stringify(templates[name]);
    assert.ok(prompt.includes('BUILD-PHASE GATES'), `${name} should define build-phase gates`);
    assert.ok(prompt.includes('test-strategy.md'), `${name} should read the project test strategy`);
    assert.ok(
      prompt.includes('section 10') || prompt.includes('Section 10'),
      `${name} should point at the phase-gates section`
    );
    // The old blanket rule is what stopped lint ever running in this phase.
    assert.ok(
      !/Do NOT run project-wide lint or full-suite tests — the test phase handles those/.test(prompt),
      `${name} should no longer forbid linting outright`
    );
    // Budget protection must survive the change.
    assert.ok(prompt.includes('DO NOT RUN'), `${name} should keep an explicit must-not-run list`);
    assert.ok(/full test suite/i.test(prompt), `${name} should still exclude the full suite`);
  }
});

test('gates are scoped to the ticket\'s own files', () => {
  for (const name of IMPL) {
    const prompt = JSON.stringify(templates[name]);
    assert.ok(
      prompt.includes('ON THE FILES YOU CHANGED ONLY'),
      `${name} should scope gates to changed files`
    );
    assert.ok(
      /PRE-EXISTING failures in files you did NOT touch are not yours/.test(prompt),
      `${name} should exempt pre-existing failures`
    );
    // Auto-fix is allowed, but only inside the ticket's diff.
    assert.ok(
      /do NOT reformat files this ticket did not touch/.test(prompt),
      `${name} should keep the formatter inside the ticket's diff`
    );
  }
});

test('a project without a linter is a supported case, not a failure', () => {
  for (const name of IMPL) {
    const prompt = JSON.stringify(templates[name]);
    assert.ok(
      /Rows marked `none` mean this project genuinely has no such tool/.test(prompt),
      `${name} should treat a missing tool as a normal answer`
    );
    assert.ok(
      /do not install one/.test(prompt),
      `${name} should not add tooling to satisfy a gate`
    );
  }
  // And the strategy template must invite that answer rather than assume tools.
  assert.ok(/every row is optional/.test(skill), 'section 10 should mark rows optional');
  assert.ok(/none — <short reason>/.test(skill), 'section 10 should show the none form');
  assert.ok(/Do NOT invent a tool/.test(skill), 'section 10 should forbid inventing tools');
});

test('the strategy explains how to split tests across phases', () => {
  assert.ok(/## 10\. Phase gates/.test(skill), 'section 10 exists');
  assert.ok(/Splitting the tests themselves/.test(skill), 'tests are split by phase, not just checks');
  assert.ok(/Build agent runs:/.test(skill), 'names what the build agent runs');
  assert.ok(/Test agent only:/.test(skill), 'names what only the test agent runs');
  assert.ok(/Regression closeout ticket only:/.test(skill), 'names what only the closeout runs');
  // Language-agnostic: examples must span more than one ecosystem.
  for (const stack of ['TypeScript', 'Go', 'Python', 'C with make']) {
    assert.ok(skill.includes(stack), `section 10 should show a ${stack} example`);
  }
  assert.equal(skill, skillDocsCopy, 'template and docs copy of the skill should match');
});

test('the section count in the skill was updated with the new section', () => {
  assert.ok(/10 mandatory sections/.test(skill), 'the section count should say 10');
  assert.ok(!/9 mandatory sections/.test(skill), 'no stale 9-section references');
});

test('the test phase defers to section 10 for its commands', () => {
  for (const name of TEST_PHASE) {
    const prompt = JSON.stringify(templates[name]);
    assert.ok(
      prompt.includes('section 10 (Phase gates)'),
      `${name} should take commands from section 10 when present`
    );
    assert.ok(
      /A row marked `none` means the project genuinely has no such tool/.test(prompt),
      `${name} should accept none as an answer`
    );
  }
});

test('the BUILD_GATES marker is emitted and persisted', () => {
  for (const name of IMPL) {
    assert.ok(
      JSON.stringify(templates[name]).includes('BUILD_GATES:'),
      `${name} should emit the gates marker`
    );
  }

  const markers = extractImplTestMarkers('BUILD_GATES: format=APPLIED lint=PASS type=NONE tests=PASS');
  assert.equal(markers.buildGates, 'format=APPLIED lint=PASS type=NONE tests=PASS');

  for (const rel of ['../src/main/coreCallbacks.js', '../main.js']) {
    const src = fs.readFileSync(path.join(__dirname, rel), 'utf-8');
    assert.ok(
      src.includes('ticket.build_gates = markers.buildGates'),
      `${rel} should persist the gates result on the ticket`
    );
  }
});
