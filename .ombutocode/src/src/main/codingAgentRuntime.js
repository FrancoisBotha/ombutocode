const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const REQUIRED_START_FIELDS = ['ticketId', 'featureRef', 'title', 'repoRoot'];
const TEMPLATE_TOKENS = ['ticketId', 'featureRef', 'title', 'repoRoot', 'runId', 'acceptanceCriteria', 'modelId', 'retryContext', 'venvPython', 'workingDirectory', 'ticketFilePath'];
const MAX_OUTPUT_CAPTURE_CHARS = 262144; // 256KB - increased from 12KB to accommodate verbose eval output with EVAL-007 enhancements
const OUTPUT_UPDATE_THROTTLE_MS = 1000;

class AgentInvocationError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'AgentInvocationError';
    this.code = code;
    this.details = details;
  }
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AgentInvocationError('INVALID_PAYLOAD', `${fieldName} must be a non-empty string`);
  }
}

function normalizeStartPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new AgentInvocationError('INVALID_PAYLOAD', 'payload must be an object');
  }

  for (const field of REQUIRED_START_FIELDS) {
    assertNonEmptyString(payload[field], field);
  }

  return {
    ticketId: payload.ticketId.trim(),
    featureRef: payload.featureRef.trim(),
    title: payload.title.trim(),
    repoRoot: path.resolve(payload.repoRoot.trim()),
    acceptanceCriteria: typeof payload.acceptanceCriteria === 'string' ? payload.acceptanceCriteria : '',
    modelId: typeof payload.modelId === 'string' ? payload.modelId : '',
    retryContext: typeof payload.retryContext === 'string' ? payload.retryContext : ''
  };
}

function normalizeWorkingDirectory(options) {
  let workingDirectory = null;
  if (typeof options === 'string') {
    workingDirectory = options;
  } else if (options && typeof options === 'object' && Object.hasOwn(options, 'workingDirectory')) {
    workingDirectory = options.workingDirectory;
  }

  if (workingDirectory === undefined || workingDirectory === null) {
    return null;
  }

  if (typeof workingDirectory !== 'string') {
    throw new AgentInvocationError('INVALID_PAYLOAD', 'workingDirectory must be a non-empty string when provided');
  }

  const trimmed = workingDirectory.trim();
  if (!trimmed) {
    return null;
  }

  return path.resolve(trimmed);
}

function parseTemplate(rawTemplate) {
  if (!rawTemplate || typeof rawTemplate !== 'object') {
    throw new AgentInvocationError('INVALID_CONFIG', 'Agent command template must be an object');
  }

  const { command, args } = rawTemplate;
  assertNonEmptyString(command, 'command');

  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new AgentInvocationError('INVALID_CONFIG', 'Agent command args must be an array of strings');
  }

  return {
    command: command.trim(),
    args: args.map((arg) => arg),
    stdin: typeof rawTemplate.stdin === 'string' ? rawTemplate.stdin : null
  };
}

function resolveVenvPython(repoRoot) {
  const winPath = path.join(repoRoot, '.venv', 'Scripts', 'python');
  const unixPath = path.join(repoRoot, '.venv', 'bin', 'python');

  if (process.platform === 'win32') {
    return fs.existsSync(winPath) ? winPath : unixPath;
  }
  return fs.existsSync(unixPath) ? unixPath : winPath;
}

function replaceTemplateTokens(text, payload, runId, workingDir) {
  let out = text;
  const values = {
    ticketId: payload.ticketId,
    featureRef: payload.featureRef,
    title: payload.title,
    repoRoot: payload.repoRoot,
    runId,
    acceptanceCriteria: payload.acceptanceCriteria || '',
    modelId: payload.modelId || '',
    retryContext: payload.retryContext || '',
    venvPython: resolveVenvPython(payload.repoRoot),
    workingDirectory: workingDir || payload.repoRoot,
    ticketFilePath: payload.ticketFilePath || ''
  };

  for (const token of TEMPLATE_TOKENS) {
    out = out.split(`{{${token}}}`).join(values[token]);
  }

  return out;
}

function normalizeAgentName(agentName) {
  return String(agentName || '').trim().toLowerCase();
}

