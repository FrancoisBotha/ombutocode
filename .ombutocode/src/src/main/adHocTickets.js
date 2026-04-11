const { spawn } = require('child_process');

const DEFAULT_EPIC_REF = '.ombutocode/epics/feature_AD_HOC.md';
const MAX_PROMPT_CHARS = 12000;
const DEFAULT_COMMAND_TIMEOUT_MS = 180000;

function normalizePromptPayload(payload = {}) {
  const promptRaw = typeof payload.promptText === 'string'
    ? payload.promptText
    : typeof payload.prompt === 'string'
      ? payload.prompt
      : '';
  const promptText = promptRaw.trim();

  if (!promptText) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Prompt text is required.'
      }
    };
  }

  if (promptText.length > MAX_PROMPT_CHARS) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Prompt text is too long. Keep it under ${MAX_PROMPT_CHARS} characters.`
      }
    };
  }

  return { ok: true, promptText };
}

function buildCodexDraftPrompt(userPrompt) {
  return [
    'Draft exactly one backlog ticket from the user request.',
    'Return ONLY a JSON object and no markdown or commentary.',
    'Schema:',
    '{',
    '  "title": string,',
    '  "dependencies": string[],',
    '  "acceptance_criteria": string[],',
    '  "files_touched": string[],',
    '  "notes": string',
    '}',
    'Constraints:',
    '- title must be concise and actionable',
    '- acceptance_criteria must contain at least 1 item',
    '- dependencies may be empty',
    '- files_touched may be empty',
    '- notes should summarize intent and assumptions',
    '',
    'User request:',
    userPrompt
  ].join('\n');
}

function stripCodeFence(text) {
  const trimmed = String(text || '').trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function findFirstBalancedJsonObject(text) {
  const value = String(text || '');
  let inString = false;
  let escaped = false;
  let depth = 0;
  let start = -1;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (ch === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          return value.slice(start, i + 1);
        }
      }
    }
  }

  return null;
}

function parseCodexDraftOutput(rawOutput) {
  const text = String(rawOutput || '').trim();
  if (!text) {
    throw new Error('Codex returned empty output');
  }

  const directCandidate = stripCodeFence(text);
  try {
    return JSON.parse(directCandidate);
  } catch (_) {
    // Fall through to balanced-object parsing.
  }

  const objectSlice = findFirstBalancedJsonObject(directCandidate);
  if (!objectSlice) {
    throw new Error('Codex output did not contain a JSON object');
  }

  return JSON.parse(objectSlice);
}

function ensureStringArray(value, fieldName, { minItems = 0 } = {}) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of strings`);
  }

  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);

  if (normalized.length < minItems) {
    throw new Error(`${fieldName} must contain at least ${minItems} item(s)`);
  }

  return normalized;
}

function validateTicketDraft(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw new Error('Codex draft must be a JSON object');
  }

  const title = typeof draft.title === 'string' ? draft.title.trim() : '';
  if (!title) {
    throw new Error('title is required');
  }

  const dependencies = ensureStringArray(draft.dependencies, 'dependencies');
  const acceptanceCriteria = ensureStringArray(draft.acceptance_criteria, 'acceptance_criteria', { minItems: 1 });
  const filesTouched = ensureStringArray(draft.files_touched, 'files_touched');
  const notes = typeof draft.notes === 'string' ? draft.notes.trim() : '';

  if (!notes) {
    throw new Error('notes is required');
  }

  return {
    title,
    dependencies,
    acceptance_criteria: acceptanceCriteria,
    files_touched: filesTouched,
    notes
  };
}

function generateNextAdHocId(tickets = [], archivedMax = 0) {
  const ids = Array.isArray(tickets) ? tickets : [];
  let maxValue = typeof archivedMax === 'number' && archivedMax > 0 ? archivedMax : 0;

  for (const ticket of ids) {
    const id = typeof ticket?.id === 'string' ? ticket.id.trim() : '';
    const match = id.match(/^AD_HOC-(\d+)$/);
    if (!match) continue;
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value > maxValue) {
      maxValue = value;
    }
  }

  const nextValue = maxValue + 1;
  return `AD_HOC-${String(nextValue).padStart(3, '0')}`;
}

