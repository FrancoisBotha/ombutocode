'use strict';

/**
 * Headless CLI dispatcher.
 *
 *   node headless.js epic create ...
 *   node headless.js tickets create ...
 *   node headless.js run ...
 *   node headless.js status ...
 *
 * Contract: stdout carries the result only (a single JSON object with
 * `--json`, readable text otherwise); every other line — boot messages,
 * scheduler chatter, progress — goes to stderr. Each command appends a stage
 * record to `.ombutocode/run-manifest.json`.
 */

const path = require('path');

const { parseCliArgs, EXIT_OK, EXIT_FAILURE, EXIT_USAGE, USAGE } = require('./args');
const { resolveProjectRoot, buildProjectPaths, bootProject } = require('./bootstrap');
const { appendManifestStage } = require('./manifest');
const { loadProfile, profileToBootOptions } = require('./profile');

/**
 * Route console.log/info/debug to stderr so library modules that log with
 * console.log cannot pollute the machine-readable stdout. Returns a writer
 * bound to the real stdout for the final result.
 */
function redirectConsoleToStderr() {
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const toStderr = (...args) => console.error(...args);
  console.log = toStderr;
  console.info = toStderr;
  console.debug = toStderr;
  return (text) => stdoutWrite(`${text}\n`);
}

function formatEpicResult(r) {
  if (!r.ok) return `epic create FAILED: ${r.error}${r.result?.log ? `\n  log: ${r.result.log}` : ''}`;
  const res = r.result;
  return [
    `epic create OK: ${res.epicPath}`,
    `  committed: ${res.committed} (${res.committedBy || 'n/a'})${res.commitSha ? ` ${res.commitSha.slice(0, 10)}` : ''}`,
    `  agent: ${r.agent}${r.model ? `:${r.model}` : ''}  duration: ${Math.round(res.durationMs / 1000)}s  log: ${res.log}`,
    res.tokens ? `  tokens: ${JSON.stringify(res.tokens)}` : '  tokens: n/a'
  ].join('\n');
}

function formatTicketsResult(r) {
  if (!r.ok) return `tickets create FAILED: ${r.error}${r.result?.log ? `\n  log: ${r.result.log}` : ''}`;
  const res = r.result;
  const lines = [`tickets create OK: ${res.tickets.length} ticket(s) for ${res.epicPath}`];
  for (const t of res.tickets) {
    lines.push(`  ${t.id.padEnd(12)} ${t.status.padEnd(8)} ${JSON.stringify(t.assignee)}  deps=[${t.dependencies.join(', ')}]  ${t.title}`);
  }
  if (res.fixedUp.length) lines.push(`  fixed up: ${res.fixedUp.map((f) => `${f.id}.${f.field}`).join(', ')}`);
  lines.push(`  epic status: ${res.epicStatus}${res.epicStatusUpdated ? ' (set by cli)' : ''}`);
  lines.push(`  agent: ${r.agent}${r.model ? `:${r.model}` : ''}  duration: ${Math.round(res.durationMs / 1000)}s  log: ${res.log}`);
  return lines.join('\n');
}

function formatRunResult(r) {
  const res = r.result;
  const lines = [`run ${res.outcome.toUpperCase()} (exit ${res.exitCode}): ${res.reason}`];
  lines.push(`  duration: ${Math.round(res.durationMs / 1000)}s  merge reverts: ${res.mergeReverts}  HEAD: ${(res.headBefore || '').slice(0, 10)} → ${(res.headAfter || '').slice(0, 10)}`);
  lines.push(`  execution order: ${res.executionOrder.join(' → ') || '(none)'}`);
  for (const t of res.tickets) {
    lines.push(`  ${t.id.padEnd(12)} ${String(t.finalStatus).padEnd(10)} runs=${t.runs.length} merged=${t.mergeLanded === null ? 'n/a' : t.mergeLanded}  ${t.title}`);
  }
  return lines.join('\n');
}

function formatFinalizeResult(r) {
  const res = r.result;
  const head = `finalize ${res.ok ? 'OK' : 'FAILED'}: ${res.epicPath} on ${res.branch} (sentinel ${res.sentinel?.state}, ${Math.round((res.durationMs || 0) / 1000)}s)`;
  const lines = [head];
  if (res.commitSha) lines.push(`  committed by ${res.committedBy}: ${String(res.commitSha).slice(0, 10)}`);
  if (res.report) lines.push('  report:', ...res.report.split('\n').slice(-25).map((l) => `    ${l}`));
  return lines.join('\n');
}

/**
 * Run the CLI for a `process.argv`-shaped array. Returns the exit code
 * instead of exiting so it is testable; `headless.js` calls process.exit.
 */
