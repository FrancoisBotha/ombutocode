const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EPIC_DONE_SENTINEL,
  EPIC_FAILED_SENTINEL,
  TICKETS_DONE_SENTINEL,
  TICKETS_FAILED_SENTINEL,
  selectEpicSkill,
  buildEpicPrompt,
  buildTicketPrompt,
  parseSentinel
} = require('../src/main/planningPrompts');

test('bulk vertical prompt reads the PRD and asks for confirmation (interactive contract)', () => {
  const prompt = buildEpicPrompt({ mode: 'bulk', strategy: 'vertical', prd: 'Product Requirements Document/prd.md', skillContent: 'SKILL' });
  assert.ok(prompt.startsWith('SKILL\n\n---\n\n'));
  assert.match(prompt, /Read the PRD at "docs\/Product Requirements Document\/prd\.md"/);
  assert.match(prompt, /Vertical Slice skill/);
  assert.match(prompt, /Ask me to confirm before creating the files\./);
});

test('bulk layered prompt selects the layered instruction', () => {
  const prompt = buildEpicPrompt({ mode: 'bulk', strategy: 'layered', prd: 'p.md' });
  assert.match(prompt, /Epic Generation - Layered skill/);
});

test('single and refine prompts list existing epics', () => {
  const existingEpics = [{ name: 'epic_01_FOO.md', status: 'TICKETS' }, { name: 'epic_02_BAR.md' }];
  const single = buildEpicPrompt({ mode: 'single', prd: 'p.md', existingEpics });
  assert.match(single, /ONE NEW epic/);
  assert.match(single, /- epic_01_FOO \(TICKETS\)\n- epic_02_BAR \(NEW\)/);

  const refine = buildEpicPrompt({ mode: 'refine', prd: 'p.md', targetEpicPath: 'Epics/epic_01_FOO.md', existingEpics });
  assert.match(refine, /Refine the epic at "docs\/Epics\/epic_01_FOO\.md"/);
});

test('optional context documents are appended in order', () => {
  const prompt = buildEpicPrompt({ mode: 'bulk', prd: 'p.md', arch: 'a.md', styleGuide: 's.md', codeMap: 'c.md' });
  assert.match(prompt, /Read the PRD at "docs\/p\.md", and the Architecture document at "docs\/a\.md", and the Style Guide at "docs\/s\.md", and the Code Map at "docs\/c\.md"\./);
});

test('interactive modes require a PRD', () => {
  assert.throws(() => buildEpicPrompt({ mode: 'bulk' }), /prd is required/);
});

test('unattended prompt reads the reference file, forbids questions and names the sentinel', () => {
  const prompt = buildEpicPrompt({ mode: 'unattended', referenceFile: 'bench/reference.md', existingEpics: [] });
  assert.match(prompt, /Read the reference specification at "bench\/reference\.md" in full/);
  assert.match(prompt, /EXACTLY ONE epic/);
  assert.match(prompt, /DO NOT ASK ME ANYTHING/);
  assert.match(prompt, /\(none yet\)/);
  assert.match(prompt, /Commit the new epic file/);
  assert.ok(prompt.includes(`"${EPIC_DONE_SENTINEL} docs/Epics/<file>.md"`));
  assert.ok(prompt.includes(`"${EPIC_FAILED_SENTINEL}"`));
  assert.doesNotMatch(prompt, /Ask me to confirm/);
});

test('unattended prompt can opt out of committing and requires a reference file', () => {
  const prompt = buildEpicPrompt({ mode: 'unattended', referenceFile: 'r.md', commit: false });
  assert.match(prompt, /Do NOT commit/);
  assert.throws(() => buildEpicPrompt({ mode: 'unattended' }), /referenceFile is required/);
});

test('ticket prompt defaults to backlog with no assignee', () => {
  const prompt = buildTicketPrompt({ epicPath: 'Epics/epic_01_FOO.md', skillContent: 'SKILL' });
  assert.ok(prompt.startsWith('SKILL\n\n'));
  assert.match(prompt, /- status: backlog\n- assignee: null\n- epic_ref: docs\/Epics\/epic_01_FOO\.md/);
  assert.match(prompt, /DO NOT ASK ME ANYTHING/);
  assert.ok(prompt.includes(`"${TICKETS_DONE_SENTINEL}"`));
  assert.ok(prompt.includes(`"${TICKETS_FAILED_SENTINEL}"`));
});

