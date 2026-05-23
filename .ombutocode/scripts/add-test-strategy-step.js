#!/usr/bin/env node
/*
 * Prepend a "consult the project's test strategy" step (Step 0) to the
 * test-phase templates. The Initiate Stack skill writes
 * docs/Test Strategy/test-strategy.md when bootstrapping a new project;
 * once that file exists, future test-phase agents should treat it as the
 * authoritative playbook (exact test commands, lint config, layout) and
 * fall back to the generic stack-inference logic only when the file is
 * missing.
 *
 * Idempotent: bails when the marker phrase is already present.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TEMPLATES_PATH = path.join(__dirname, '..', 'codingagent-templates.json');
const MARKER = 'Step 0: CONSULT THE PROJECT TEST STRATEGY';

const STEP0 = [
  'Step 0: CONSULT THE PROJECT TEST STRATEGY (if present)',
  '- Look for `docs/Test Strategy/test-strategy.md`. If it exists, READ IT FIRST. It is the authoritative playbook for this project, written when the stack was bootstrapped. Use its commands for unit tests, lint, type-check, full-suite runs, and conventions. Treat it as more authoritative than the generic per-language guidance further down.',
  '- If `test-strategy.md` is missing, fall back to the generic Steps 1-5 below — those handle projects that have not yet run the Initiate Stack flow.',
  ''
].join('\n');

const templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
let touched = 0;

function inject(value) {
  if (typeof value !== 'string') return value;
  if (value.includes(MARKER)) return value;
  // Insert Step 0 immediately before the existing "Step 1: IDENTIFY" line so
  // the agent reads it before doing anything else.
  const anchor = "Step 1: IDENTIFY THIS TICKET'S CHANGED FILES";
  if (!value.includes(anchor)) return value;
  touched++;
  return value.replace(anchor, STEP0 + '\n' + anchor);
}

for (const key of ['kimi_test', 'codex_test', 'claude_test']) {
  if (templates[key] && typeof templates[key].stdin === 'string') {
    const before = templates[key].stdin;
    templates[key].stdin = inject(before);
    if (templates[key].stdin !== before) console.log(`  ${key}: Step 0 injected ✓`);
    else if (templates[key].stdin.includes(MARKER)) console.log(`  ${key}: already present`);
    else console.log(`  ${key}: anchor not found, skipped`);
  }
}

if (touched > 0) {
  fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2) + '\n', 'utf8');
  console.log(`\n${touched} template(s) updated.`);
} else {
  console.log('\nNo templates needed updating.');
}