async function main(argv, io = {}) {
  const out = io.stdout || redirectConsoleToStderr();
  const err = io.stderr || ((text) => process.stderr.write(`${text}\n`));

  const parsed = parseCliArgs(argv);
  if (!parsed.ok) {
    if (parsed.help) {
      out(parsed.usage);
      return EXIT_OK;
    }
    err(`error: ${parsed.error}\n\n${parsed.usage}`);
    return parsed.exitCode ?? EXIT_USAGE;
  }

  const { command, options, specKey } = parsed;
  const stage = command; // epic | tickets | run | finalize | status
  const startedAt = new Date().toISOString();

  let projectRoot;
  try {
    projectRoot = resolveProjectRoot({ explicit: options.project || null });
  } catch (error) {
    err(`error: ${error.message}`);
    return EXIT_USAGE;
  }
  const paths = buildProjectPaths(projectRoot);

  // Benchmark profile (run only)
  let profile = null;
  if (options.profile) {
    try {
      profile = loadProfile(paths.PROFILES_DIR, options.profile);
      if (profile.ignored.length) err(`[profile] ignored unknown keys: ${profile.ignored.join(', ')}`);
      err(`[profile] ${profile.name}: settings=${JSON.stringify(profile.settings)} agents=${JSON.stringify(profile.agents)} scheduler=${JSON.stringify(profile.scheduler)}`);
    } catch (error) {
      err(`error: ${error.message}`);
      return EXIT_USAGE;
    }
  }

  const logger = {
    log: (...args) => console.error(...args),
    info: (...args) => console.error(...args),
    warn: (...args) => console.error(...args),
    error: (...args) => console.error(...args)
  };

  let ctx;
  try {
    ctx = await bootProject({ projectRoot, logger, ...profileToBootOptions(profile) });
  } catch (error) {
    err(`error: boot failed: ${error.message}`);
    return EXIT_FAILURE;
  }

  // Console mode keeps the process alive; no manifest record, no JSON.
  if (command === 'run' && options.until !== 'drained') {
    const { runSchedulerConsoleMode } = require('./run');
    await runSchedulerConsoleMode(ctx);
    return EXIT_OK;
  }

  let outcome;
  try {
    if (specKey === 'epic create') {
      outcome = await require('./epicCreate').runEpicCreate(ctx, options);
    } else if (specKey === 'tickets create') {
      outcome = await require('./ticketsCreate').runTicketsCreate(ctx, options);
    } else if (command === 'run') {
      outcome = await require('./run').runSchedulerUntilDrained(ctx, options);
    } else if (command === 'finalize') {
      outcome = await require('./finalize').runFinalize(ctx, options);
    } else {
      outcome = await require('./status').runStatus(ctx, options);
    }
  } catch (error) {
    outcome = {
      ok: false,
      exitCode: EXIT_FAILURE,
      error: error?.stack || error?.message || String(error),
      agent: null,
      model: null,
      tokens: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      result: { ok: false, error: error?.message || String(error) }
    };
  }

  const record = {
    stage,
    command: argv.slice(2),
    startedAt: outcome.startedAt || startedAt,
    finishedAt: outcome.finishedAt || new Date().toISOString(),
    agent: outcome.agent ?? null,
    model: outcome.model ?? null,
    ok: outcome.ok,
    exitCode: outcome.exitCode,
    tokens: outcome.tokens ?? null,
    result: {
      ...(outcome.result || {}),
      ...(profile ? { profile: { name: profile.name, path: path.relative(projectRoot, profile.path) } } : {})
    }
  };
  try {
    appendManifestStage(paths.MANIFEST_PATH, record);
  } catch (error) {
    err(`warning: could not write ${paths.MANIFEST_PATH}: ${error.message}`);
  }

  if (options.json) {
    out(JSON.stringify({
      ok: outcome.ok,
      stage,
      exitCode: outcome.exitCode,
      error: outcome.ok ? null : (outcome.error || null),
      agent: record.agent,
      model: record.model,
      tokens: record.tokens,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      durationMs: Math.max(0, Date.parse(record.finishedAt) - Date.parse(record.startedAt)),
      manifest: path.relative(projectRoot, paths.MANIFEST_PATH).split(path.sep).join('/'),
      result: record.result
    }, null, 2));
  } else if (command === 'status') {
    out(outcome.text);
  } else if (specKey === 'epic create') {
    out(formatEpicResult(outcome));
  } else if (specKey === 'tickets create') {
    out(formatTicketsResult(outcome));
  } else if (command === 'finalize') {
    out(formatFinalizeResult(outcome));
  } else {
    out(formatRunResult(outcome));
  }

  return outcome.exitCode;
}

module.exports = { main, USAGE };