function agentDisplayName(agentName) {
  const normalized = normalizeAgentName(agentName);
  if (!normalized) return 'Agent';
  return normalized[0].toUpperCase() + normalized.slice(1);
}

function normalizeTemplateVariant(value) {
  const variant = String(value || '').trim().toLowerCase();
  return variant || null;
}

function resolveAgentTemplateConfig(projectRoot, agentName, options = {}) {
  const normalizedAgent = normalizeAgentName(agentName);
  if (!normalizedAgent) {
    throw new AgentInvocationError('INVALID_CONFIG', 'Agent name is required');
  }

  const templateVariant = normalizeTemplateVariant(options?.templateVariant);

  const envVarName = templateVariant
    ? `${normalizedAgent.toUpperCase()}_${templateVariant.toUpperCase()}_COMMAND_TEMPLATE`
    : `${normalizedAgent.toUpperCase()}_COMMAND_TEMPLATE`;
  const envTemplate = process.env[envVarName];
  if (envTemplate) {
    try {
      return parseTemplate(JSON.parse(envTemplate));
    } catch (error) {
      if (error instanceof AgentInvocationError) throw error;
      throw new AgentInvocationError('INVALID_CONFIG', `${envVarName} must be valid JSON`);
    }
  }

  const configPath = path.join(projectRoot, '.ombutocode', 'codingagent-templates.json');
  if (!fs.existsSync(configPath)) {
    throw new AgentInvocationError(
      'CONFIG_MISSING',
      `${agentDisplayName(normalizedAgent)} command is not configured. Set ${envVarName} or .ombutocode/codingagent-templates.json`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (error) {
    throw new AgentInvocationError('INVALID_CONFIG', `Unable to parse ${configPath} as JSON`);
  }

  const templateKey = templateVariant ? `${normalizedAgent}_${templateVariant}` : normalizedAgent;
  const fallbackKey = normalizedAgent;
  const selectedTemplate = parsed && typeof parsed === 'object'
    ? (parsed[templateKey] || parsed[fallbackKey])
    : null;

  if (!selectedTemplate) {
    throw new AgentInvocationError(
      'INVALID_CONFIG',
      templateVariant
        ? `codingagent-templates.json must contain a ${templateKey} (or ${fallbackKey}) template object`
        : `codingagent-templates.json must contain a ${normalizedAgent} template object`
    );
  }

  return parseTemplate(selectedTemplate);
}

function resolveKimiTemplateConfig(projectRoot) {
  return resolveAgentTemplateConfig(projectRoot, 'kimi');
}

function renderCommand(template, payload, runId, workingDir) {
  return {
    command: replaceTemplateTokens(template.command, payload, runId, workingDir),
    args: template.args.map((arg) => replaceTemplateTokens(arg, payload, runId, workingDir)),
    stdin: template.stdin ? replaceTemplateTokens(template.stdin, payload, runId, workingDir) : null
  };
}

function appendOutputTail(previous, chunk, maxChars) {
  const next = `${previous}${chunk}`;
  if (next.length <= maxChars) return next;
  return next.slice(next.length - maxChars);
}

function appendOutputHead(previous, chunk, maxChars) {
  const next = `${previous}${chunk}`;
  if (next.length <= maxChars) return next;
  return next.slice(0, maxChars); // Keep first maxChars for eval runs where EVALUATION_RESULT is at the beginning
}

function inferSemanticFailure(stdout, stderr) {
  const combined = `${stdout || ''}\n${stderr || ''}`.trim();
  if (!combined) return null;

  const errorCodeMatch = combined.match(/(?:^|\r?\n)\s*Error code:\s*(\d{3})\b/i);
  if (errorCodeMatch) {
    const code = errorCodeMatch[1];
    const firstLine = combined.split(/\r?\n/)[0] || '';
    return `Agent returned error output despite exit code 0 (Error code ${code}): ${firstLine}`.trim();
  }

  return null;
}

class AgentRuntime {
  constructor({ resolveTemplate, onRunStarted = null, onRunUpdated = null, onRunFinished = null }) {
    this.resolveTemplate = resolveTemplate;
    this.onRunStarted = onRunStarted;
    this.onRunUpdated = onRunUpdated;
    this.onRunFinished = onRunFinished;
    this.runsById = new Map();
    this.activeRunByTicket = new Map();
  }

  startAgent(agentName, payload, options = {}) {
    const normalizedAgent = normalizeAgentName(agentName);
    if (!normalizedAgent) {
      throw new AgentInvocationError('INVALID_PAYLOAD', 'agentName is required');
    }

    const normalized = normalizeStartPayload(payload);
    const workingDirectory = normalizeWorkingDirectory(options);
    const runCwd = workingDirectory || normalized.repoRoot;
    const activeRunId = this.activeRunByTicket.get(normalized.ticketId);
    if (activeRunId) {
      const active = this.runsById.get(activeRunId);
      if (active && (active.state === 'queued' || active.state === 'running')) {
        throw new AgentInvocationError(
          'RUN_ALREADY_ACTIVE',
          `Ticket ${normalized.ticketId} already has an active ${agentDisplayName(normalizedAgent)} run`,
          { ticketId: normalized.ticketId, runId: activeRunId }
        );
      }
    }

    const runId = randomUUID();
    const template = this.resolveTemplate(normalizedAgent, normalized, options);
    const commandDef = renderCommand(template, normalized, runId, runCwd);
    const now = new Date().toISOString();
    const isEval = normalizedAgent.endsWith('_eval'); // Detect eval runs to use HEAD truncation instead of TAIL
    const isTest = normalizedAgent.endsWith('_test'); // Detect test runs (no auto-commit, HEAD truncation)
    const run = {
      agentName: normalizedAgent,
      runId,
      ticketId: normalized.ticketId,
      payload: normalized,
      command: commandDef.command,
      args: commandDef.args,
      workingDirectory: runCwd,
      pid: null,
      state: 'queued',
      startedAt: now,
      finishedAt: null,
      signal: null,
      durationMs: null,
      exitCode: null,
      error: null,
      stdout: '',
      stderr: '',
      stdoutTruncated: false,
      stderrTruncated: false,
      isEval,
      isTest,
      lastOutputSyncAt: 0,
      child: null
    };

    this.runsById.set(runId, run);
    this.activeRunByTicket.set(normalized.ticketId, runId);

    const useStdin = !!commandDef.stdin;
    let child;
    try {
      child = spawn(commandDef.command, commandDef.args, {
        cwd: runCwd,
        stdio: [useStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32' && !path.isAbsolute(commandDef.command)
      });
    } catch (error) {
      run.state = 'failed';
      run.finishedAt = new Date().toISOString();
      run.error = error.message || String(error);
      this.activeRunByTicket.delete(normalized.ticketId);
      throw new AgentInvocationError(
        'SPAWN_FAILED',
        `Failed to spawn ${agentDisplayName(normalizedAgent)} process: ${run.error}`,
        {
        runId,
        ticketId: normalized.ticketId
        }
      );
    }

    run.child = child;
    run.pid = child.pid || null;
    run.state = 'running';

    if (useStdin && child.stdin) {
      child.stdin.write(commandDef.stdin);
      child.stdin.end();
    }

    if (typeof this.onRunStarted === 'function') {
      this.onRunStarted({ ...run });
    }

    const notifyRunUpdated = ({ force = false } = {}) => {
      if (typeof this.onRunUpdated !== 'function') return;

      const nowMs = Date.now();
      if (!force && (nowMs - (run.lastOutputSyncAt || 0)) < OUTPUT_UPDATE_THROTTLE_MS) {
        return;
      }

      run.lastOutputSyncAt = nowMs;
      this.onRunUpdated({ ...run });
    };

    const finishRun = ({ state, exitCode, signal, error }) => {
      if (run.state === 'completed' || run.state === 'failed') return;
      run.state = state;
      run.exitCode = exitCode;
      run.signal = signal || null;
      run.error = error || null;
      run.finishedAt = new Date().toISOString();
      run.durationMs = Math.max(0, Date.parse(run.finishedAt) - Date.parse(run.startedAt));
      this.activeRunByTicket.delete(run.ticketId);
      run.child = null;
      if (typeof this.onRunFinished === 'function') {
        this.onRunFinished({ ...run });
      }
    };

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
        const beforeLength = run.stdout.length;
        // For eval/test runs, keep HEAD (beginning) where structured result is; for impl runs, keep TAIL
        run.stdout = (run.isEval || run.isTest)
          ? appendOutputHead(run.stdout, text, MAX_OUTPUT_CAPTURE_CHARS)
          : appendOutputTail(run.stdout, text, MAX_OUTPUT_CAPTURE_CHARS);
        if (beforeLength + text.length > MAX_OUTPUT_CAPTURE_CHARS) {
          run.stdoutTruncated = true;
        }
        notifyRunUpdated();
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
        const beforeLength = run.stderr.length;
        // For eval/test runs, keep HEAD (beginning); for impl runs, keep TAIL (recent errors)
        run.stderr = (run.isEval || run.isTest)
          ? appendOutputHead(run.stderr, text, MAX_OUTPUT_CAPTURE_CHARS)
          : appendOutputTail(run.stderr, text, MAX_OUTPUT_CAPTURE_CHARS);
        if (beforeLength + text.length > MAX_OUTPUT_CAPTURE_CHARS) {
          run.stderrTruncated = true;
        }
        notifyRunUpdated();
      });
    }

    child.on('error', (error) => {
      finishRun({
        state: 'failed',
        exitCode: null,
        signal: null,
        error: error.message || String(error)
      });
    });

    let exitCode = null;
    let exitSignal = null;

    child.on('exit', (code, signal) => {
      exitCode = code;
      exitSignal = signal || null;
    });

    child.on('close', (code, signal) => {
      // Ensure latest output is pushed before final state processing.
      notifyRunUpdated({ force: true });

      const resolvedCode = exitCode !== null ? exitCode : code;
      const resolvedSignal = exitSignal || signal || null;
      const semanticError = resolvedCode === 0 ? inferSemanticFailure(run.stdout, run.stderr) : null;
      const isSuccess = resolvedCode === 0 && !semanticError;
      finishRun({
        state: isSuccess ? 'completed' : 'failed',
        exitCode: resolvedCode,
        signal: resolvedSignal,
        error: isSuccess
          ? null
          : (semanticError || `${agentDisplayName(normalizedAgent)} process exited with code ${resolvedCode}`)
      });
    });

    return {
      runId: run.runId,
      ticketId: run.ticketId,
      state: run.state,
      startedAt: run.startedAt
    };
  }

  startKimi(payload, options = {}) {
    return this.startAgent('kimi', payload, options);
  }

  startCodex(payload, options = {}) {
    return this.startAgent('codex', payload, options);
  }

  startClaude(payload, options = {}) {
    return this.startAgent('claude', payload, options);
  }

  getRunStatus({ runId = null, ticketId = null } = {}) {
    if (runId) {
      const run = this.runsById.get(runId);
      return run ? this._publicRun(run) : null;
    }

    if (ticketId) {
      const activeRunId = this.activeRunByTicket.get(ticketId);
      if (activeRunId) {
        const run = this.runsById.get(activeRunId);
        return run ? this._publicRun(run) : null;
      }

      const latest = Array.from(this.runsById.values())
        .filter((run) => run.ticketId === ticketId)
        .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0];
      return latest ? this._publicRun(latest) : null;
    }

    return null;
  }

  _publicRun(run) {
    return {
      runId: run.runId,
      agentName: run.agentName,
      ticketId: run.ticketId,
      state: run.state,
      command: run.command,
      args: run.args,
      workingDirectory: run.workingDirectory,
      pid: run.pid,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      signal: run.signal,
      durationMs: run.durationMs,
      exitCode: run.exitCode,
      error: run.error,
      stdout: run.stdout,
      stderr: run.stderr,
      stdoutTruncated: run.stdoutTruncated,
      stderrTruncated: run.stderrTruncated
    };
  }
}

module.exports = {
  AgentInvocationError,
  AgentRuntime,
  normalizeStartPayload,
  parseTemplate,
  normalizeAgentName,
  agentDisplayName,
  resolveAgentTemplateConfig,
  resolveKimiTemplateConfig,
  renderCommand
};
