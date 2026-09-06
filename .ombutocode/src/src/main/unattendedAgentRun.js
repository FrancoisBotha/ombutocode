'use strict';

/**
 * One-shot unattended agent runner for the planning stages (`epic create`,
 * `tickets create`).
 *
 * Resolves the agent's command template the same way the scheduler does,
 * turns it into a single prompt-driven invocation (prompt on stdin for
 * `--print` / `exec` templates, exactly as runSummary/adHocTickets do), and
 * streams stdout/stderr to `.ombutocode/run-output/<stage>-<timestamp>.log`
 * as it arrives so a killed run still leaves a transcript. Start/finish
 * entries go to the agent run log so the run shows in the Logs tab.
 *
 * Pure in the sense that the process spawner is injectable (`spawnImpl`),
 * which is how the tests and the fake-command smoke drive it.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const { resolveAgentTemplateConfig } = require('./codingAgentRuntime');
const { buildDraftArgsFromTemplate } = require('./adHocTickets');

const DEFAULT_TIMEOUTS_MS = {
  epic: 30 * 60 * 1000,
  tickets: 20 * 60 * 1000,
  finalize: 30 * 60 * 1000
};
const KILL_GRACE_MS = 5000;
const OUTPUT_TAIL_CHARS = 200_000;

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function safeSegment(value) {
  return String(value || 'run').replace(/[^A-Za-z0-9_-]+/g, '-');
}

/**
 * Decide how the prompt reaches the agent and finalise the argv.
 *
 * - Templates with a `stdin` field, `--print` (Claude) or a leading `exec`
 *   (Codex) take the prompt on stdin.
 * - `--prompt <text>` templates (Kimi) get the value replaced in place.
 * - Anything else appends the prompt as the last arg via
 *   buildDraftArgsFromTemplate.
 *
 * Claude's `--output-format stream-json` is swapped to `text` by
 * buildDraftArgsFromTemplate; for unattended runs we want `json` instead so
 * the final result object carries token usage.
 */
function buildUnattendedInvocation(template, prompt, projectRoot, { modelId = '' } = {}) {
  const templateArgs = Array.isArray(template?.args) ? template.args : [];
  const promptIdx = templateArgs.indexOf('--prompt');
  const useStdin = typeof template?.stdin === 'string'
    || (promptIdx < 0 && (templateArgs.includes('--print') || templateArgs[0] === 'exec'));

  let args;
  if (useStdin) {
    args = buildDraftArgsFromTemplate(templateArgs, null, projectRoot, modelId ? { modelId } : {});
  } else if (promptIdx >= 0) {
    const withoutPrompt = templateArgs.filter((_, i) => i !== promptIdx && i !== promptIdx + 1);
    args = buildDraftArgsFromTemplate(withoutPrompt, null, projectRoot, modelId ? { modelId } : {});
    args.push('--prompt', prompt);
  } else {
    args = buildDraftArgsFromTemplate(templateArgs, prompt, projectRoot, modelId ? { modelId } : {});
  }
  args = args.filter((a) => a != null && a !== '');

  const fmtIdx = args.indexOf('--output-format');
  const jsonOutput = fmtIdx >= 0 && fmtIdx + 1 < args.length;
  if (jsonOutput) args[fmtIdx + 1] = 'json';

  return {
    command: template.command,
    args,
    stdinData: useStdin ? prompt : null,
    jsonOutput
  };
}

/**
 * Pull the agent's reply text and token usage out of its stdout.
 *
 * Claude `--output-format json` prints one result object (`{ type: 'result',
 * result, usage, total_cost_usd }`); `stream-json` prints one object per
 * line with the same result object last. Codex prints plain text and a
 * "tokens used: N" line. Anything else is returned verbatim with
 * `tokens: null`.
 */
