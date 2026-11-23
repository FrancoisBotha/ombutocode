const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  PROMPT_FILE_TOKEN,
  templateUsesPromptFile,
  writePromptFile,
  substitutePromptFile,
  removePromptFile
} = require('../src/main/promptFile');
const { AgentRuntime, resolveAgentTemplateConfig, renderCommand, parseTemplate } = require('../src/main/codingAgentRuntime');
const { buildUnattendedInvocation } = require('../src/main/unattendedAgentRun');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const yaml = require('js-yaml');

// --- promptFile helpers ---

test('writePromptFile / removePromptFile round-trip the prompt text', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-prompt-test-'));
  const file = writePromptFile('Implement ticket T-1\nline two', { dir });
  assert.equal(fs.readFileSync(file, 'utf-8'), 'Implement ticket T-1\nline two');
  removePromptFile(file);
  assert.equal(fs.existsSync(file), false);
  removePromptFile(file); // already gone: no throw
});

test('substitutePromptFile replaces the token and quotes spaced paths only under a shell', () => {
  const args = ['--prompt-file', PROMPT_FILE_TOKEN, '--always-approve'];
  assert.deepEqual(substitutePromptFile(args, '/tmp/p.md'), ['--prompt-file', '/tmp/p.md', '--always-approve']);
  assert.deepEqual(substitutePromptFile(args, 'C:\\My Temp\\p.md', { shell: true })[1], '"C:\\My Temp\\p.md"');
  assert.deepEqual(substitutePromptFile(args, 'C:\\My Temp\\p.md', { shell: false })[1], 'C:\\My Temp\\p.md');
});

test('shipped Grok agent is enabled so cards can assign it', () => {
  const doc = yaml.load(fs.readFileSync(path.join(PROJECT_ROOT, '.ombutocode', 'codingagents', 'codingagents.yml'), 'utf-8'));
  const grok = (doc.tools || []).find((tool) => tool.id === 'grok');
  assert.ok(grok, 'codingagents.yml should define grok');
  assert.equal(grok.enabled, true);
  assert.ok((grok.models || []).some((model) => model.id === 'grok-4.6' && model.enabled !== false));
});

// --- shipped Grok templates ---

test('every Grok template variant resolves to a prompt-file headless invocation', () => {
  for (const templateVariant of [null, 'test', 'eval', 'merge_resolve', 'epic_eval']) {
    const template = resolveAgentTemplateConfig(PROJECT_ROOT, 'grok', templateVariant ? { templateVariant } : {});
    assert.equal(template.command, 'grok', String(templateVariant));
    assert.ok(templateUsesPromptFile(template), `${templateVariant}: promptFile kept by parseTemplate`);
    assert.ok(template.promptFile.length > 1000, `${templateVariant}: prompt text present`);
    assert.equal(template.stdin, null, 'Grok headless mode does not read stdin');
    const i = template.args.indexOf('--prompt-file');
    assert.equal(template.args[i + 1], PROMPT_FILE_TOKEN);
    assert.ok(template.args.includes('--always-approve'));
    assert.ok(template.args.includes('--model'));
  }
});

test('renderCommand fills the Grok prompt and drops an empty model selection', () => {
  const template = resolveAgentTemplateConfig(PROJECT_ROOT, 'grok');
  const payload = {
    ticketId: 'GROK-001', epicRef: 'docs/Epics/epic_X.md', title: 'Add thing',
    repoRoot: PROJECT_ROOT, modelId: '', retryContext: '', acceptanceCriteria: '1. works', ticketFilePath: '/t/GROK-001.json'
  };
  const rendered = renderCommand(template, payload, 'run-1', PROJECT_ROOT);
  assert.match(rendered.promptFileText, /GROK-001/);
  assert.ok(!rendered.promptFileText.includes('{{ticketId}}'));
  assert.ok(!rendered.args.includes('--model'), 'CLI default model when none selected');

  const withModel = renderCommand(template, { ...payload, modelId: 'grok-4.6' }, 'run-1', PROJECT_ROOT);
  assert.equal(withModel.args[withModel.args.indexOf('--model') + 1], 'grok-4.6');
});

// --- headless planning runner ---

test('buildUnattendedInvocation writes the prompt to a file for prompt-file templates', () => {
  const template = parseTemplate({
    command: 'grok',
    args: ['--prompt-file', PROMPT_FILE_TOKEN, '--always-approve', '--model', '{{modelId}}'],
    promptFile: 'ignored template text'
  });
  const invocation = buildUnattendedInvocation(template, 'Write the epic', PROJECT_ROOT, { modelId: 'grok-4.6' });
  try {
    assert.equal(invocation.stdinData, null);
    assert.ok(invocation.promptFilePath);
    assert.equal(fs.readFileSync(invocation.promptFilePath, 'utf-8'), 'Write the epic');
    const fileArg = invocation.args[invocation.args.indexOf('--prompt-file') + 1].replace(/^"|"$/g, '');
    assert.equal(fileArg, invocation.promptFilePath);
    assert.equal(invocation.args[invocation.args.indexOf('--model') + 1], 'grok-4.6');
  } finally {
    removePromptFile(invocation.promptFilePath);
  }
});

// --- runtime end to end ---

test('the runtime hands a prompt-file agent its rendered prompt and deletes the file afterwards', async () => {
  let finished;
  const done = new Promise((resolve) => { finished = resolve; });
  const runtime = new AgentRuntime({
    resolveTemplate: () => ({
      command: process.execPath,
      args: ['-e', "const f=process.argv[1];process.stdout.write(require('fs').readFileSync(f,'utf8')+'|'+f)", PROMPT_FILE_TOKEN],
      stdin: null,
      promptFile: 'Hello {{ticketId}}'
    }),
    onRunFinished: (run) => finished(run)
  });

  runtime.startAgent('grok', {
    ticketId: 'GROK-002',
    epicRef: 'docs/Epics/epic_X.md',
    title: 'Prompt file',
    repoRoot: process.cwd()
  });
  const run = await done;
  assert.equal(run.state, 'completed', run.error || run.stderr);
  const [content, filePath] = run.stdout.split('|');
  assert.equal(content, 'Hello GROK-002');
  assert.equal(fs.existsSync(filePath), false, 'prompt file removed once the run finished');
});