test('ticket prompt can write straight to todo with an explicit assignee', () => {
  const prompt = buildTicketPrompt({ epicPath: 'Epics/e.md', status: 'todo', assignee: { tool: 'claude', model: 'opus-4.7' } });
  assert.match(prompt, /- status: todo\n- assignee: \{"tool":"claude","model":"opus-4\.7"\}/);
  const toolOnly = buildTicketPrompt({ epicPath: 'Epics/e.md', status: 'todo', assignee: { tool: 'codex' } });
  assert.match(toolOnly, /- assignee: \{"tool":"codex"\}/);
});

test('selectEpicSkill picks by mode and strategy with sensible fallbacks', () => {
  const skills = [
    { name: 'Epic Generation - Vertical Slice', path: 'v' },
    { name: 'Epic Generation - Layered', path: 'l' },
    { name: 'Epic Refinement', path: 'r' },
    { name: 'Epic Generation - Unattended', path: 'u' }
  ];
  assert.equal(selectEpicSkill(skills, { mode: 'bulk', strategy: 'vertical' }).path, 'v');
  assert.equal(selectEpicSkill(skills, { mode: 'bulk', strategy: 'layered' }).path, 'l');
  assert.equal(selectEpicSkill(skills, { mode: 'single' }).path, 'r');
  assert.equal(selectEpicSkill(skills, { mode: 'refine' }).path, 'r');
  assert.equal(selectEpicSkill(skills, { mode: 'unattended' }).path, 'u');
  assert.equal(selectEpicSkill([{ name: 'Epic Generation', path: 'g' }], { mode: 'bulk', strategy: 'layered' }).path, 'g');
  assert.equal(selectEpicSkill([], { mode: 'unattended' }), null);
});

test('parseSentinel reads the tail of the transcript', () => {
  const sentinels = { done: EPIC_DONE_SENTINEL, failed: EPIC_FAILED_SENTINEL };
  assert.deepEqual(parseSentinel('...\nDONE - EPIC WRITTEN docs/Epics/epic_03_COW.md\n', sentinels), { state: 'done', path: 'docs/Epics/epic_03_COW.md' });
  assert.deepEqual(parseSentinel('DONE - EPIC WRITTEN `docs/Epics/e.md`\n\nTokens: 12', sentinels), { state: 'done', path: 'docs/Epics/e.md' });
  assert.deepEqual(parseSentinel('nope\nFAILED - NO EPIC WRITTEN', sentinels), { state: 'failed' });
  assert.deepEqual(parseSentinel('I would like to confirm first', sentinels), { state: 'missing' });
  assert.deepEqual(parseSentinel('DONE - TICKETS WRITTEN', { done: TICKETS_DONE_SENTINEL, failed: TICKETS_FAILED_SENTINEL }), { state: 'done' });
});

test('ticket prompt closeout modes: all is the default and adds nothing, eval/none add an explicit override', () => {
  const base = buildTicketPrompt({ epicPath: 'Epics/e.md' });
  assert.equal(buildTicketPrompt({ epicPath: 'Epics/e.md', closeout: 'all' }), base);
  assert.equal(buildTicketPrompt({ epicPath: 'Epics/e.md', closeout: 'bogus' }), base);
  assert.doesNotMatch(base, /CLOSEOUT TICKETS FOR THIS RUN/);

  const evalOnly = buildTicketPrompt({ epicPath: 'Epics/e.md', closeout: 'eval' });
  assert.match(evalOnly, /CLOSEOUT TICKETS FOR THIS RUN/);
  assert.match(evalOnly, /append ONLY the epic-level evaluation closeout ticket/);
  assert.match(evalOnly, /Do NOT create the regression-tests, help-docs, or code-map-refresh/);
  assert.ok(evalOnly.trim().endsWith('if writing did not succeed.'), 'sentinel instruction must stay last');

  const none = buildTicketPrompt({ epicPath: 'Epics/e.md', closeout: 'none' });
  assert.match(none, /do NOT append any closeout tickets/);
});

