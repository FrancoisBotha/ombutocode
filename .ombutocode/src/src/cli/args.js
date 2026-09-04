'use strict';

/**
 * Argument parsing for the headless CLI.
 *
 *   node headless.js epic create --input <file> [--agent <tool>] [--model <model>] [--skill <name>]
 *                                [--no-commit] [--timeout-sec N] [--json] [--project <root>]
 *   node headless.js tickets create --epic <path> --assignee <tool[:model]> [--status todo|backlog]
 *                                   [--agent <tool>] [--model <model>] [--skill <name>]
 *                                   [--timeout-sec N] [--json] [--project <root>]
 *   node headless.js run [--until drained] [--max-seconds N] [--profile <name>] [--json] [--project <root>]
 *                        [--stall-minutes N] [--max-merge-reverts N] [--poll-seconds N]
 *   node headless.js status [--json] [--project <root>]
 *
 * Pure: argv in, `{ ok, command, subcommand, options }` or `{ ok: false, error, usage }` out.
 * Exit code 2 is the caller's job.
 */

const CLI_COMMANDS = new Set(['epic', 'tickets', 'run', 'status']);

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
const EXIT_TIMEOUT = 3;

// Option spec per command: name → { type: 'string'|'boolean'|'number', required?, choices? }
const COMMON_OPTIONS = {
  json: { type: 'boolean' },
  project: { type: 'string' }
};

const PLANNING_OPTIONS = {
  agent: { type: 'string' },
  model: { type: 'string' },
  skill: { type: 'string' },
  'timeout-sec': { type: 'number' }
};

const COMMAND_SPECS = {
  'epic create': {
    input: { type: 'string', required: true },
    'no-commit': { type: 'boolean' },
    ...PLANNING_OPTIONS,
    ...COMMON_OPTIONS
  },
  'tickets create': {
    epic: { type: 'string', required: true },
    assignee: { type: 'string' },
    status: { type: 'string', choices: ['todo', 'backlog'], default: 'todo' },
    ...PLANNING_OPTIONS,
    ...COMMON_OPTIONS
  },
  run: {
    until: { type: 'string', choices: ['drained'] },
    'max-seconds': { type: 'number' },
    profile: { type: 'string' },
    'stall-minutes': { type: 'number' },
    'max-merge-reverts': { type: 'number' },
    'poll-seconds': { type: 'number' },
    ...COMMON_OPTIONS
  },
  status: {
    ...COMMON_OPTIONS
  }
};

const USAGE = `Usage:
  node headless.js [<project-root>]                                  scheduler console (unchanged)
  node headless.js epic create --input <file> [--agent <tool>] [--model <model>] [--skill <name>]
                               [--no-commit] [--timeout-sec N] [--json] [--project <root>]
  node headless.js tickets create --epic <path> --assignee <tool[:model]> [--status todo|backlog]
                                  [--agent <tool>] [--model <model>] [--skill <name>]
                                  [--timeout-sec N] [--json] [--project <root>]
  node headless.js run [--until drained] [--max-seconds N] [--profile <name>] [--json] [--project <root>]
                       [--stall-minutes N] [--max-merge-reverts N] [--poll-seconds N]
  node headless.js status [--json] [--project <root>]

Exit codes: 0 success, 1 failure, 2 usage error, 3 timeout / budget exhausted.`;

function camel(name) {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function usageError(message) {
  return { ok: false, exitCode: EXIT_USAGE, error: message, usage: USAGE };
}

/**
 * Parse `process.argv`-shaped input (node, script, ...rest).
 * Returns `{ ok: true, command, subcommand, options }` where option keys are
 * camelCased (`--timeout-sec` → `timeoutSec`, `--no-commit` → `noCommit`).
 */
function parseCliArgs(argv) {
  const rest = Array.isArray(argv) ? argv.slice(2) : [];
  const command = rest[0];
  if (!CLI_COMMANDS.has(command)) {
    return usageError(`Unknown command "${command || ''}". Expected one of: epic, tickets, run, status.`);
  }

  let subcommand = null;
  let optionTokens;
  if (command === 'epic' || command === 'tickets') {
    subcommand = rest[1];
    if (subcommand !== 'create') {
      return usageError(`Unknown ${command} subcommand "${subcommand || ''}". Expected: ${command} create.`);
    }
    optionTokens = rest.slice(2);
  } else {
    optionTokens = rest.slice(1);
  }

  const specKey = subcommand ? `${command} ${subcommand}` : command;
  const spec = COMMAND_SPECS[specKey];
  const options = {};

  for (let i = 0; i < optionTokens.length; i += 1) {
    const token = optionTokens[i];
    if (token === '--help' || token === '-h') {
      return { ok: false, exitCode: EXIT_OK, help: true, usage: USAGE };
    }
    if (!token.startsWith('--')) {
      return usageError(`Unexpected argument "${token}".`);
    }

    let name = token.slice(2);
    let inlineValue = null;
    const eq = name.indexOf('=');
    if (eq >= 0) {
      inlineValue = name.slice(eq + 1);
      name = name.slice(0, eq);
    }

    const optionSpec = spec[name];
    if (!optionSpec) {
      return usageError(`Unknown option "--${name}" for "${specKey}".`);
    }

    const key = camel(name);
    if (optionSpec.type === 'boolean') {
      if (inlineValue !== null && !/^(true|false)$/i.test(inlineValue)) {
        return usageError(`Option "--${name}" does not take a value.`);
      }
      options[key] = inlineValue === null ? true : inlineValue.toLowerCase() === 'true';
      continue;
    }

    let value = inlineValue;
    if (value === null) {
      const next = optionTokens[i + 1];
      if (next === undefined || next.startsWith('--')) {
        return usageError(`Option "--${name}" requires a value.`);
      }
      value = next;
      i += 1;
    }

    if (optionSpec.type === 'number') {
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0) {
        return usageError(`Option "--${name}" must be a non-negative number, got "${value}".`);
      }
      options[key] = num;
    } else {
      if (optionSpec.choices && !optionSpec.choices.includes(value)) {
        return usageError(`Option "--${name}" must be one of: ${optionSpec.choices.join(', ')} (got "${value}").`);
      }
      options[key] = value;
    }
  }

  for (const [name, optionSpec] of Object.entries(spec)) {
    const key = camel(name);
    if (optionSpec.required && options[key] === undefined) {
      return usageError(`Option "--${name}" is required for "${specKey}".`);
    }
    if (optionSpec.default !== undefined && options[key] === undefined) {
      options[key] = optionSpec.default;
    }
  }

  // `--assignee` is mandatory whenever tickets are written straight to todo:
  // the scheduler silently never dispatches unassigned tickets.
  if (specKey === 'tickets create' && options.status === 'todo' && !options.assignee) {
    return usageError('Option "--assignee <tool[:model]>" is required when --status is todo (the default).');
  }

  // `run` defaults to drain mode when the caller wants machine output or a budget.
  if (specKey === 'run' && !options.until && (options.json || options.maxSeconds !== undefined)) {
    options.until = 'drained';
  }

  return { ok: true, command, subcommand, options, specKey };
}

module.exports = {
  CLI_COMMANDS,
  COMMAND_SPECS,
  USAGE,
  EXIT_OK,
  EXIT_FAILURE,
  EXIT_USAGE,
  EXIT_TIMEOUT,
  parseCliArgs
};
