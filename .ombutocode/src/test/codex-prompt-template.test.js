const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function readAgentsTemplate() {
  const configPath = path.resolve(__dirname, '..', '..', 'codingagent-templates.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

test('codex implementation prompt is passed after -- to avoid option parsing', () => {
  const config = readAgentsTemplate();
  const args = config.codex?.args || [];

  assert.equal(args[4], '{{workingDirectory}}');
  assert.equal(args[5], '--');
  assert.match(String(args[6] || ''), /Implement ticket \{\{ticketId\}\}/);
});

test('codex test and eval templates run in workingDirectory', () => {
  const config = readAgentsTemplate();

  assert.equal(config.codex_test?.args?.[4], '{{workingDirectory}}');
  assert.equal(config.codex_eval?.args?.[4], '{{workingDirectory}}');
});

test('codex merge-resolve prompt is passed after -- to avoid option parsing', () => {
  const config = readAgentsTemplate();
  const args = config.codex_merge_resolve?.args || [];

  assert.equal(args[4], '{{workingDirectory}}');
  assert.equal(args[5], '--');
  assert.match(String(args[6] || ''), /Merge-resolve ticket \{\{ticketId\}\}/);
});
