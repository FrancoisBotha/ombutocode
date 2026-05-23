#!/usr/bin/env node
/*
 * Targeted edit: drop the "verify tests pass after implementing" step from
 * the TDD instructions in the kimi / codex / claude impl prompts.
 *
 * Rationale: the test phase runs immediately after impl and re-runs the
 * tests anyway. Forcing the impl agent to also run them after writing the
 * implementation roughly doubles test-execution time for no extra signal —
 * the test phase will catch any failure either way.
 *
 * Idempotent: bails if the old step 5 wording isn't found.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TEMPLATES_PATH = path.join(__dirname, '..', 'codingagent-templates.json');

const OLD_STEPS = [
  '4. ONLY THEN implement the production code to make the tests pass.',
  '5. Run the tests again. They MUST all pass before you finish.',
  '6. In your final output, emit ONE of these markers on its own line:'
].join('\n');

const NEW_STEPS = [
  '4. ONLY THEN implement the production code to make the tests pass. You do NOT need to re-run the tests after implementing — the test phase that runs immediately after this one re-runs them and is the authoritative pass/fail gate.',
  '5. In your final output, emit ONE of these markers on its own line:'
].join('\n');

// The marker numbering downstream of step 5 used to be 6 and 7 — bump down.
const OLD_TAIL = [
  '5. In your final output, emit ONE of these markers on its own line:',
  '   - `TESTS_ADDED: path/to/test1, path/to/test2` (relative paths, comma-separated)',
  '   - `TESTS_SKIPPED: <specific reason>` — only for purely-UI / docs / config / data tickets where unit tests are not practical. Be specific; the test phase will reject vague rationales.',
  '7. Also emit on its own line:'
].join('\n');

const NEW_TAIL = [
  '5. In your final output, emit ONE of these markers on its own line:',
  '   - `TESTS_ADDED: path/to/test1, path/to/test2` (relative paths, comma-separated)',
  '   - `TESTS_SKIPPED: <specific reason>` — only for purely-UI / docs / config / data tickets where unit tests are not practical. Be specific; the test phase will reject vague rationales.',
  '6. Also emit on its own line:'
].join('\n');

function rewrite(prompt) {
  if (!prompt.includes(OLD_STEPS)) return { changed: false, value: prompt };
  let out = prompt.replace(OLD_STEPS, NEW_STEPS);
  out = out.replace(OLD_TAIL, NEW_TAIL);
  return { changed: true, value: out };
}

const templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
let touched = 0;

if (templates.kimi) {
  const args = templates.kimi.args || [];
  const idx = args.findIndex(a => typeof a === 'string' && a.includes('TEST-DRIVEN DEVELOPMENT (MANDATORY'));
  if (idx >= 0) {
    const { changed, value } = rewrite(args[idx]);
    if (changed) { args[idx] = value; touched++; console.log('  kimi: trimmed ✓'); }
    else console.log('  kimi: no change (already trimmed or unexpected shape)');
  }
}
for (const key of ['codex', 'claude']) {
  if (templates[key] && typeof templates[key].stdin === 'string') {
    const { changed, value } = rewrite(templates[key].stdin);
    if (changed) { templates[key].stdin = value; touched++; console.log(`  ${key}: trimmed ✓`); }
    else console.log(`  ${key}: no change`);
  }
}

if (touched > 0) {
  fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2) + '\n', 'utf8');
  console.log(`\n${touched} template(s) updated.`);
} else {
  console.log('\nNo templates needed updating.');
}
