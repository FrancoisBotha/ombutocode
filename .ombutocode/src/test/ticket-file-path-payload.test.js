const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const schedulerSrc = fs.readFileSync(path.join(__dirname, '../src/main/scheduler.js'), 'utf-8');
const templates = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../codingagent-templates.json'), 'utf-8')
);

test('the ticket JSON path handed to agents is absolute and rooted at the main repo', () => {
  // Ticket files are gitignored, so they never exist inside a ticket worktree.
  // A relative path would resolve against the worktree cwd and silently miss.
  assert.ok(
    /ticketFilePath = projectRoot\s*\?\s*path\.join\(projectRoot, '\.ombutocode', 'data', 'tickets'/.test(schedulerSrc),
    'scheduler should build the ticket path from projectRoot'
  );
  assert.ok(
    !/const ticketFilePath = path\.join\('\.ombutocode'/.test(schedulerSrc),
    'scheduler should not hand over a bare relative ticket path'
  );
});

test('agent prompts say the ticket file sits outside the working directory', () => {
  const withTicketFile = Object.entries(templates).filter(([, tpl]) =>
    JSON.stringify(tpl).includes('{{ticketFilePath}}')
  );
  assert.ok(withTicketFile.length >= 3, 'claude, codex and kimi implementation prompts reference it');

  for (const [name, tpl] of withTicketFile) {
    const text = JSON.stringify(tpl);
    assert.ok(
      text.includes('ABSOLUTE path into the main repository'),
      `${name} should tell the agent the path is absolute`
    );
    assert.ok(
      text.includes('OUTSIDE your working directory'),
      `${name} should warn the file is outside the checkout`
    );
    assert.ok(
      text.includes('READ IT FIRST'),
      `${name} should require reading it before implementing`
    );
    assert.ok(
      text.includes('If you cannot read it, say so explicitly'),
      `${name} should require an unreadable file to be reported, not skipped`
    );
  }
});

test('ticket files exist for the statuses an agent runs in', () => {
  const backlogDb = fs.readFileSync(path.join(__dirname, '../src/main/backlogDb.js'), 'utf-8');
  const match = backlogDb.match(/const ACTIVE_STATUSES = new Set\(\[(.*?)\]\)/s);
  assert.ok(match, 'ACTIVE_STATUSES should be declared');
  // The file overlay is what makes the absolute path resolve at dispatch time.
  for (const status of ['in_progress', 'test', 'eval']) {
    assert.ok(match[1].includes(`'${status}'`), `${status} should keep a ticket file on disk`);
  }
});
