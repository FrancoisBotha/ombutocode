#!/usr/bin/env node
/*
 * Rewrite the "release build-server handles" block in the templates from
 * a .NET-leading, Windows-specific framing to a language-neutral one.
 * The retry+rename-aside fix in worktreeManager.js handles any language's
 * transient file locks; this instruction just helps the agent prevent the
 * lock at the source, regardless of what stack the project uses.
 *
 * Idempotent: bails if the new marker is already present.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TEMPLATES_PATH = path.join(__dirname, '..', 'codingagent-templates.json');
const OLD_MARKER = 'RELEASE BUILD-SERVER HANDLES';
const NEW_MARKER = 'RELEASE LONG-LIVED PROCESSES BEFORE EXIT';

const OLD_BLOCK_PATTERN = /\nRELEASE BUILD-SERVER HANDLES \(Windows-specific cleanup, MANDATORY\):[\s\S]*?(?=\n\n|$)/;

const NEW_BLOCK = [
  '',
  'RELEASE LONG-LIVED PROCESSES BEFORE EXIT (MANDATORY):',
  "Any persistent helper you spawned during this run — a build daemon, language server, file watcher, REPL, dev server — must be shut down before you finish. These processes keep file handles open in the worktree after you exit, which on Windows blocks the scheduler's worktree cleanup and stalls the pipeline. The handle leak is not specific to any one language.",
  '',
  'General rule: if it stayed running after your command returned, kill it. Examples for common stacks (non-exhaustive — apply whichever matches what you used):',
  '  * .NET / MSBuild / Roslyn: `dotnet build-server shutdown`',
  '  * Java / Gradle: `gradle --stop` (or `./gradlew --stop`)',
  '  * Java / Maven: `mvn -T1 -q -DskipTests test` does not daemonise, but if you started `mvnDaemon`, stop it',
  '  * Node / TypeScript: kill any `tsc --watch`, `tsserver`, `next dev`, `vite`, `webpack-dev-server` you spawned',
  '  * Python: kill any `pytest --watch`, `uvicorn --reload`, `flask run` you spawned',
  '  * Ruby: kill any `bundler/cli` daemons or `spring stop`',
  '  * Rust / Go: nothing to do — neither tool keeps a daemon',
  '',
  'Shutdown commands for stacks that have one are no-ops when no daemon is running, so it is safe to run them unconditionally.'
].join('\n');

const templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
let touched = 0;

function rewrite(value) {
  if (typeof value !== 'string') return value;
  if (value.includes(NEW_MARKER)) return value; // already rewritten
  if (!value.includes(OLD_MARKER)) return value; // no old block to replace
  touched++;
  return value.replace(OLD_BLOCK_PATTERN, NEW_BLOCK);
}

// Impl templates: kimi has the prompt in args, codex/claude in `stdin`.
if (templates.kimi) {
  const args = templates.kimi.args || [];
  const idx = args.findIndex(a => typeof a === 'string' && a.includes('Implement ticket {{ticketId}}'));
  if (idx >= 0) args[idx] = rewrite(args[idx]);
}
for (const key of ['codex', 'claude', 'kimi_test', 'codex_test', 'claude_test', 'kimi_eval', 'codex_eval', 'claude_eval']) {
  if (templates[key] && typeof templates[key].stdin === 'string') {
    templates[key].stdin = rewrite(templates[key].stdin);
  }
}

if (touched > 0) {
  fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2) + '\n', 'utf8');
  console.log(`Rewrote build-server block in ${touched} template(s) to language-neutral form.`);
} else {
  console.log('No templates needed rewriting.');
}
