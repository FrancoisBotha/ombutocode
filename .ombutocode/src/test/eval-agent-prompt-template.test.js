const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function readAgentsTemplate() {
  const configPath = path.resolve(__dirname, '..', '..', 'codingagent-templates.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function getPrompt(template) {
  if (typeof template?.stdin === 'string' && template.stdin) {
    return template.stdin;
  }
  const args = Array.isArray(template?.args) ? template.args : [];
  const promptIndex = args.indexOf('--prompt');
  if (promptIndex >= 0) {
    return String(args[promptIndex + 1] || '');
  }
  return args.length > 0 ? String(args[args.length - 1] || '') : '';
}

test('eval prompt templates require parseable failure_reason and suggestion fields', () => {
  const config = readAgentsTemplate();
  const evalTemplates = ['kimi_eval', 'codex_eval', 'claude_eval'];

  for (const key of evalTemplates) {
    const prompt = getPrompt(config[key]);
    assert.notEqual(prompt, '', `${key} prompt must exist`);
    assert.match(prompt, /For FAIL criteria, you MUST include failure_reason and suggestion fields/i);
    assert.match(prompt, /failure_reason:/i);
    assert.match(prompt, /suggestion:/i);
  }
});