function parseAgentOutput(stdout) {
  const raw = String(stdout || '');
  const trimmed = raw.trim();

  const fromResultObject = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    if (typeof obj.result !== 'string' && !obj.usage) return null;
    const usage = obj.usage && typeof obj.usage === 'object' ? obj.usage : null;
    const tokens = usage || Number.isFinite(obj.total_cost_usd)
      ? {
        input_tokens: usage?.input_tokens ?? null,
        output_tokens: usage?.output_tokens ?? null,
        cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? null,
        cache_read_input_tokens: usage?.cache_read_input_tokens ?? null,
        total_cost_usd: Number.isFinite(obj.total_cost_usd) ? obj.total_cost_usd : null,
        source: 'claude-json'
      }
      : null;
    return { text: typeof obj.result === 'string' ? obj.result : trimmed, tokens };
  };

  if (trimmed.startsWith('{')) {
    try {
      const parsed = fromResultObject(JSON.parse(trimmed));
      if (parsed) return parsed;
    } catch {
      // not a single JSON document — try line-delimited below
    }
  }

  const lines = trimmed.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 20; i -= 1) {
    const line = lines[i].trim();
    if (!line.startsWith('{')) continue;
    try {
      const obj = JSON.parse(line);
      if (obj?.type === 'result' || typeof obj?.result === 'string') {
        const parsed = fromResultObject(obj);
        if (parsed) return parsed;
      }
    } catch {
      // keep scanning
    }
  }

  const codexTokens = trimmed.match(/tokens used[:\s]+([\d,]+)/i);
  if (codexTokens) {
    const total = Number(codexTokens[1].replace(/,/g, ''));
    return {
      text: raw,
      tokens: Number.isFinite(total) ? { total_tokens: total, source: 'codex-text' } : null
    };
  }

  return { text: raw, tokens: null };
}

/**
 * Run one unattended agent invocation.
 *
 * @param {Object} params
 * @param {string} params.projectRoot
 * @param {string} params.agent           tool id (claude | codex | kimi)
 * @param {string} [params.modelId]       CLI model id substituted for {{modelId}}
 * @param {string} params.prompt
 * @param {'epic'|'tickets'|string} params.stage
 * @param {number} [params.timeoutMs]
 * @param {string} params.runOutputDir
 * @param {Function} [params.appendAgentLog]
 * @param {Function} [params.resolveTemplateConfig]
 * @param {Function} [params.spawnImpl]
 * @param {Function} [params.onOutput]    (chunk, stream) streaming hook
 * @param {Object} [params.logger]
 * @returns {Promise<Object>} run result — never rejects on a non-zero exit
 */
