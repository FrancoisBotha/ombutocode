'use strict';

const fs = require('fs');
const path = require('path');
const { createWindowTracker } = require('./windowTracker');
const {
  createWorktreeSync: createWorktree,
  prepareEvalTrialMergeSync: prepareEvalTrialMerge,
  cleanupEvalTrialMergeSync: cleanupEvalTrialMerge,
  rebaseTicketBranchSync: rebaseTicketBranch,
  updateTicketBranchSync: updateTicketBranch
} = require('./worktreeManager');

const DEFAULT_QUEUE_ESTIMATE_INTERVAL_MS = 30000; // 30 seconds
const LIMIT_SIGNAL_PATTERN = /\b(rate[_\s-]?limit(?:ed)?\b|session[_\s-]?limit\b|too many requests|quota exceeded|(?:status|code|error|http)[:\s]*429|429[:\s]*(?:too many|rate|limit)|out of (?:.*\s)?messages|hit (?:.*\s)?limit|usage (?:limit|cap)|message limit|messages remaining:\s*0)\b/i;
const EXPIRY_KEY_PATTERN = /\b(reset(?:_at|at|time)?|retry(?:_after|after)?|expires?(?:_at|at)?|resume(?:_at|at)?)\b/i;

const RETRY_CONTEXT_MAX_LENGTH = 2000;
const STDERR_EXCERPT_MAX_LENGTH = 500;
const EVAL_POST_MERGE_COOLDOWN_MS = 15000; // 15 seconds after squash-merge

function buildRetryContext(ticket) {
  const failCount = Number(ticket.fail_count) || 0;
  const evalFailCount = Number(ticket.eval_fail_count) || 0;
  if (failCount < 1 && evalFailCount < 1) return '';

  const parts = [];

  // Extract failing criteria from eval_summary
  const checks = ticket.eval_summary?.criteria_checks;
  if (Array.isArray(checks)) {
    const failing = checks.filter((c) => c.result === 'FAIL');
    if (failing.length > 0) {
      const verdict = ticket.eval_summary.verdict || 'FAIL';
      parts.push(`Eval verdict: ${verdict}`);
      parts.push('Failing criteria:');
      for (const fc of failing) {
        let line = `- ${fc.criterion || 'unknown criterion'}`;
        if (fc.failure_reason) line += `\n  Reason: ${fc.failure_reason}`;
        if (fc.suggestion) line += `\n  Suggestion: ${fc.suggestion}`;
        parts.push(line);
      }
    }
  }

  // Extract test failures from test_summary
  const testChecks = ticket.test_summary?.checks;
  if (Array.isArray(testChecks)) {
    const failing = testChecks.filter((c) => c.result === 'FAIL');
    if (failing.length > 0) {
      parts.push(`Test verdict: ${ticket.test_summary.verdict || 'FAIL'}`);
      parts.push('Failing checks:');
      for (const fc of failing) {
        let line = `- ${fc.check_name || 'unknown check'}`;
        if (fc.details) line += `\n  Details: ${fc.details}`;
        parts.push(line);
      }
    }
  }

  // Fallback: when structured parsing failed but raw eval output exists
  if ((!Array.isArray(checks) || checks.length === 0) && ticket.eval_summary) {
    const verdict = ticket.eval_summary.verdict || 'FAIL';
    const rawExcerpt = ticket.eval_summary.raw_excerpt;
    if (rawExcerpt) {
      parts.push(`Eval verdict: ${verdict}`);
      parts.push(`Raw eval excerpt:\n${rawExcerpt}`);
    }
  }

  // Extract error from last failed run
  const agentError = ticket.agent?.error;
  if (agentError) {
    parts.push(`Last run error: ${agentError}`);
  }

  // Extract truncated stderr excerpt from log file
  const stderrLogFile = ticket.agent?.stderr_log_file;
  if (stderrLogFile) {
    try {
      const raw = fs.readFileSync(stderrLogFile, 'utf-8');
      if (raw.length > 0) {
        const excerpt = raw.length > STDERR_EXCERPT_MAX_LENGTH
          ? raw.slice(-STDERR_EXCERPT_MAX_LENGTH)
          : raw;
        parts.push(`Stderr excerpt:\n${excerpt}`);
      }
    } catch (_) {
      // Log file may no longer exist — skip silently
    }
  }

  if (parts.length === 0) return '';

  let context = '--- PREVIOUS FAILURE CONTEXT ---\n' + parts.join('\n') + '\n--- END FAILURE CONTEXT ---';
  if (context.length > RETRY_CONTEXT_MAX_LENGTH) {
    context = context.slice(0, RETRY_CONTEXT_MAX_LENGTH - 3) + '...';
  }
  return context;
}

function toValidDate(candidate) {
  const date = new Date(candidate);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

function parseNumericExpiry(keyword, numericValue, nowMs) {
  const normalizedKeyword = String(keyword || '').toLowerCase();
  const numeric = Number(numericValue);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  if (normalizedKeyword.includes('retry_after') || normalizedKeyword.includes('retryafter')) {
    // Providers often return retry_after as seconds from now.
    if (numeric < 1000000000) {
      return new Date(nowMs + (numeric * 1000));
    }
  }

  if (numeric > 1000000000000) {
    return toValidDate(numeric);
  }

  if (numeric > 1000000000) {
    return toValidDate(numeric * 1000);
  }

  // Conservative fallback for relative durations.
  if (numeric <= 86400) {
    return new Date(nowMs + (numeric * 1000));
  }

  return null;
}

function collectRunErrorSegments(run = {}) {
  const segments = [];

  const pushText = (value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed) segments.push(trimmed);
  };

  pushText(run.error);
  pushText(run.stderr);
  pushText(run.stdout);

  const structuredKeys = [
    'errorDetails',
    'error_details',
    'providerError',
    'provider_error',
    'runtimeError',
    'runtime_error'
  ];

  for (const key of structuredKeys) {
    const value = run[key];
    if (!value) continue;
    if (typeof value === 'string') {
      pushText(value);
      continue;
    }
    if (typeof value === 'object') {
      try {
        segments.push(JSON.stringify(value));
      } catch (_) {
        // Ignore serialization failures and continue with remaining fields.
      }
    }
  }

  return segments;
}

