#!/usr/bin/env node
'use strict';

/**
 * Headless entry point.
 *
 *   node headless.js [<project-root>]        scheduler console (unchanged behaviour)
 *   node headless.js epic create ...         } unattended planning / execution
 *   node headless.js tickets create ...      } subcommands — see src/cli/index.js
 *   node headless.js run ...                 }
 *   node headless.js status ...              }
 *
 * The boot (DB, settings, agent runtime, scheduler) lives in
 * src/cli/bootstrap.js and is shared by the console and the subcommands.
 */

const { CLI_COMMANDS } = require('./src/cli/args');

if (CLI_COMMANDS.has(process.argv[2])) {
  require('./src/cli').main(process.argv)
    .then((code) => {
      // Let stdout/stderr drain before exiting — the JSON result may be large.
      process.exitCode = code;
      setTimeout(() => process.exit(code), 50);
    })
    .catch((error) => {
      console.error('[Headless] Fatal:', error?.stack || error?.message || error);
      process.exit(1);
    });
} else {
  const { resolveProjectRoot, bootProject } = require('./src/cli/bootstrap');
  const { runSchedulerConsole } = require('./src/cli/console');

  // ---------------------------------------------------------------------------
  // 1. Resolve project root (CLI argument → env → cwd → self-hosting)
  // ---------------------------------------------------------------------------
  let PROJECT_ROOT;
  try {
    PROJECT_ROOT = resolveProjectRoot({ explicit: process.argv[2] || null });
  } catch {
    PROJECT_ROOT = resolveProjectRoot();
  }

  // ---------------------------------------------------------------------------
  // 2. Boot and run the console display
  // ---------------------------------------------------------------------------
  (async function main() {
    const ctx = await bootProject({ projectRoot: PROJECT_ROOT });
    runSchedulerConsole(ctx);
  })().catch((error) => {
    console.error('[Headless] Fatal:', error?.stack || error?.message || error);
    process.exit(1);
  });
}