function buildTicketFromDraft({ draft, existingTickets = [], archivedMax = 0, promptText, nowIso, assignee = 'codex' }) {
  const timestamp = nowIso || new Date().toISOString();
  const promptSummary = String(promptText || '').replace(/\s+/g, ' ').trim();
  const promptPreview = promptSummary.length <= 220
    ? promptSummary
    : `${promptSummary.slice(0, 220)}...`;

  const draftNote = draft.notes || 'Created from ad-hoc prompt.';
  const auditLine = `[${timestamp}] Created via Backlog Add Ticket prompt: ${promptPreview}`;

  return {
    id: generateNextAdHocId(existingTickets, archivedMax),
    title: draft.title,
    epic_ref: DEFAULT_EPIC_REF,
    status: 'backlog',
    last_updated: timestamp,
    dependencies: draft.dependencies,
    acceptance_criteria: draft.acceptance_criteria,
    eval_summary: null,
    files_touched: draft.files_touched,
    notes: `${draftNote}\n${auditLine}`,
    assignee
  };
}

function appendTicketToBacklog(backlogData, ticket, nowIso) {
  const source = backlogData && typeof backlogData === 'object' ? backlogData : {};
  const tickets = Array.isArray(source.tickets) ? source.tickets : [];
  const timestamp = nowIso || new Date().toISOString();

  return {
    ...source,
    version: source.version || 1,
    updated_at: timestamp.split('T')[0],
    tickets: [...tickets, ticket]
  };
}

async function runCodexDraftCommand({ command, args, cwd, stdinData = null, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer = null;

    const child = spawn(command, args, {
      cwd,
      stdio: [stdinData ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });

    if (stdinData) {
      child.stdin.write(stdinData);
      child.stdin.end();
    }

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
      }, timeoutMs);
    }

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(new Error(`Agent invocation failed (spawn error): ${err.message}`));
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);

      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const details = [
          `exit_code=${code}`,
          signal ? `signal=${signal}` : null,
          stderr.trim() ? `stderr: ${stderr.trim()}` : null,
          stdout.trim() ? `stdout (first 500 chars): ${stdout.trim().slice(0, 500)}` : null
        ].filter(Boolean).join('; ');
        reject(new Error(`Agent invocation failed (${details})`));
      }
    });
  });
}

/**
 * Build draft args from the agent's template in codingagent-templates.json.
 * Takes the template args, keeps all CLI flags (everything up to and including '--'),
 * strips the original prompt, replaces {{repoRoot}} tokens, and appends the draft prompt.
 */
function buildDraftArgsFromTemplate(templateArgs, draftPrompt, projectRoot, { modelId } = {}) {
  const args = Array.isArray(templateArgs) ? [...templateArgs] : [];

  // Find the '--' separator; everything after it is the prompt to replace
  const separatorIdx = args.indexOf('--');
  // Check if template uses stdin for prompt (Claude with --print)
  const hasStdinPrompt = args.includes('--print');
  let flagArgs;
  if (separatorIdx >= 0) {
    // Keep flags + separator, drop original prompt
    flagArgs = args.slice(0, separatorIdx + 1);
  } else if (hasStdinPrompt) {
    // Stdin-based templates (Claude): prompt goes via stdin, keep ALL args
    flagArgs = [...args];
  } else {
    // No separator: for codex-style (exec --sandbox ... <prompt>) or kimi (--prompt <prompt>),
    // the last arg is the prompt — drop it
    flagArgs = args.slice(0, -1);
  }

  // Replace known template tokens with actual values
  flagArgs = flagArgs.map(a => a.split('{{repoRoot}}').join(projectRoot));
  flagArgs = flagArgs.map(a => a.split('{{workingDirectory}}').join(projectRoot));
  if (modelId) {
    flagArgs = flagArgs.map(a => a.split('{{modelId}}').join(modelId));
  }
  // Strip any remaining template tokens ({{ticketId}}, {{title}}, etc.) that don't apply to drafts
  flagArgs = flagArgs.map(a => a.replace(/\{\{[^}]+\}\}/g, ''));
  // Remove flag-value pairs where the value became empty after token stripping
  // (e.g. --model '' would cause API errors)
  const cleaned = [];
  for (let i = 0; i < flagArgs.length; i++) {
    if (flagArgs[i].startsWith('--') && i + 1 < flagArgs.length && flagArgs[i + 1] === '') {
      i++; // skip the empty value
    } else if (flagArgs[i] === '') {
      // skip standalone empty strings
    } else {
      cleaned.push(flagArgs[i]);
    }
  }
  flagArgs = cleaned;

  // For output format: drafts only need text output, swap stream-json if present
  const fmtIdx = flagArgs.indexOf('--output-format');
  if (fmtIdx >= 0 && fmtIdx + 1 < flagArgs.length) {
    flagArgs[fmtIdx + 1] = 'text';
  }

  // Remove --verbose for drafts (unnecessary noise)
  const verboseIdx = flagArgs.indexOf('--verbose');
  if (verboseIdx >= 0) {
    flagArgs.splice(verboseIdx, 1);
  }

  if (draftPrompt) {
    flagArgs.push(draftPrompt);
  }
  return flagArgs;
}