function inferPauseExpiryFromSegments(segments = []) {
  const nowMs = Date.now();
  let bestDate = null;

  const weekdayIndexByToken = {
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    weds: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6
  };

  function isValidTimeZone(candidate) {
    if (!candidate) return false;
    try {
      Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
      return true;
    } catch (_) {
      return false;
    }
  }

  function getZonedDateParts(timestampMs, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(new Date(timestampMs));
    const result = {};
    for (const part of parts) {
      if (part.type === 'year') result.year = Number(part.value);
      if (part.type === 'month') result.month = Number(part.value);
      if (part.type === 'day') result.day = Number(part.value);
      if (part.type === 'hour') result.hour = Number(part.value);
      if (part.type === 'minute') result.minute = Number(part.value);
    }
    return result;
  }

  function addDaysToYmd(year, month, day, daysToAdd) {
    const base = new Date(Date.UTC(year, month - 1, day));
    base.setUTCDate(base.getUTCDate() + daysToAdd);
    return {
      year: base.getUTCFullYear(),
      month: base.getUTCMonth() + 1,
      day: base.getUTCDate()
    };
  }

  function toUtcFromZonedDateTime(parts, timeZone) {
    if (!isValidTimeZone(timeZone)) return null;

    let candidateMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      0,
      0
    );

    // Iteratively converge local time in the target timezone to desired wall-clock parts.
    for (let i = 0; i < 4; i += 1) {
      const actual = getZonedDateParts(candidateMs, timeZone);
      const desiredAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
      const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
      const deltaMs = desiredAsUtc - actualAsUtc;
      if (deltaMs === 0) break;
      candidateMs += deltaMs;
    }

    const finalDate = new Date(candidateMs);
    if (!Number.isFinite(finalDate.getTime())) return null;
    return finalDate;
  }

  function buildResetDateTime(match) {
    const dayToken = (match[1] || '').trim().toLowerCase();
    const hourToken = match[2];
    const minuteToken = match[3];
    const meridiemToken = (match[4] || '').trim().toLowerCase();
    const timezoneRaw = (match[5] || '').trim();
    const timezone = isValidTimeZone(timezoneRaw) ? timezoneRaw : null;

    const hour = Number(hourToken);
    const minute = minuteToken ? Number(minuteToken) : 0;
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    if (minute < 0 || minute > 59) return null;

    let normalizedHour = hour;
    if (meridiemToken) {
      if (hour < 1 || hour > 12) return null;
      normalizedHour = hour % 12;
      if (meridiemToken === 'pm') normalizedHour += 12;
    } else if (hour < 0 || hour > 23) {
      return null;
    }

    const now = new Date(nowMs);
    let dateParts = null;

    if (timezone) {
      const nowParts = getZonedDateParts(nowMs, timezone);
      dateParts = { year: nowParts.year, month: nowParts.month, day: nowParts.day };
    } else {
      dateParts = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
    }

    if (dayToken === 'tomorrow') {
      dateParts = addDaysToYmd(dateParts.year, dateParts.month, dateParts.day, 1);
    } else if (dayToken && dayToken !== 'today') {
      const targetWeekday = weekdayIndexByToken[dayToken];
      if (Number.isFinite(targetWeekday)) {
        const currentWeekday = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day)).getUTCDay();
        let deltaDays = (targetWeekday - currentWeekday + 7) % 7;
        if (deltaDays < 0) deltaDays += 7;
        dateParts = addDaysToYmd(dateParts.year, dateParts.month, dateParts.day, deltaDays);
      }
    }

    const candidate = timezone
      ? toUtcFromZonedDateTime({
        year: dateParts.year,
        month: dateParts.month,
        day: dateParts.day,
        hour: normalizedHour,
        minute
      }, timezone)
      : new Date(dateParts.year, dateParts.month - 1, dateParts.day, normalizedHour, minute, 0, 0);

    if (!candidate || !Number.isFinite(candidate.getTime())) return null;

    if (candidate.getTime() <= nowMs) {
      const nextDateParts = addDaysToYmd(dateParts.year, dateParts.month, dateParts.day, 1);
      const nextCandidate = timezone
        ? toUtcFromZonedDateTime({
          year: nextDateParts.year,
          month: nextDateParts.month,
          day: nextDateParts.day,
          hour: normalizedHour,
          minute
        }, timezone)
        : new Date(
          nextDateParts.year,
          nextDateParts.month - 1,
          nextDateParts.day,
          normalizedHour,
          minute,
          0,
          0
        );
      return nextCandidate;
    }

    return candidate;
  }

  for (const segment of segments) {
    const text = String(segment || '');
    if (!text) continue;

    // Parse key/value style entries such as reset_at, retry_after, expires_at.
    const keyValueRegex = /((?:reset(?:_at|at|time)?|retry(?:_after|after)?|expires?(?:_at|at)?|resume(?:_at|at)?))\s*[:=]\s*("?)([^\s,"'}\]]+)\2/gi;
    let keyValueMatch;
    while ((keyValueMatch = keyValueRegex.exec(text)) !== null) {
      const key = keyValueMatch[1] || '';
      const rawValue = keyValueMatch[3] || '';
      const parsedNumeric = parseNumericExpiry(key, rawValue, nowMs);
      const parsedDate = parsedNumeric || toValidDate(rawValue);
      if (parsedDate && parsedDate.getTime() > nowMs) {
        if (!bestDate || parsedDate.getTime() > bestDate.getTime()) {
          bestDate = parsedDate;
        }
      }
    }

    // Parse free-form ISO date/time values in output text.
    const isoRegex = /\b(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2}))\b/g;
    let isoMatch;
    while ((isoMatch = isoRegex.exec(text)) !== null) {
      const parsedDate = toValidDate(isoMatch[1]);
      if (parsedDate && parsedDate.getTime() > nowMs) {
        if (!bestDate || parsedDate.getTime() > bestDate.getTime()) {
          bestDate = parsedDate;
        }
      }
    }

    // Parse "retry in/after <n> <unit>" formats.
    const durationRegex = /\b(?:retry|try again|wait)\s+(?:after|in)\s+(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\b/gi;
    let durationMatch;
    while ((durationMatch = durationRegex.exec(text)) !== null) {
      const amount = Number(durationMatch[1]);
      const unit = (durationMatch[2] || '').toLowerCase();
      if (!Number.isFinite(amount) || amount <= 0) continue;

      let multiplierMs = 1000;
      if (unit.startsWith('m')) {
        multiplierMs = 60000;
      } else if (unit.startsWith('h')) {
        multiplierMs = 3600000;
      }

      const parsedDate = new Date(nowMs + (amount * multiplierMs));
      if (!bestDate || parsedDate.getTime() > bestDate.getTime()) {
        bestDate = parsedDate;
      }
    }

    // Parse human-readable reset messages, e.g. "resets on 10:11 PM", "resets 10pm (Australia/Sydney)".
    const humanResetRegex = /\breset(?:s)?\s*(?:on|at)?\s*(?:(today|tomorrow|sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday|rsday)?|fri(?:day)?|sat(?:urday)?)\s*(?:at)?\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b(?:\s*\(([^)]+)\))?/gi;
    let humanResetMatch;
    while ((humanResetMatch = humanResetRegex.exec(text)) !== null) {
      const parsedDate = buildResetDateTime(humanResetMatch);
      if (parsedDate && parsedDate.getTime() > nowMs) {
        if (!bestDate || parsedDate.getTime() > bestDate.getTime()) {
          bestDate = parsedDate;
        }
      }
    }
  }

  return bestDate;
}

function parseProviderPauseFromRun(run = {}, agentConfig = {}) {
  const segments = collectRunErrorSegments(run);
  if (segments.length === 0) return null;

  const combinedText = segments.join('\n');
  if (!LIMIT_SIGNAL_PATTERN.test(combinedText)) return null;

  // Try to infer pause expiry from segments
  const pauseUntil = inferPauseExpiryFromSegments(segments);

  // If expiry was inferred, return it
  if (pauseUntil) {
    return {
      reason: `Provider rate limit until ${pauseUntil.toISOString()}`,
      pauseUntil: pauseUntil.toISOString()
    };
  }

  // If no expiry inferred, check for fallback cooldown
  const cooldownMinutes = Number.isFinite(agentConfig.rate_limit_cooldown_minutes)
    ? agentConfig.rate_limit_cooldown_minutes
    : 60; // default: 60 minute cooldown when no reset time found

  if (cooldownMinutes > 0) {
    const fallbackPauseUntil = new Date(Date.now() + (cooldownMinutes * 60000));
    return {
      reason: `Provider rate limit detected — no reset time found, cooling down for ${cooldownMinutes} minutes`,
      pauseUntil: fallbackPauseUntil.toISOString()
    };
  }

  return null;
}

/**
 * Creates a scheduler that automatically picks up todo tickets and invokes agents.
 *
 * @param {Object} deps
 * @param {Function} deps.readBacklogData  — returns { tickets: [...] }
 * @param {Function} deps.writeBacklogData — persists backlog data object
 * @param {Function} deps.readAgentsConfig — returns { tools: [...] }
 * @param {Object}   deps.agentRuntime     — AgentRuntime instance
 * @param {string}   deps.projectRoot      — repo root path
 * @returns {{ start: Function, stop: Function, isRunning: Function, getStatus: Function, dispatch: Function, onRunFinished: Function, windowTracker: Object }}
 */
