#!/usr/bin/env node
/*
 * Append a "release build-server handles" reminder to the impl, test, and
 * eval templates in codingagent-templates.json.
 *
 * Why: on Windows, .NET tooling (MSBuild server, VBCSCompiler / Roslyn,
 * `dotnet build-server`) keeps a process alive after the build finishes
 * and holds file handles in the project dir for 10-15 minutes by default.
 * That's long enough to deadlock the scheduler's worktree cleanup. Java's
 * Gradle daemon and Node's TypeScript-server have the same shape.
 *
 * Telling the agent to shut these helpers down before exiting eliminates
 * the lock at the source. The worktreeManager retry+rename fallback still
 * catches the residual cases (e.g. unfamiliar build tooling), but most
 * runs should now release cleanly.
 *
 * Idempotent: bails if the marker phrase is already present.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TEMPLATES_PATH = path.join(__dirname, '..', 'codingagent-templates.json');
const MARKER = 'RELEASE BUILD-SERVER HANDLES';

const BLOCK = [
  '',
  'RELEASE BUILD-SERVER HANDLES (Windows-specific cleanup, MANDATORY):',
  "Some build tools spawn persistent daemons that keep file handles open in this worktree for 10-15 minutes after the build finishes, which blocks the scheduler's worktree cleanup and stalls the pipeline. Before you exit, run the shutdown commands for whatever tooling you used:",
  '  * .NET: `dotnet build-server shutdown` (shuts down MSBuild, VBCSCompiler, Razor)',
  '  * Java/Gradle: `gradle --stop`',
  '  * TypeScript / Node: kill any `tsc --watch` / `tsserver` you spawned',
  '  * Rust: nothing to do — cargo does not keep a daemon',
  '  * Go: nothing to do',
  '  * Python: nothing to do',
  'If you are not sure what was spawned, run the shutdown command for the language you used — it is a no-op when no daemon is running.'
].join('\n');

const templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
let touched = 0;

function append(value) {
  if (typeof value !== 'string') return value;
  if (value.includes(MARKER)) return value;
  touched++;
  return value + '\n' + BLOCK;
}

// Impl templates: kimi has the prompt in args, codex/claude in `stdin`.
if (templates.kimi) {
  const args = templates.kimi.args || [];
  const idx = args.findIndex(a => typeof a === 'string' && a.includes('Implement ticket {{ticketId}}'));
  if (idx >= 0) args[idx] = append(args[idx]);
}
for (const key of ['codex', 'claude', 'kimi_test', 'codex_test', 'claude_test', 'kimi_eval', 'codex_eval', 'claude_eval']) {
  if (templates[key] && typeof templates[key].stdin === 'string') {
    templates[key].stdin = append(templates[key].stdin);
  }
}

if (touched > 0) {
  fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2) + '\n', 'utf8');
  console.log(`Appended build-server shutdown reminder to ${touched} template(s).`);
} else {
  console.log('No templates needed updating (already present).');
}
