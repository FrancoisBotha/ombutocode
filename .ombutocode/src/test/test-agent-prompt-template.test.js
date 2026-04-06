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

test('test prompt templates use sandbox-safe mac swift test command', () => {
  const config = readAgentsTemplate();
  const testTemplates = ['kimi_test', 'codex_test', 'claude_test'];

  for (const key of testTemplates) {
    const prompt = getPrompt(config[key]);
    assert.notEqual(prompt, '', `${key} prompt must exist`);
    assert.match(prompt, /swift test --disable-sandbox --scratch-path \{\{workingDirectory\}\}\/mac\/\.build 2>&1/);
    assert.match(prompt, /HOME=\{\{workingDirectory\}\}\/\.ombutocode-home/);
    assert.match(prompt, /XDG_CACHE_HOME=\{\{workingDirectory\}\}\/\.cache/);
    assert.match(prompt, /CLANG_MODULE_CACHE_PATH=\{\{workingDirectory\}\}\/\.cache\/clang-modules/);
  }
});