function createScheduler(deps) {
  const {
    readBacklogData,
    writeBacklogData = null,
    readAgentsConfig,
    readEvalDefaultAgent = null,
    readRefreshInterval = null,
    agentRuntime,
    projectRoot,
    createTicketWorktree = createWorktree,
    createEvalTrialMerge = prepareEvalTrialMerge,
    cleanupEvalTrial = cleanupEvalTrialMerge,
    rebaseOnConflict = rebaseTicketBranch,
    updateTicketBranchFn = updateTicketBranch,
    onEvalPreparationFailed = () => {},
    logEvent = () => {}
  } = deps;

  let running = false;
  let dispatching = false;
  let dispatchQueued = false;
  let currentQueueEstimateIntervalMs = DEFAULT_QUEUE_ESTIMATE_INTERVAL_MS;

  // In-memory tracking for cooldown
  const lastFinished = {}; // { [toolId]: Date timestamp }
  let lastSquashMergeAt = 0; // timestamp of last squash-merge to main
  const runAssignments = new Map(); // runId -> { toolId, modelId, costPerRun }

  // Rolling window tracker for usage counting and auto-pause/resume
  const windowTracker = createWindowTracker({ projectRoot });

  function isRunning() {
    return running;
  }

  function start() {
    if (running) return;
    running = true;

    // Keep refresh interval for queue ETA/status display.
    currentQueueEstimateIntervalMs = getCurrentQueueEstimateIntervalMs();

    // Transition dependency-free todo tickets to 'building' status
    transitionEligibleTodoToBuilding();

    console.log('[Scheduler] Started (event-driven dispatch)');
    logEvent('scheduler.started', 'info', 'Scheduler started (event-driven dispatch)');
    dispatch({ reason: 'start' });
  }

  function stop() {
    if (!running) return;

    // Revert 'building' tickets back to 'todo' status
    revertBuildingToTodo();

    // Revert 'merging' tickets (without active agents) back to 'todo'
    revertMergingToTodo();

    running = false;
    console.log('[Scheduler] Stopped');
    logEvent('scheduler.stopped', 'info', 'Scheduler stopped');
  }

  /**
   * Transition all dependency-free todo tickets to 'building' status.
   * Called when the scheduler starts (Auto toggled ON).
   */
  /**
   * Check if the assignee for a ticket has available capacity to take on work.
   * Returns false if all matching tools are at max_concurrent for implementation.
   * @param {Map} [buildingCountByTool] — counts tickets already in building status
   *   or queued for building in the current batch (includes tickets not yet dispatched).
   */
  function hasAssigneeCapacity(ticket, enabledCombos, ticketStatusById, buildingCountByTool = null) {
    const candidates = getAssigneeCandidates(ticket?.assignee, enabledCombos);
    if (candidates.length === 0) return false;

    for (const { tool, model } of candidates) {
      if (!canPickUp(tool, model, ticket, ticketStatusById)) continue;

      // Also account for building tickets not yet reflected in agentRuntime active runs
      const buildingCount = buildingCountByTool ? (buildingCountByTool.get(tool.id) || 0) : 0;
      const maxConcurrent = tool.max_concurrent || 1;
      const activeImplementationCount = countActiveRunsForToolByQueue(tool.id, 'todo', ticketStatusById)
        + countActiveRunsForToolByQueue(tool.id, 'building', ticketStatusById);

      // Use the higher of runtime active count or building ticket count
      // (building tickets may not have active runs yet)
      const effectiveCount = Math.max(activeImplementationCount, buildingCount);
      if (effectiveCount < maxConcurrent) return true;
    }
    return false;
  }

  /**
   * Count tickets already in 'building' status per assignee tool.
   * Used to seed capacity tracking so existing building tickets are respected.
   */
  function countBuildingTicketsByTool(tickets, enabledCombos) {
    const counts = new Map();
    for (const ticket of tickets) {
      if (ticket?.status !== 'building') continue;
      const candidates = getAssigneeCandidates(ticket?.assignee, enabledCombos);
      for (const { tool } of candidates) {
        counts.set(tool.id, (counts.get(tool.id) || 0) + 1);
        break; // Count once per ticket
      }
    }
    return counts;
  }

  /**
   * Build the list of enabled tool+model combinations from agent config.
   */
  function getEnabledCombos() {
    let agentsConfig;
    try {
      agentsConfig = readAgentsConfig();
    } catch (e) {
      return [];
    }
    const tools = agentsConfig?.tools || [];
    const combos = [];
    for (const tool of tools) {
      if (!tool.enabled) continue;
      for (const model of tool.models || []) {
        if (!model.enabled) continue;
        combos.push({ tool, model });
      }
    }
    return combos;
  }

  function transitionEligibleTodoToBuilding() {
    if (typeof writeBacklogData !== 'function') return;

    let backlog;
    try {
      backlog = readBacklogData();
    } catch (e) {
      console.error('[Scheduler] Failed to read backlog for building transition:', e.message);
      return;
    }

    const tickets = Array.isArray(backlog?.tickets) ? backlog.tickets : [];
    const ticketStatusById = createTicketStatusIndex(backlog);
    const enabledCombos = getEnabledCombos();
    // Seed with existing building tickets so they count against capacity
    const buildingCountByTool = countBuildingTicketsByTool(tickets, enabledCombos);
    const timestamp = new Date().toISOString();
    let changed = false;

    for (const ticket of tickets) {
      if (ticket?.status !== 'todo') continue;
      if (ticket.agent?.state === 'merge_failed' || ticket.agent?.state === 'merge_aborted') continue; // These go to merging, not building
      if (!hasExplicitAssignee(ticket)) continue;
      if (!hasResolvedDependencies(ticket, ticketStatusById)) continue;
      if (!hasAssigneeCapacity(ticket, enabledCombos, ticketStatusById, buildingCountByTool)) continue;

      ticket.status = 'building';
      ticket.last_updated = timestamp;
      changed = true;

      // Track this transition so subsequent tickets respect capacity
      const candidates = getAssigneeCandidates(ticket.assignee, enabledCombos);
      for (const { tool } of candidates) {
        buildingCountByTool.set(tool.id, (buildingCountByTool.get(tool.id) || 0) + 1);
        break; // Count once per ticket (first matching tool)
      }
    }

    if (changed) {
      try {
        writeBacklogData(backlog);
        console.log('[Scheduler] Transitioned eligible todo tickets to building');
        logEvent('ticket.todo_to_building', 'info', 'Transitioned eligible todo tickets to building');
      } catch (e) {
        console.error('[Scheduler] Failed to write backlog for building transition:', e.message);
      }
    }
  }

  /**
   * Revert all 'building' tickets back to 'todo' status.
   * Called when the scheduler stops (Auto toggled OFF).
   */
  function revertBuildingToTodo() {
    if (typeof writeBacklogData !== 'function') return;

    let backlog;
    try {
      backlog = readBacklogData();
    } catch (e) {
      console.error('[Scheduler] Failed to read backlog for building revert:', e.message);
      return;
    }

    const tickets = Array.isArray(backlog?.tickets) ? backlog.tickets : [];
    const timestamp = new Date().toISOString();
    let changed = false;

    for (const ticket of tickets) {
      if (ticket?.status !== 'building') continue;

      ticket.status = 'todo';
      ticket.last_updated = timestamp;
      changed = true;
    }

    if (changed) {
      try {
        writeBacklogData(backlog);
        console.log('[Scheduler] Reverted building tickets back to todo');
        logEvent('ticket.building_to_todo', 'info', 'Reverted building tickets back to todo');
      } catch (e) {
        console.error('[Scheduler] Failed to write backlog for building revert:', e.message);
      }
    }
  }

  /**
   * Revert 'merging' tickets (without active agents) back to 'todo' status,
   * keeping agent.state as 'merge_failed' so they can be re-transitioned.
   * Called when the scheduler stops (Auto toggled OFF).
   */
  function revertMergingToTodo() {
    if (typeof writeBacklogData !== 'function') return;

    let backlog;
    try {
      backlog = readBacklogData();
    } catch (e) {
      console.error('[Scheduler] Failed to read backlog for merging revert:', e.message);
      return;
    }

    const tickets = Array.isArray(backlog?.tickets) ? backlog.tickets : [];
    const timestamp = new Date().toISOString();
    let changed = false;

    for (const ticket of tickets) {
      if (ticket?.status !== 'merging') continue;

      // Only revert if no active agent run
      const existingStatus = agentRuntime.getRunStatus({ ticketId: ticket.id });
      if (existingStatus && (existingStatus.state === 'running' || existingStatus.state === 'queued')) {
        continue;
      }

      ticket.status = 'todo';
      ticket.agent = {
        ...(ticket.agent || {}),
        state: 'merge_failed'
      };
      ticket.last_updated = timestamp;
      changed = true;
    }

    if (changed) {
      try {
        writeBacklogData(backlog);
        console.log('[Scheduler] Reverted merging tickets back to todo (merge_failed)');
        logEvent('ticket.merging_to_todo', 'info', 'Reverted merging tickets back to todo');
      } catch (e) {
        console.error('[Scheduler] Failed to write backlog for merging revert:', e.message);
      }
    }
  }

  /**
   * Get queue estimate interval in milliseconds from settings.
   * Falls back to default if settings are unavailable.
   */
  function getCurrentQueueEstimateIntervalMs() {
    if (typeof readRefreshInterval === 'function') {
      try {
        const seconds = readRefreshInterval();
        if (Number.isFinite(seconds) && seconds > 0) {
          return seconds * 1000;
        }
      } catch (error) {
        console.warn('[Scheduler] Failed to read refresh interval:', error?.message || error);
      }
    }
    return DEFAULT_QUEUE_ESTIMATE_INTERVAL_MS;
  }

  /**
   * Update queue ETA interval used for status display.
   * @param {number} intervalSeconds - interval in seconds
   */
  function setPollInterval(intervalSeconds) {
    const newIntervalMs = Number.isFinite(intervalSeconds) && intervalSeconds > 0
      ? intervalSeconds * 1000
      : DEFAULT_QUEUE_ESTIMATE_INTERVAL_MS;

    currentQueueEstimateIntervalMs = newIntervalMs;
    console.log(`[Scheduler] Updated queue ETA interval to ${currentQueueEstimateIntervalMs}ms`);
  }

  function getStatus() {
    windowTracker.refreshExpiredPauses();
    const activeRuns = getActiveRuns();
    const queue = getQueueInfo(activeRuns);
    const pauseReason = resolvePauseReason();
    const agentPauses = getAgentPauseStatus();
    const activeRunCounts = {
      implementation: activeRuns.filter((run) => run.queueStatus === 'todo' || run.queueStatus === 'building').length,
      evaluation: activeRuns.filter((run) => run.queueStatus === 'eval').length,
      merging: activeRuns.filter((run) => run.queueStatus === 'merging').length,
      unknown: activeRuns.filter((run) => !run.queueStatus).length
    };

    return {
      status: running ? (pauseReason ? 'paused' : 'running') : 'stopped',
      pauseReason,
      pollIntervalMs: currentQueueEstimateIntervalMs,
      queue,
      agentPauses,
      activeRunCounts,
      activeRuns
    };
  }

  function getAutomationActiveRuns(options = {}) {
    const includeQueued = options?.includeQueued !== false;
    const runs = getActiveRuns();
    if (includeQueued) {
      return runs;
    }
    return runs.filter((run) => run.state === 'running');
  }

  function getAutomationEvalQueue(options = {}) {
    const limit = Number.isInteger(options?.limit) && options.limit > 0
      ? options.limit
      : 25;

    const backlog = readBacklogDataSafe();
    if (!backlog) {
      return {
        totalTickets: 0,
        activeCount: 0,
        readyCount: 0,
        tickets: [],
        activeTicketIds: [],
        error: 'Failed to read backlog'
      };
    }

    const tickets = Array.isArray(backlog?.tickets) ? backlog.tickets : [];
    const evalTickets = tickets.filter((ticket) => ticket?.status === 'eval');
    const activeRuns = getActiveRuns();
    const activeEvalTicketIds = new Set(
      activeRuns
        .filter((run) => run.queueStatus === 'eval')
        .map((run) => run.ticketId)
        .filter(Boolean)
    );
    const ticketStatusById = createTicketStatusIndex(backlog);
    const queueBaseMs = Date.now();
    let readyIndex = 0;

    const queueTickets = evalTickets
      .filter((ticket) => !activeEvalTicketIds.has(ticket.id))
      .map((ticket) => {
        const queueAssignee = resolveEvalQueueAssignee(ticket);
        const dependencyReady = hasResolvedDependencies(ticket, ticketStatusById);
        const assigneeReady = hasExplicitAssignee({ assignee: queueAssignee });
        const ready = dependencyReady && assigneeReady;

        let estimatedPickupAt = null;
        if (ready) {
          readyIndex += 1;
          estimatedPickupAt = new Date(
            queueBaseMs + (readyIndex * currentQueueEstimateIntervalMs)
          ).toISOString();
        }

        return {
          id: ticket.id,
          title: ticket.title || ticket.id,
          assignee: queueAssignee,
          ready,
          blockedByDependencies: !dependencyReady,
          estimatedPickupAt
        };
      });

    return {
      totalTickets: evalTickets.length,
      activeCount: activeEvalTicketIds.size,
      readyCount: queueTickets.filter((ticket) => ticket.ready).length,
      tickets: queueTickets.slice(0, limit),
      activeTicketIds: Array.from(activeEvalTicketIds)
    };
  }

  function getAutomationAgentStatus(options = {}) {
    windowTracker.refreshExpiredPauses();
    clearLegacyProgrammaticPauses();
    const includeDisabled = options?.includeDisabled === true;
    const agentsConfig = readAgentsConfigSafe();
    const tools = Array.isArray(agentsConfig?.tools) ? agentsConfig.tools : [];
    const state = windowTracker.loadState();
    const windows = state?.windows && typeof state.windows === 'object' ? state.windows : {};
    const ticketStatusById = createTicketStatusIndex(readBacklogDataSafe());
    const nowMs = Date.now();
    const defaultEvalAssignee = resolveEvalAssignee();

    const agentStatus = tools
      .filter((tool) => includeDisabled || tool?.enabled)
      .map((tool) => {
        const toolId = String(tool?.id || '').trim();
        const toolName = String(tool?.name || toolId || 'Unknown');
        const maxConcurrent = Number.isInteger(tool?.max_concurrent) && tool.max_concurrent > 0
          ? tool.max_concurrent
          : 1;
        const activeImplementationRuns = countActiveRunsForToolByQueue(
          toolId,
          'todo',
          ticketStatusById
        ) + countActiveRunsForToolByQueue(
          toolId,
          'building',
          ticketStatusById
        );
        const activeTestRuns = countActiveRunsForToolByQueue(
          toolId,
          'test',
          ticketStatusById
        );
        const activeEvaluationRuns = countActiveRunsForToolByQueue(
          toolId,
          'eval',
          ticketStatusById
        );
        const activeMergingRuns = countActiveRunsForToolByQueue(
          toolId,
          'merging',
          ticketStatusById
        );
        const isEvalDefaultAgent = matchesAssignee(tool, defaultEvalAssignee);
        const testCapacity = 1;
        const evalCapacity = isEvalDefaultAgent ? 1 : 0;
        const mergeCapacity = 1;
        const totalCapacity = maxConcurrent + testCapacity + evalCapacity + mergeCapacity;
        const windowState = windows[toolId] || {};
        const pauseUntil = windowState.pause_until || null;
        const pauseUntilMs = pauseUntil ? Date.parse(pauseUntil) : NaN;
        const pauseRemainingMs = Number.isFinite(pauseUntilMs)
          ? Math.max(0, pauseUntilMs - nowMs)
          : null;

        return {
          toolId,
          toolName,
          enabled: !!tool?.enabled,
          isEvalDefaultAgent,
          maxConcurrent,
          testCapacity,
          evalCapacity,
          mergeCapacity,
          totalCapacity,
          activeImplementationRuns,
          activeTestRuns,
          activeEvaluationRuns,
          activeMergingRuns,
          activeTotalRuns: activeImplementationRuns + activeTestRuns + activeEvaluationRuns + activeMergingRuns,
          availableCapacity: Math.max(0, totalCapacity - activeImplementationRuns - activeTestRuns - activeEvaluationRuns - activeMergingRuns),
          isPaused: !!windowState.paused,
          pauseReason: windowState.pause_reason || null,
          pauseUntil,
          pauseRemainingMs
        };
      });

    agentStatus.sort((left, right) => left.toolName.localeCompare(right.toolName));
    return agentStatus;
  }

  function dispatch(event = {}) {
    if (!running) {
      return { accepted: false, reason: 'stopped' };
    }

    if (dispatching) {
      dispatchQueued = true;
      return { accepted: false, reason: 'busy' };
    }

    dispatching = true;
    try {
      do {
        dispatchQueued = false;
        processQueue();
      } while (running && dispatchQueued);
      return { accepted: true, reason: event?.reason || 'manual' };
    } catch (e) {
      console.error('[Scheduler] Dispatch error:', e.message || e);
      logEvent('error.dispatch', 'error', `Dispatch error: ${e.message || e}`);
      return { accepted: false, reason: 'error' };
    } finally {
      dispatching = false;
    }
  }

  function extractTicketFilePaths(ticket) {
    const paths = new Set();

    // From files_touched array
    if (Array.isArray(ticket.files_touched)) {
      for (const file of ticket.files_touched) {
        const normalized = String(file || '').trim();
        if (normalized) paths.add(normalized);
      }
    }

    // From notes (DESIGN SPECIFICATION contains file paths)
    const notes = String(ticket.notes || '');
    // Match "Modifications to <path>:" pattern used in design specs
    const modMatches = notes.matchAll(/Modifications to\s+([^\s:]+)/gi);
    for (const m of modMatches) {
      const p = m[1].replace(/[\\]/g, '/').trim();
      if (p) paths.add(p);
    }

    // Infer sibling __init__.py for Python files. When a ticket creates or
    // modifies a .py file inside a package, it almost always also touches the
    // package __init__.py (to add exports). Without this inference, parallel
    // tickets that each add modules to the same package would not be detected
    // as conflicting.
    const inferred = [];
    for (const p of paths) {
      if (p.endsWith('.py') && !p.endsWith('__init__.py')) {
        const lastSlash = p.lastIndexOf('/');
        if (lastSlash !== -1) {
          inferred.push(p.substring(0, lastSlash + 1) + '__init__.py');
        }
      }
    }
    for (const ip of inferred) {
      paths.add(ip);
    }

    return paths;
  }

  function collectInFlightFiles(backlogTickets) {
    const inFlightFiles = new Map();
    if (!Array.isArray(backlogTickets)) return inFlightFiles;

    // Find tickets with active runs
    const activeTicketIds = new Set();
    if (agentRuntime.activeRunByTicket) {
      for (const [ticketId, runId] of agentRuntime.activeRunByTicket) {
        const run = agentRuntime.runsById?.get(runId);
        if (run && (run.state === 'running' || run.state === 'queued')) {
          activeTicketIds.add(ticketId);
        }
      }
    }
    // Also include in_progress tickets
    for (const ticket of backlogTickets) {
      if (ticket?.status === 'in_progress') activeTicketIds.add(ticket.id);
    }

    for (const ticketId of activeTicketIds) {
      const ticket = backlogTickets.find(t => t?.id === ticketId);
      if (!ticket) continue;
      const filePaths = extractTicketFilePaths(ticket);
      for (const fp of filePaths) {
        if (!inFlightFiles.has(fp)) inFlightFiles.set(fp, new Set());
        inFlightFiles.get(fp).add(ticketId);
      }
    }

    return inFlightFiles;
  }

  function hasFileConflictWithInFlight(ticket, inFlightFiles) {
    if (!inFlightFiles || inFlightFiles.size === 0) return null;
    const ticketFiles = extractTicketFilePaths(ticket);
    if (ticketFiles.size === 0) return null;

    const overlapping = [];
    for (const fp of ticketFiles) {
      const owners = inFlightFiles.get(fp);
      if (owners) {
        const others = [...owners].filter(id => id !== ticket.id);
        if (others.length > 0) overlapping.push({ file: fp, tickets: others });
      }
    }
    return overlapping.length > 0 ? overlapping : null;
  }

  function processQueue() {
    // 1. Read agent config
    let agentsConfig;
    try {
      agentsConfig = readAgentsConfig();
    } catch (e) {
      console.error('[Scheduler] Failed to read agents config:', e.message);
      logEvent('error.config_read_failure', 'error', `Failed to read agents config: ${e.message}`);
      return;
    }

    const tools = agentsConfig?.tools || [];
    if (tools.length === 0) return;

    // 2. Build capacity map per tool+model (needed for both transition and dispatch)
    const enabledCombos = [];
    for (const tool of tools) {
      if (!tool.enabled) continue;
      for (const model of tool.models || []) {
        if (!model.enabled) continue;
        enabledCombos.push({ tool, model });
      }
    }

    if (enabledCombos.length === 0) return;

    // 3. Read backlog, filter for scheduler-eligible tickets in order
    let backlog;
    try {
      backlog = readBacklogData();
    } catch (e) {
      console.error('[Scheduler] Failed to read backlog:', e.message);
      logEvent('error.backlog_read_failure', 'error', `Failed to read backlog: ${e.message}`);
      return;
    }

    // Transition any new eligible todo tickets to building before processing
    if (typeof writeBacklogData === 'function') {
      const allTicketsForTransition = backlog?.tickets || [];
      const ticketStatusByIdForTransition = createTicketStatusIndex(backlog);
      // Seed with existing building tickets so they count against capacity
      const buildingCountByTool = countBuildingTicketsByTool(allTicketsForTransition, enabledCombos);
      let transitionChanged = false;
      const transitionTimestamp = new Date().toISOString();

      for (const ticket of allTicketsForTransition) {
        if (ticket?.status !== 'todo') continue;
        if (ticket.agent?.state === 'merge_failed' || ticket.agent?.state === 'merge_aborted') continue; // These go to merging, not building
        if (!hasExplicitAssignee(ticket)) continue;
        // Safety valve: refuse to re-dispatch tickets that have failed too many times,
        // even if assignee wasn't properly cleared by onRunFinished.
        const MAX_FAIL_HARD_CAP = 10;
        if (typeof ticket.fail_count === 'number' && ticket.fail_count >= MAX_FAIL_HARD_CAP) {
          console.log(`[Scheduler] Hard cap: ${ticket.id} has ${ticket.fail_count} failures — skipping`);
          logEvent('ticket.hard_cap', 'error', `Ticket ${ticket.id} hit hard failure cap (${ticket.fail_count}/${MAX_FAIL_HARD_CAP})`, { ticketId: ticket.id });
          continue;
        }
        if (!hasResolvedDependencies(ticket, ticketStatusByIdForTransition)) continue;
        if (!hasAssigneeCapacity(ticket, enabledCombos, ticketStatusByIdForTransition, buildingCountByTool)) continue;

        ticket.status = 'building';
        ticket.last_updated = transitionTimestamp;
        transitionChanged = true;

        // Track this transition so subsequent tickets respect capacity
        const candidates = getAssigneeCandidates(ticket.assignee, enabledCombos);
        for (const { tool } of candidates) {
          buildingCountByTool.set(tool.id, (buildingCountByTool.get(tool.id) || 0) + 1);
          break;
        }
      }

      if (transitionChanged) {
        try {
          writeBacklogData(backlog);
        } catch (e) {
          console.error('[Scheduler] Failed to persist building transitions during dispatch:', e.message);
        }
      }
    }

    const queuedTickets = (backlog?.tickets || []).filter(
      (ticket) => ticket?.status === 'todo' || ticket?.status === 'building' || ticket?.status === 'test' || ticket?.status === 'eval' || ticket?.status === 'merging'
    );
    if (queuedTickets.length === 0) return;

    // Priority-sort eval tickets: those depended on by other eval tickets go first
    const evalDependentCount = new Map();
    const evalTicketIds = new Set(queuedTickets.filter(t => t?.status === 'eval').map(t => t.id));
    for (const ticket of queuedTickets) {
      if (ticket?.status !== 'eval') continue;
      for (const dep of (ticket.dependencies || [])) {
        const depId = normalizeDependencyId(dep);
        if (evalTicketIds.has(depId)) {
          evalDependentCount.set(depId, (evalDependentCount.get(depId) || 0) + 1);
        }
      }
    }
    queuedTickets.sort((a, b) => {
      if (a.status !== 'eval' || b.status !== 'eval') return 0;
      return (evalDependentCount.get(b.id) || 0) - (evalDependentCount.get(a.id) || 0);
    });

    const ticketStatusById = createTicketStatusIndex(backlog);
    const allTickets = backlog?.tickets || [];
    const inFlightFiles = collectInFlightFiles(allTickets);

    // 4. For each eligible ticket (top-to-bottom), try to assign and invoke
    for (const ticket of queuedTickets) {
      // Check if ticket already has an active run
      const existingStatus = agentRuntime.getRunStatus({ ticketId: ticket.id });
      if (existingStatus && (existingStatus.state === 'running' || existingStatus.state === 'queued')) {
        continue;
      }

      // Agent coordination lock: prevent duplicate work by checking ticket status
      // Ticket must be in 'todo' or 'eval' status and not currently being worked on
      const ticketCurrentStatus = ticket.status;
      const ticketAgent = ticket.agent;
      const isTicketLocked = ticketCurrentStatus === 'in_progress' || (
        ticketAgent &&
        typeof ticketAgent === 'object' &&
        (ticketAgent.state === 'running' || ticketAgent.state === 'queued')
      );

      if (isTicketLocked) {
        const lockReason = ticketCurrentStatus === 'in_progress'
          ? `ticket status is '${ticketCurrentStatus}'`
          : `ticket.agent.state is '${ticketAgent?.state}'`;
        console.log(`[Scheduler] Skipping ${ticket.id}: ${lockReason} (coordination lock)`);
        logEvent('ticket.skipped_locked', 'debug', `Skipping ${ticket.id}: ${lockReason} (coordination lock)`, { ticketId: ticket.id });
        continue;
      }

      // Merge-failed tickets: transition to 'merging' status and re-dispatch
      if (ticketCurrentStatus === 'todo' && (ticketAgent?.state === 'merge_failed' || ticketAgent?.state === 'merge_aborted')) {
        if (typeof writeBacklogData === 'function') {
          try {
            const freshBacklog = readBacklogData();
            const freshTicket = (freshBacklog?.tickets || []).find(t => t?.id === ticket.id);
            if (freshTicket && freshTicket.status === 'todo' && (freshTicket.agent?.state === 'merge_failed' || freshTicket.agent?.state === 'merge_aborted')) {
              freshTicket.status = 'merging';
              freshTicket.last_updated = new Date().toISOString();
              writeBacklogData(freshBacklog);
              console.log(`[Scheduler] Transitioned ${ticket.id} from todo (merge_failed) to merging`);
              logEvent('ticket.todo_to_merging', 'info', `Transitioned ${ticket.id} to merging status`, { ticketId: ticket.id });
              // Re-run processQueue so the now-merging ticket is dispatched immediately
              dispatchQueued = true;
            }
          } catch (e) {
            console.error(`[Scheduler] Failed to transition ${ticket.id} to merging:`, e.message);
          }
        }
        continue;
      }

      // Skip tickets blocked by unresolved dependencies.
      if (!hasResolvedDependencies(ticket, ticketStatusById)) {
        continue;
      }

      // Hold tickets with file overlap against in-flight work
      const fileConflict = hasFileConflictWithInFlight(ticket, inFlightFiles);
      if (fileConflict) {
        const summary = fileConflict.map(c => `${c.file} (${c.tickets.join(', ')})`).join('; ');
        console.log(`[Scheduler] Holding ${ticket.id}: file overlap with in-flight tickets: ${summary}`);
        logEvent('ticket.held_file_conflict', 'info', `Holding ${ticket.id}: file overlap with in-flight tickets`, { ticketId: ticket.id, details: { conflicts: summary } });
        continue;
      }

      // Determine which tool+model combos can handle this ticket
      const candidates = getCandidatesForTicket(ticket, enabledCombos);
      if (candidates.length === 0) continue;

      // Try each candidate until one succeeds
      for (const { tool, model } of candidates) {
        if (!canPickUp(tool, model, ticket, ticketStatusById)) continue;

        try {
          let runWorkingDirectory = '';
          let runBranch = null;
          let evalTrialContext = null;

          if (ticket.status === 'test' || ticket.status === 'eval') {
            try {
              const trialMerge = createEvalTrialMerge(ticket.id, { projectRoot });
              runWorkingDirectory = String(trialMerge?.worktreePath || '').trim();
              runBranch = String(trialMerge?.branch || '').trim() || null;
              evalTrialContext = {
                branch: trialMerge?.branch || null,
                worktreePath: trialMerge?.worktreePath || null
              };
            } catch (error) {
              const isConflict = error?.details?.conflict === true;

              if (isConflict && typeof rebaseOnConflict === 'function') {
                // Attempt auto-rebase then retry
                try {
                  const rebaseResult = rebaseOnConflict(ticket.id, { projectRoot });
                  console.log(
                    `[Scheduler] Auto-rebased ${ticket.id} (${rebaseResult.branch}) onto ${rebaseResult.baseBranch}`
                  );
                  logEvent('eval.auto_rebase', 'info', `Auto-rebased ${ticket.id} (${rebaseResult.branch}) onto ${rebaseResult.baseBranch}`, { ticketId: ticket.id });

                  // Retry trial merge
                  const retryMerge = createEvalTrialMerge(ticket.id, { projectRoot });
                  runWorkingDirectory = String(retryMerge?.worktreePath || '').trim();
                  runBranch = String(retryMerge?.branch || '').trim() || null;
                  evalTrialContext = {
                    branch: retryMerge?.branch || null,
                    worktreePath: retryMerge?.worktreePath || null
                  };
                } catch (rebaseOrRetryError) {
                  rebaseOrRetryError.rebaseAttempted = true;
                  onEvalPreparationFailed({
                    ticketId: ticket.id,
                    ticketTitle: ticket.title || ticket.id,
                    error: rebaseOrRetryError
                  });
                  console.error(
                    `[Scheduler] Eval preparation failed for ${ticket.id} after rebase attempt:`,
                    rebaseOrRetryError?.message || rebaseOrRetryError
                  );
                  logEvent('eval.preparation_failed', 'error', `Eval preparation failed for ${ticket.id} after rebase attempt: ${rebaseOrRetryError?.message || rebaseOrRetryError}`, { ticketId: ticket.id });
                  break;
                }
              } else {
                // Non-conflict error or rebase not available — original behavior
                onEvalPreparationFailed({
                  ticketId: ticket.id,
                  ticketTitle: ticket.title || ticket.id,
                  error
                });
                console.error(
                  `[Scheduler] Eval preparation failed for ${ticket.id}:`,
                  error?.message || error
                );
                logEvent('eval.preparation_failed', 'error', `Eval preparation failed for ${ticket.id}: ${error?.message || error}`, { ticketId: ticket.id });
                break;
              }
            }
          } else {
            const preparedWorktree = createTicketWorktree(ticket.id, { projectRoot });
            runWorkingDirectory = String(preparedWorktree?.worktreePath || '').trim();
            runBranch = String(preparedWorktree?.branch || '').trim() || null;

            // Pre-process: merge latest main into reused ticket branches
            if (preparedWorktree?.reused) {
              try {
                const updateResult = updateTicketBranchFn(ticket.id, { projectRoot });
                if (updateResult.updated) {
                  const detail = updateResult.autoResolved
                    ? ` (auto-resolved: ${updateResult.autoResolved.join(', ')})`
                    : '';
                  console.log(`[Scheduler] Updated ${ticket.id} branch with latest main${detail}`);
                  logEvent('worktree.branch_updated', 'info', `Merged main into ${ticket.id} branch${detail}`, { ticketId: ticket.id });
                } else if (updateResult.reason === 'conflict') {
                  console.warn(`[Scheduler] Could not update ${ticket.id} branch: conflicts in ${(updateResult.conflictFiles || []).join(', ')}`);
                  logEvent('worktree.branch_update_conflict', 'warn', `Branch update conflict for ${ticket.id}`, { ticketId: ticket.id, conflictFiles: updateResult.conflictFiles });
                } else if (updateResult.reason !== 'already_up_to_date') {
                  console.log(`[Scheduler] Branch update skipped for ${ticket.id}: ${updateResult.reason}`);
                }
              } catch (e) {
                console.warn(`[Scheduler] Branch update failed for ${ticket.id}, proceeding with stale branch:`, e?.message || e);
                logEvent('worktree.branch_update_error', 'warn', `Branch update error for ${ticket.id}: ${e?.message || e}`, { ticketId: ticket.id });
              }
            }
          }

          if (!runWorkingDirectory) {
            throw new Error(`Worktree path missing for ${ticket.id}`);
          }

          const acceptanceCriteria = Array.isArray(ticket.acceptance_criteria)
            ? ticket.acceptance_criteria
                .map((c, i) => `${i + 1}. ${c.replace(/^\[[ x]\]\s*/, '')}`)
                .join('\n')
            : '';

          const retryContext = buildRetryContext(ticket);

          const ticketFilePath = path.join('.ombutocode', 'data', 'tickets', `${ticket.id}.json`);

          const enrichedPayload = {
            ticketId: ticket.id,
            title: ticket.title || ticket.id,
            featureRef: ticket.feature_ref || '.ombutocode/features',
            repoRoot: projectRoot,
            acceptanceCriteria,
            retryContext,
            modelId: model.model_id || '',
            ticketFilePath
          };

          let templateVariant = null;
          if (ticket.status === 'test') {
            templateVariant = 'test';
          } else if (ticket.status === 'eval') {
            templateVariant = 'eval';
          } else if (ticket.status === 'merging') {
            templateVariant = 'merge_resolve';
          }

          const startedRun = agentRuntime.startAgent(tool.id, enrichedPayload, {
            templateVariant,
            workingDirectory: runWorkingDirectory
          });

          if (startedRun?.runId) {
            runAssignments.set(startedRun.runId, {
              toolId: tool.id,
              modelId: model.id,
              costPerRun: Number(model.cost_per_run || 0),
              branch: runBranch,
              queueStatus: ticket.status || null,
              evalTrialContext
            });
          }

          // Record run in rolling window tracker
          const now = Date.now();
          windowTracker.recordRun(tool.id, { startedAt: new Date(now).toISOString() });

          console.log(`[Scheduler] Started ${tool.id}/${model.id} on ${ticket.id}`);
          logEvent('ticket.pickup', 'info', `Started ${tool.id}/${model.id} on ${ticket.id}`, { ticketId: ticket.id, agentName: tool.id, details: { modelId: model.id } });
          break; // This ticket is now handled, move to next ticket
        } catch (e) {
          console.error(`[Scheduler] Failed to start ${tool.id} on ${ticket.id}:`, e.message);
          logEvent('run.failed', 'error', `Failed to start ${tool.id} on ${ticket.id}: ${e.message}`, { ticketId: ticket.id, agentName: tool.id });
          // Try next candidate
        }
      }
    }
  }

  function hasExplicitAssignee(ticket) {
    const assignee = ticket?.assignee;

    if (assignee && typeof assignee === 'object') {
      return String(assignee.tool || '').trim().length > 0;
    }

    const str = String(assignee || '').trim().toLowerCase();
    // Skip tickets assigned to 'human' — they are not for coding agents
    if (str === 'human') return false;
    return str.length > 0 && str !== 'none' && str !== 'null';
  }

  function getAssigneeCandidates(assignee, enabledCombos) {
    if (!assignee) return [];

    if (assignee && typeof assignee === 'object' && assignee.tool) {
      // Object-format assignee: match tool+model
      return enabledCombos.filter(
        ({ tool, model }) =>
          tool.id === assignee.tool &&
          (!assignee.model || model.id === assignee.model)
      );
    }

    if (assignee && typeof assignee === 'string') {
      // String-format assignee: match tool id or name (case-insensitive)
      const normalized = assignee.trim().toLowerCase();
      return enabledCombos.filter(
        ({ tool }) =>
          tool.id.toLowerCase() === normalized ||
          tool.name.toLowerCase() === normalized
      );
    }

    return [];
  }

  function resolveEvalAssignee() {
    if (typeof readEvalDefaultAgent === 'function') {
      try {
        return readEvalDefaultAgent();
      } catch (error) {
        console.error('[Scheduler] Failed to read eval default agent:', error?.message || error);
      }
    }

    return null;
  }

  function resolveEvalQueueAssignee(ticket = null) {
    return resolveEvalAssignee() || ticket?.assignee || null;
  }

  /**
   * Determine which tool+model combos are eligible for a ticket.
   * - `todo`: only explicitly assigned tickets are eligible.
   * - `eval`: uses configured default EVAL agent, falling back to ticket assignee.
   */
  function getCandidatesForTicket(ticket, enabledCombos) {
    if (ticket?.status === 'eval') {
      return getAssigneeCandidates(resolveEvalQueueAssignee(ticket), enabledCombos);
    }

    if (ticket?.status === 'merging') {
      // Merging tickets may have assignee='NONE' from a prior merge failure.
      // Fall back to the eval default agent so they can be dispatched.
      const assignee = ticket?.assignee;
      const hasValid = assignee && typeof assignee === 'string'
        && assignee.trim().toLowerCase() !== 'none'
        && assignee.trim().toLowerCase() !== 'null';
      return getAssigneeCandidates(
        hasValid ? assignee : (resolveEvalAssignee() || assignee),
        enabledCombos
      );
    }

    return getAssigneeCandidates(ticket?.assignee, enabledCombos);
  }

  function normalizeDependencyId(dependency) {
    if (typeof dependency === 'string') return dependency.trim();
    if (dependency && typeof dependency === 'object') {
      return String(dependency.id || dependency.ticket || dependency.ticket_id || '').trim();
    }
    return '';
  }

  function hasResolvedDependencies(ticket, ticketStatusById = null) {
    if (!ticketStatusById || typeof ticketStatusById.get !== 'function') return true;

    const dependencies = Array.isArray(ticket?.dependencies) ? ticket.dependencies : [];
    if (dependencies.length === 0) return true;

    for (const dependency of dependencies) {
      const dependencyId = normalizeDependencyId(dependency);
      if (!dependencyId) continue;

      const dependencyStatus = ticketStatusById.get(dependencyId);
      // If the dependency is not in the backlog at all (archived/removed), treat as resolved.
      if (dependencyStatus === undefined) continue;
      if (dependencyStatus !== 'review' && dependencyStatus !== 'done') {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a tool+model can pick up another ticket right now.
   * Enforces: explicit provider pause + split capacity
   * (max_concurrent for todo/building, one dedicated eval slot, one dedicated merge slot).
   */
  function canPickUp(tool, model, ticket = null, ticketStatusById = null) {
    windowTracker.refreshExpiredPauses();
    const windowStatus = windowTracker.getRemainingCapacity(tool.id, 10, tool.rolling_window_hours || 5);
    const pauseReason = String(windowStatus.pauseReason || '');

    // Clear legacy programmatic pauses so only provider-reported pauses remain.
    if (windowStatus.isPaused && (
      pauseReason === 'Rolling window exhausted' ||
      pauseReason.startsWith('Budget limit reached')
    )) {
      windowTracker.resumeToolWindowPickup(tool.id);
    } else if (windowStatus.isPaused) {
      return false;
    }

    const activeImplementationCount = countActiveRunsForToolByQueue(tool.id, 'todo', ticketStatusById)
      + countActiveRunsForToolByQueue(tool.id, 'building', ticketStatusById);
    const activeTestCount = countActiveRunsForToolByQueue(tool.id, 'test', ticketStatusById);
    const activeEvaluationCount = countActiveRunsForToolByQueue(tool.id, 'eval', ticketStatusById);
    const activeMergingCount = countActiveRunsForToolByQueue(tool.id, 'merging', ticketStatusById);
    const maxConcurrent = tool.max_concurrent || 1;

    if (ticket?.status === 'test') {
      return activeTestCount < 1;
    }

    if (ticket?.status === 'eval') {
      if (Date.now() - lastSquashMergeAt < EVAL_POST_MERGE_COOLDOWN_MS) {
        return false;
      }
      return activeEvaluationCount < 1;
    }

    if (ticket?.status === 'merging') {
      return activeMergingCount < 1;
    }

    return activeImplementationCount < maxConcurrent;
  }

  /**
   * Count active (running/queued) runs for a given tool in a specific queue status.
   */
  function countActiveRunsForToolByQueue(toolId, queueStatus, ticketStatusById = null) {
    let count = 0;
    for (const [, runId] of agentRuntime.activeRunByTicket) {
      const run = agentRuntime.runsById.get(runId);
      if (!run || run.agentName !== toolId) continue;
      if (run.state !== 'running' && run.state !== 'queued') continue;

      const activeQueueStatus = getActiveRunQueueStatus(run, ticketStatusById);
      if (activeQueueStatus === queueStatus) count += 1;
    }
    return count;
  }

  function createTicketStatusIndex(backlog = null) {
    const tickets = Array.isArray(backlog?.tickets) ? backlog.tickets : [];
    const statusById = new Map();
    for (const ticket of tickets) {
      if (!ticket?.id) continue;
      statusById.set(ticket.id, ticket.status || null);
    }
    return statusById;
  }

  function getActiveRunQueueStatus(run, ticketStatusById = null) {
    const assignment = run?.runId ? runAssignments.get(run.runId) : null;
    if (assignment?.queueStatus === 'todo' || assignment?.queueStatus === 'building' || assignment?.queueStatus === 'test' || assignment?.queueStatus === 'eval' || assignment?.queueStatus === 'merging') {
      return assignment.queueStatus;
    }

    if (ticketStatusById && typeof ticketStatusById.get === 'function') {
      const currentStatus = ticketStatusById.get(run?.ticketId);
      if (currentStatus === 'todo' || currentStatus === 'building' || currentStatus === 'test' || currentStatus === 'eval' || currentStatus === 'merging') {
        return currentStatus;
      }
    }

    return null;
  }

  /**
   * Notify the scheduler that a run finished (for cooldown tracking and cost recording).
   * Call this from the agentRuntime onRunFinished callback.
   */
  function onRunFinished(run) {
    if (!run || !run.agentName) return;

    lastFinished[run.agentName] = Date.now();

    const assignment = run?.runId ? runAssignments.get(run.runId) : null;
    if (run?.runId) {
      runAssignments.delete(run.runId);
    }

    if (assignment?.queueStatus === 'test' || assignment?.queueStatus === 'eval') {
      try {
        cleanupEvalTrial(run.ticketId, { projectRoot });
      } catch (error) {
        console.warn(`[Scheduler] Failed to clean trial merge for ${run.ticketId}:`, error?.message || error);
        logEvent('error.worktree', 'warn', `Failed to clean trial merge for ${run.ticketId}: ${error?.message || error}`, { ticketId: run.ticketId });
      }
    }

    // Record cost if run succeeded
    if (run.state === 'completed' && run.exitCode === 0) {
      try {
        if (assignment && assignment.costPerRun > 0) {
          windowTracker.recordCost(assignment.toolId, assignment.costPerRun);
          console.log(
            `[Scheduler] Recorded cost ${assignment.costPerRun} for ${assignment.toolId}/${assignment.modelId}`
          );
          logEvent('cost.recorded', 'debug', `Recorded cost ${assignment.costPerRun} for ${assignment.toolId}/${assignment.modelId}`, { agentName: assignment.toolId, details: { cost: assignment.costPerRun, modelId: assignment.modelId } });
        }
      } catch (e) {
        console.error('[Scheduler] Error recording cost:', e.message);
      }
    }
    if (run.state === 'failed') {
      try {
        let agentConfig = {};
        try {
          const agents = readAgentsConfig();
          const tool = (agents?.tools || []).find((t) => t.id === run.agentName);
          agentConfig = tool || {};
        } catch (e) {
          // Fallback to empty config if read fails
        }

        const providerPause = parseProviderPauseFromRun(run, agentConfig);
        if (providerPause?.pauseUntil) {
          windowTracker.pauseToolWindowPickup(
            run.agentName,
            providerPause.reason,
            { pauseUntil: providerPause.pauseUntil }
          );
          console.log(
            `[Scheduler] Provider pause detected for ${run.agentName} until ${providerPause.pauseUntil}`
          );
          logEvent('agent.pause_detected', 'warn', `Provider pause detected for ${run.agentName} until ${providerPause.pauseUntil}`, { agentName: run.agentName, ticketId: run.ticketId, details: { pauseUntil: providerPause.pauseUntil, reason: providerPause.reason } });
        }
      } catch (error) {
        console.error('[Scheduler] Error parsing provider limit response:', error?.message || error);
      }
    }

    dispatch({ reason: 'run-finished', runId: run.runId, ticketId: run.ticketId });
  }

  function getActiveRuns() {
    const runsById = agentRuntime?.runsById;
    if (!runsById || typeof runsById.values !== 'function') {
      return [];
    }

    const activeStates = new Set(['running', 'queued']);
    const activeRuns = [];

    const ticketStatusById = createTicketStatusIndex(readBacklogDataSafe());

    for (const run of runsById.values()) {
      if (!run || !activeStates.has(run.state)) continue;
      const assignment = run.runId ? runAssignments.get(run.runId) : null;
      const startedAtMs = Date.parse(run.startedAt || '');
      const queueStatus = getActiveRunQueueStatus(run, ticketStatusById);
      activeRuns.push({
        runId: run.runId,
        ticketId: run.ticketId,
        agentName: run.agentName,
        modelId: assignment?.modelId || null,
        branch: assignment?.branch || null,
        queueStatus,
        state: run.state,
        startedAt: run.startedAt || null,
        elapsedMs: Number.isFinite(startedAtMs) ? Math.max(0, Date.now() - startedAtMs) : null,
        pid: run.pid || null
      });
    }

    activeRuns.sort((left, right) => {
      const leftTs = Date.parse(left.startedAt || '') || 0;
      const rightTs = Date.parse(right.startedAt || '') || 0;
      return leftTs - rightTs;
    });

    return activeRuns;
  }

  function getQueueInfo(activeRuns) {
    const backlog = readBacklogDataSafe();
    if (!backlog) {
      return {
        totalTodo: 0,
        totalImplementation: 0,
        totalEvaluation: 0,
        readyCount: 0,
        readyImplementationCount: 0,
        readyEvaluationCount: 0,
        nextTickets: [],
        error: 'Failed to read backlog'
      };
    }

    const tickets = Array.isArray(backlog?.tickets) ? backlog.tickets : [];
    const queuedTickets = tickets.filter(
      (ticket) => ticket?.status === 'todo' || ticket?.status === 'building' || ticket?.status === 'eval' || ticket?.status === 'merging'
    );
    const activeTicketIds = new Set(
      (activeRuns || [])
        .map((run) => run.ticketId)
        .filter(Boolean)
    );
    const ticketStatusById = createTicketStatusIndex(backlog);

    const queueBaseMs = Date.now();
    const nextTickets = queuedTickets
      .filter((ticket) => !activeTicketIds.has(ticket.id))
      .map((ticket) => ({
        ...ticket,
        queueAssignee: ticket.status === 'eval'
          ? resolveEvalQueueAssignee(ticket)
          : ticket.assignee
      }))
      .filter((ticket) => hasResolvedDependencies(ticket, ticketStatusById))
      .filter((ticket) => hasExplicitAssignee({ assignee: ticket.queueAssignee }))
      .map((ticket, index) => ({
        id: ticket.id,
        title: ticket.title || ticket.id,
        assignee: ticket.queueAssignee || null,
        status: ticket.status || null,
        estimatedPickupAt: new Date(
          queueBaseMs + ((index + 1) * currentQueueEstimateIntervalMs)
        ).toISOString()
      }));
    const implementationTickets = queuedTickets.filter((ticket) => ticket?.status === 'todo' || ticket?.status === 'building' || ticket?.status === 'merging');
    const evaluationTickets = queuedTickets.filter((ticket) => ticket?.status === 'eval');
    const readyImplementationCount = nextTickets.filter((ticket) => ticket.status === 'todo' || ticket.status === 'building' || ticket.status === 'merging').length;
    const readyEvaluationCount = nextTickets.filter((ticket) => ticket.status === 'eval').length;

    return {
      // Backward-compatible key: keep `totalTodo` aligned to actual TODO tickets.
      totalTodo: implementationTickets.length,
      totalQueued: queuedTickets.length,
      totalImplementation: implementationTickets.length,
      totalEvaluation: evaluationTickets.length,
      readyCount: nextTickets.length,
      readyImplementationCount,
      readyEvaluationCount,
      nextTickets: nextTickets.slice(0, 10)
    };
  }

  function readBacklogDataSafe() {
    try {
      return readBacklogData();
    } catch (error) {
      return null;
    }
  }

  function readAgentsConfigSafe() {
    try {
      return readAgentsConfig();
    } catch (error) {
      return { tools: [] };
    }
  }

  function matchesAssignee(tool, assignee) {
    const toolId = String(tool?.id || '').trim().toLowerCase();
    const toolName = String(tool?.name || '').trim().toLowerCase();

    if (assignee && typeof assignee === 'object') {
      return String(assignee.tool || '').trim().toLowerCase() === toolId;
    }

    const normalizedAssignee = String(assignee || '').trim().toLowerCase();
    if (!normalizedAssignee) return false;
    return normalizedAssignee === toolId || normalizedAssignee === toolName;
  }

  function resolvePauseReason() {
    windowTracker.refreshExpiredPauses();
    clearLegacyProgrammaticPauses();
    const state = windowTracker.loadState();
    const windows = state?.windows && typeof state.windows === 'object' ? state.windows : {};
    const reasons = Object.values(windows)
      .map((windowState) => {
        if (!windowState || !windowState.paused) return null;
        return typeof windowState.pause_reason === 'string' && windowState.pause_reason.trim()
          ? windowState.pause_reason.trim()
          : 'Paused';
      })
      .filter(Boolean);

    if (reasons.length === 0) return null;
    if (reasons.length === 1) return reasons[0];
    return `${reasons.length} tools paused`;
  }

  function clearLegacyProgrammaticPauses() {
    const state = windowTracker.loadState();
    const windows = state?.windows && typeof state.windows === 'object' ? state.windows : {};
    let changed = false;

    for (const windowState of Object.values(windows)) {
      if (!windowState?.paused) continue;
      const reason = String(windowState.pause_reason || '');
      if (reason === 'Rolling window exhausted' || reason.startsWith('Budget limit reached')) {
        windowState.paused = false;
        windowState.pause_reason = null;
        windowState.pause_until = null;
        changed = true;
      }
    }

    if (changed) {
      windowTracker.saveState(state);
    }
  }

  function getAgentPauseStatus() {
    windowTracker.refreshExpiredPauses();
    const state = windowTracker.loadState();
    const windows = state?.windows && typeof state.windows === 'object' ? state.windows : {};
    const nowMs = Date.now();

    return Object.entries(windows)
      .filter(([, value]) => value && value.paused)
      .map(([toolId, value]) => {
        const pauseUntil = value.pause_until || null;
        const pauseUntilMs = pauseUntil ? Date.parse(pauseUntil) : NaN;
        const pauseRemainingMs = Number.isFinite(pauseUntilMs)
          ? Math.max(0, pauseUntilMs - nowMs)
          : null;

        return {
          toolId,
          isPaused: true,
          pauseReason: value.pause_reason || 'Paused',
          pauseUntil,
          pauseRemainingMs
        };
      });
  }

  /**
   * Record that a squash-merge to main just completed.
   * Imposes a cooldown before the next eval dispatch so ticket branches
   * can be updated against the new main.
   */
  function recordSquashMerge() {
    lastSquashMergeAt = Date.now();
    logEvent('eval.post_merge_cooldown', 'info',
      `Squash-merge detected — eval cooldown ${EVAL_POST_MERGE_COOLDOWN_MS}ms`,
      { details: { cooldownMs: EVAL_POST_MERGE_COOLDOWN_MS } });
    setTimeout(() => dispatch({ reason: 'post-merge-cooldown' }), EVAL_POST_MERGE_COOLDOWN_MS);
  }

  return {
    start,
    stop,
    isRunning,
    getStatus,
    getAutomationActiveRuns,
    getAutomationEvalQueue,
    getAutomationAgentStatus,
    setPollInterval,
    dispatch,
    onRunFinished,
    recordSquashMerge,
    windowTracker
  };
}

module.exports = { createScheduler };
module.exports.parseProviderPauseFromRun = parseProviderPauseFromRun;
module.exports.buildRetryContext = buildRetryContext;