async function runUnattendedAgent(params) {
  const {
    projectRoot,
    agent,
    modelId = '',
    prompt,
    stage = 'run',
    timeoutMs = DEFAULT_TIMEOUTS_MS[stage] || DEFAULT_TIMEOUTS_MS.epic,
    runOutputDir,
    appendAgentLog = () => {},
    resolveTemplateConfig = resolveAgentTemplateConfig,
    spawnImpl = spawn,
    onOutput = null,
    logger = console,
    now = () => new Date()
  } = params;

  if (!projectRoot) throw new Error('runUnattendedAgent: projectRoot is required');
  if (!prompt) throw new Error('runUnattendedAgent: prompt is required');

  const template = resolveTemplateConfig(projectRoot, agent);
  const invocation = buildUnattendedInvocation(template, prompt, projectRoot, { modelId });

  const startedAtDate = now();
  const startedAt = startedAtDate.toISOString();
  const runId = `cli-${safeSegment(stage)}-${timestampSlug(startedAtDate)}`;
  const ticketId = `CLI-${safeSegment(stage).toUpperCase()}`;
  const logFile = path.join(runOutputDir, `${safeSegment(stage)}-${timestampSlug(startedAtDate)}.log`);
  const logRelative = path.relative(projectRoot, logFile).split(path.sep).join('/');

  fs.mkdirSync(runOutputDir, { recursive: true });
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  const commandLine = [invocation.command, ...invocation.args].join(' ');
  logStream.write(`# ${stage} run ${runId}\n# started ${startedAt}\n# cwd ${projectRoot}\n# command ${commandLine}\n\n`);

  appendAgentLog({
    ts: startedAt,
    event: 'run_started',
    agentName: agent,
    runId,
    ticketId,
    stage,
    state: 'running',
    pid: null,
    command: invocation.command,
    args: invocation.args,
    commandLine,
    startedAt
  });

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let settled = false;
    let timedOut = false;
    let timer = null;
    let killTimer = null;
    let spawnError = null;

    const child = spawnImpl(invocation.command, invocation.args, {
      cwd: projectRoot,
      stdio: [invocation.stdinData ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });

    const keepTail = (previous, chunk) => {
      const next = previous + chunk;
      if (next.length <= OUTPUT_TAIL_CHARS) return { text: next, truncated: false };
      return { text: next.slice(next.length - OUTPUT_TAIL_CHARS), truncated: true };
    };

    if (invocation.stdinData && child.stdin) {
      child.stdin.on('error', () => {});
      child.stdin.write(invocation.stdinData);
      child.stdin.end();
    }

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      const kept = keepTail(stdout, text);
      stdout = kept.text;
      stdoutTruncated = stdoutTruncated || kept.truncated;
      logStream.write(text);
      if (onOutput) onOutput(text, 'stdout');
    });
    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      const kept = keepTail(stderr, text);
      stderr = kept.text;
      stderrTruncated = stderrTruncated || kept.truncated;
      logStream.write(text);
      if (onOutput) onOutput(text, 'stderr');
    });

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        logStream.write(`\n# timeout after ${timeoutMs}ms — sending SIGTERM\n`);
        try { child.kill('SIGTERM'); } catch { /* already gone */ }
        killTimer = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* already gone */ }
        }, KILL_GRACE_MS);
      }, timeoutMs);
    }

    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);

      const finishedAtDate = now();
      const finishedAt = finishedAtDate.toISOString();
      const durationMs = Math.max(0, finishedAtDate.getTime() - startedAtDate.getTime());
      const exitCode = Number.isInteger(code) ? code : null;
      const state = spawnError ? 'failed' : (timedOut ? 'timeout' : (exitCode === 0 ? 'completed' : 'failed'));
      const parsed = parseAgentOutput(stdout);

      logStream.write(`\n# finished ${finishedAt} state=${state} exit=${exitCode} signal=${signal || 'none'} durationMs=${durationMs}\n`);
      // Resolve only once the transcript is flushed — callers read it straight away.
      logStream.end(() => {
        appendAgentLog({
          ts: finishedAt,
          event: 'run_finished',
          agentName: agent,
          runId,
          ticketId,
          stage,
          state,
          pid: child.pid || null,
          signal: signal || null,
          durationMs,
          command: invocation.command,
          args: invocation.args,
          commandLine,
          startedAt,
          finishedAt,
          exitCode,
          error: spawnError ? spawnError.message : (timedOut ? `Timed out after ${timeoutMs}ms` : null),
          stdout: parsed.text.slice(-4000),
          stderr: stderr.slice(-4000),
          stdoutTruncated,
          stderrTruncated,
          tokens: parsed.tokens
        });

        resolve({
          runId,
          stage,
          agent,
          modelId: modelId || null,
          command: invocation.command,
          args: invocation.args,
          commandLine,
          pid: child.pid || null,
          state,
          exitCode,
          signal: signal || null,
          timedOut,
          error: spawnError ? spawnError.message : null,
          startedAt,
          finishedAt,
          durationMs,
          stdout,
          stderr,
          text: parsed.text,
          tokens: parsed.tokens,
          log: logRelative,
          logPath: logFile
        });
      });
    };

    child.on('error', (err) => {
      spawnError = err;
      logStream.write(`\n# spawn error: ${err.message}\n`);
      (logger.error || console.error)(`[${stage}] agent spawn failed: ${err.message}`);
      finish(null, null);
    });
    child.on('close', (code, signal) => finish(code, signal));
  });
}

module.exports = {
  DEFAULT_TIMEOUTS_MS,
  buildUnattendedInvocation,
  parseAgentOutput,
  runUnattendedAgent
};