function createAdHocTicketCreator({
  projectRoot,
  resolveTemplateConfig,
  readAdHocTicketAgent = null,
  readAdHocTicketModel = null,
  runDraftCommand = runCodexDraftCommand,
  readBacklogData,
  writeBacklogData,
  getArchivedMaxId = () => 0,
  now = () => new Date().toISOString()
}) {
  let inFlightCreate = null;

  return async function createAdHocFromPrompt(payload = {}) {
    if (inFlightCreate) {
      return {
        success: false,
        error: {
          code: 'REQUEST_IN_FLIGHT',
          message: 'Ad-hoc ticket creation is already in progress. Please wait.'
        }
      };
    }

    const prompt = normalizePromptPayload(payload);
    if (!prompt.ok) {
      return {
        success: false,
        error: prompt.error
      };
    }

    inFlightCreate = (async () => {
      try {
        const configuredAgent = typeof readAdHocTicketAgent === 'function'
          ? String(readAdHocTicketAgent() || '').trim().toLowerCase()
          : '';
        const selectedAgent = configuredAgent || 'codex';
        const selectedTemplate = resolveTemplateConfig(projectRoot, selectedAgent);
        const configuredModel = typeof readAdHocTicketModel === 'function'
          ? String(readAdHocTicketModel() || '').trim()
          : '';
        const draftPrompt = buildCodexDraftPrompt(prompt.promptText);

        // Claude with --print expects prompt via stdin, not as a CLI arg.
        // Detect by checking if the template has a 'stdin' field or uses --print.
        const useStdin = selectedTemplate.stdin !== undefined
          || (Array.isArray(selectedTemplate.args) && selectedTemplate.args.includes('--print'));

        const draftArgs = buildDraftArgsFromTemplate(
          selectedTemplate.args, useStdin ? null : draftPrompt, projectRoot,
          configuredModel ? { modelId: configuredModel } : {}
        );
        // Remove trailing null/empty args from buildDraftArgsFromTemplate when prompt was null
        const cleanedArgs = draftArgs.filter(a => a != null && a !== '');

        const { stdout } = await runDraftCommand({
          command: selectedTemplate.command,
          args: cleanedArgs,
          cwd: projectRoot,
          stdinData: useStdin ? draftPrompt : null
        });

        const parsedDraft = parseCodexDraftOutput(stdout);
        const validatedDraft = validateTicketDraft(parsedDraft);
        const backlogData = readBacklogData();
        const archivedMax = typeof getArchivedMaxId === 'function' ? getArchivedMaxId() : 0;
        const createdAt = now();
        const ticket = buildTicketFromDraft({
          draft: validatedDraft,
          existingTickets: backlogData.tickets,
          archivedMax,
          promptText: prompt.promptText,
          nowIso: createdAt,
          assignee: selectedAgent
        });
        const updatedBacklog = appendTicketToBacklog(backlogData, ticket, createdAt);

        writeBacklogData(updatedBacklog);

        return {
          success: true,
          data: {
            ticketId: ticket.id,
            ticket
          },
          error: null
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'AGENT_DRAFT_FAILED',
            message: error?.message || 'Unable to create ad-hoc ticket.'
          }
        };
      }
    })();

    try {
      return await inFlightCreate;
    } finally {
      inFlightCreate = null;
    }
  };
}

module.exports = {
  DEFAULT_EPIC_REF,
  MAX_PROMPT_CHARS,
  normalizePromptPayload,
  buildCodexDraftPrompt,
  parseCodexDraftOutput,
  validateTicketDraft,
  generateNextAdHocId,
  buildTicketFromDraft,
  appendTicketToBacklog,
  runCodexDraftCommand,
  createAdHocTicketCreator
};
