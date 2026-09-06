'use strict';

/**
 * Prompt assembly for the planning stages (epic generation, ticket generation).
 *
 * This is the single source of the prompts. The interactive Plan views call it
 * over IPC (`plan:buildEpicPrompt`, `plan:buildTicketPrompt`) and the headless
 * CLI (`headless.js epic create` / `tickets create`) calls it directly, so the
 * unattended pipeline runs the same prompt the workbench shows the user —
 * nothing here is benchmark-specific.
 *
 * Every builder is pure: string in, string out. File reading (skill content,
 * existing epics) is the caller's job.
 */

const ENGINEERING_GUIDE_PATH = '.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md';
const TICKET_WRITE_TOOL_PATH = '.ombutocode/tools/ticket-write.cjs';

// Completion sentinels for the unattended contracts. A run is only trusted
// when the sentinel is the last non-empty line of the agent's output AND the
// caller has verified the side effect (file on disk / rows in the DB).
const EPIC_DONE_SENTINEL = 'DONE - EPIC WRITTEN';
const EPIC_FAILED_SENTINEL = 'FAILED - NO EPIC WRITTEN';
const TICKETS_DONE_SENTINEL = 'DONE - TICKETS WRITTEN';
const TICKETS_FAILED_SENTINEL = 'FAILED - NO TICKETS WRITTEN';

const EPIC_MODES = new Set(['bulk', 'single', 'refine', 'unattended']);
const EPIC_STRATEGIES = new Set(['vertical', 'layered']);

// Skill file stems (case-insensitive substring match against the skill name)
// for each epic mode. `selectEpicSkill` picks the best available one.
const STRATEGY_SKILL_NAMES = {
  vertical: 'epic generation - vertical slice',
  layered: 'epic generation - layered'
};
const UNATTENDED_SKILL_NAME = 'epic generation - unattended';
const REFINEMENT_SKILL_NAME = 'epic refinement';

function normalizeEpicMode(mode) {
  const value = String(mode || 'bulk').trim().toLowerCase();
  return EPIC_MODES.has(value) ? value : 'bulk';
}

function normalizeStrategy(strategy) {
  const value = String(strategy || 'vertical').trim().toLowerCase();
  return EPIC_STRATEGIES.has(value) ? value : 'vertical';
}

/**
 * Format the "existing epics" block shared by the single/refine/unattended
 * instructions so the agent does not duplicate scope.
 * @param {Array<{name: string, status?: string}>} epics
 */
function formatExistingEpics(epics) {
  if (!Array.isArray(epics) || epics.length === 0) return '(none yet)';
  return epics
    .map((e) => `- ${String(e.name || '').replace(/\.md$/, '')} (${e.status || 'NEW'})`)
    .join('\n');
}

/**
 * Pick the skill file for an epic mode/strategy from a list of
 * `{ name, path }` skill descriptors (as produced by the renderer's
 * collectSkillFiles or the CLI's skill scan).
 *
 * Returns the matching descriptor or null. Falls back to any Epic Generation
 * skill for the generation modes so projects with a single un-suffixed file
 * keep working.
 */
function selectEpicSkill(skillFiles, { mode = 'bulk', strategy = 'vertical' } = {}) {
  const files = Array.isArray(skillFiles) ? skillFiles : [];
  const byName = (needle) => files.find((s) => String(s.name || '').toLowerCase().includes(needle)) || null;
  const normalizedMode = normalizeEpicMode(mode);

  if (normalizedMode === 'unattended') {
    return byName(UNATTENDED_SKILL_NAME);
  }
  if (normalizedMode === 'refine' || normalizedMode === 'single') {
    return byName(REFINEMENT_SKILL_NAME) || byName('refinement');
  }
  return byName(STRATEGY_SKILL_NAMES[normalizeStrategy(strategy)]) || byName('epic generation');
}

/**
 * Build the epic generation prompt.
 *
 * @param {Object} input
 * @param {'bulk'|'single'|'refine'|'unattended'} input.mode
 * @param {'vertical'|'layered'} [input.strategy]      bulk only
 * @param {string} [input.skillContent]                skill markdown, frontmatter already stripped
 * @param {string} [input.prd]                         docs-relative path, e.g. "Product Requirements Document/prd.md"
 * @param {string} [input.arch]
 * @param {string} [input.styleGuide]
 * @param {string} [input.codeMap]
 * @param {string} [input.referenceFile]               unattended: project-relative path to the reference spec
 * @param {Array}  [input.existingEpics]               [{ name, status }]
 * @param {string} [input.targetEpicPath]              refine: docs-relative epic path
 * @param {boolean} [input.commit=true]                unattended: commit the written files
 * @returns {string}
 */
function buildEpicPrompt(input = {}) {
  const mode = normalizeEpicMode(input.mode);
  const strategy = normalizeStrategy(input.strategy);
  const skillPrefix = input.skillContent ? `${input.skillContent}\n\n---\n\n` : '';
  const existingEpicLines = formatExistingEpics(input.existingEpics);

  if (mode === 'unattended') {
    if (!input.referenceFile) {
      throw new Error('buildEpicPrompt: referenceFile is required in unattended mode');
    }
    const contextParts = [`Read the reference specification at "${input.referenceFile}" in full`];
    if (input.prd) contextParts.push(`the PRD at "docs/${input.prd}"`);
    if (input.arch) contextParts.push(`the Architecture document at "docs/${input.arch}"`);
    if (input.styleGuide) contextParts.push(`the Style Guide at "docs/${input.styleGuide}"`);
    if (input.codeMap) contextParts.push(`the Code Map at "docs/${input.codeMap}"`);
    const baseContext = `${contextParts.join(', and ')}. Also read the engineering guide at "${ENGINEERING_GUIDE_PATH}" to understand the project conventions and ticket workflow.`;
    const commitLine = input.commit === false
      ? 'Do NOT commit — leave the new file in the working tree for the caller.'
      : 'Commit the new epic file (and any FR/NFR matrix rows you added) with a message of the form "docs: add <epic stem>". Agents build in worktrees and cannot see uncommitted files.';

    const instruction = `Apply the Epic Generation - Unattended skill above to write EXACTLY ONE epic in docs/Epics/ that captures the reference specification. Analyse the repository so the epic's scope, acceptance criteria and dependencies reflect the code as it actually is. Pick the next available numeric prefix (continue from the highest \`epic_NN_\` already in use, starting at 01 if there are none). Only update the Functional / Non-Functional Requirements matrices if those files already exist — never create them.

${commitLine}

Existing epics (do not duplicate scope):
${existingEpicLines}

DO NOT ASK ME ANYTHING. This session is unattended: if you stop to ask about naming, scope, or permission to write, the run stalls and nothing gets written. Make your best decision, record every assumption in the epic's "Risks & Unknowns" section, and proceed. Print the proposed epic summary as a record of what you are writing — not as a request for approval — then write immediately.

Finish with exactly "${EPIC_DONE_SENTINEL} docs/Epics/<file>.md" as your last line once the file exists on disk, or "${EPIC_FAILED_SENTINEL}" if writing did not succeed.`;

    return `${skillPrefix}${baseContext}\n\n${instruction}`;
  }

  // Interactive modes — must stay byte-for-byte what PlanEpicsView used to
  // build inline so the workbench behaviour does not change.
  if (!input.prd) {
    throw new Error('buildEpicPrompt: prd is required');
  }
  const contextParts = [`Read the PRD at "docs/${input.prd}"`];
  if (input.arch) contextParts.push(`the Architecture document at "docs/${input.arch}"`);
  if (input.styleGuide) contextParts.push(`the Style Guide at "docs/${input.styleGuide}"`);
  if (input.codeMap) contextParts.push(`the Code Map at "docs/${input.codeMap}"`);
  const baseContext = `${contextParts.join(', and ')}. Also read the engineering guide at "${ENGINEERING_GUIDE_PATH}" to understand the project conventions and ticket workflow.`;

  let instruction;
  if (mode === 'refine' && input.targetEpicPath) {
    instruction = `Refine the epic at "docs/${input.targetEpicPath}". First, read that file in full. Then propose specific edits to tighten its purpose, scope, acceptance criteria, FR/NFR cross-references, dependencies, and any other section that needs work. Ask me to confirm each significant edit before writing changes. Keep the existing numeric prefix and \`Status:\` value untouched unless I explicitly ask to change them.

Existing epics for context (do not duplicate scope across them):
${existingEpicLines}`;
  } else if (mode === 'single') {
    instruction = `Apply the Epic Generation skill above to propose ONE NEW epic that fills a gap in the existing set. Do NOT redo the whole epic breakdown. Identify what's missing relative to the source documents above, then propose a single epic with title + one-line summary and ask me to confirm before creating the file. Pick the next available numeric prefix (continue from the highest \`epic_NN_\` already in use).

Existing epics (do not duplicate scope):
${existingEpicLines}`;
  } else if (strategy === 'layered') {
    instruction = `Apply the Epic Generation - Layered skill above to produce the initial epic set. Decompose by subsystem and architectural layer, favouring seams that let epics be built in parallel, and declare real prerequisites in \`Depends On:\`. Start by proposing the list of epics with a one-line summary for each. Ask me to confirm before creating the files.`;
  } else {
    instruction = `Apply the Epic Generation - Vertical Slice skill above to produce the initial epic set. Every epic must end with an application that builds, runs, and lets a user complete a real task end to end — no epic whose value only materialises in a later epic. Apply "The test" from the skill to each proposed epic before showing it to me. Propose the list as a table of sequence number, title, and what a user can do once that epic is DONE. Ask me to confirm before creating the files.`;
  }

  return `${skillPrefix}${baseContext}\n\n${instruction}`;
}

/**
 * Build the ticket generation prompt. Already an unattended contract — the
 * interactive view and the CLI share it verbatim; the CLI just changes the
 * status/assignee the tickets are written with.
 *
 * @param {Object} input
 * @param {string} input.epicPath           docs-relative epic path, e.g. "Epics/epic_01_FOO.md"
 * @param {string} [input.skillContent]
 * @param {'backlog'|'todo'} [input.status='backlog']
 * @param {null|{tool: string, model?: string}} [input.assignee=null]
 * @param {'all'|'eval'|'none'} [input.closeout='all']  which of the skill's mandatory
 *        closeout tickets to append. The Ticket Generation skill insists on four
 *        (epic-eval, regression tests, help docs, code map); headless runs against a
 *        repository that has no help docs or code map can restrict that to the
 *        epic-level evaluation only, or drop them entirely.
 * @returns {string}
 */
function buildTicketPrompt(input = {}) {
  if (!input.epicPath) {
    throw new Error('buildTicketPrompt: epicPath is required');
  }
  const closeout = normalizeCloseout(input.closeout);
  const status = String(input.status || 'backlog').trim().toLowerCase() === 'todo' ? 'todo' : 'backlog';
  const assignee = input.assignee && typeof input.assignee === 'object' && input.assignee.tool
    ? JSON.stringify(input.assignee.model ? { tool: input.assignee.tool, model: input.assignee.model } : { tool: input.assignee.tool })
    : 'null';
  const skillPrefix = input.skillContent ? `${input.skillContent}\n\n` : '';

  return `${skillPrefix}Read the epic specification at "docs/${input.epicPath}". Also read the engineering guide at "${ENGINEERING_GUIDE_PATH}" to understand the ticket conventions and workflow.

Generate implementation tickets that break this epic into concrete development tasks, and WRITE THEM to the canonical backlog database using the ticket-write tool at "${TICKET_WRITE_TOOL_PATH}". Do not write to ".ombutocode/planning/backlog.yml" — it is legacy.

Each ticket needs:
- id: an epic-derived uppercase prefix plus a zero-padded sequence, e.g. AUTH-001 (choose the prefix yourself from the epic name)
- title: clear, actionable title
- status: ${status}
- assignee: ${assignee}
- epic_ref: docs/${input.epicPath}
- acceptance_criteria: list of testable criteria
- dependencies: list of ticket IDs this depends on (if any)

Guidelines:
- Each ticket should be completable by one agent in one session
- Include setup/infrastructure tickets before feature tickets
- Aim for 3-8 tickets per epic
- After writing the tickets, update the epic status from NEW to TICKETS

DO NOT ASK ME ANYTHING. This session is often left unattended: if you stop to ask about the ID prefix, the ticket split, or permission to write, the run stalls and nothing gets written at all. Make your best decision, record any assumption in the ticket's notes field, and proceed. Print the summary table as a record of what you are writing — not as a request for approval — then write immediately.
${CLOSEOUT_INSTRUCTIONS[closeout]}
Start by reading the epic. Finish with exactly "${TICKETS_DONE_SENTINEL}" as your last line once you have verified the tickets are in the database, or "${TICKETS_FAILED_SENTINEL}" if writing did not succeed.`;
}

const CLOSEOUT_MODES = new Set(['all', 'eval', 'none']);

function normalizeCloseout(value) {
  const mode = String(value || 'all').trim().toLowerCase();
  return CLOSEOUT_MODES.has(mode) ? mode : 'all';
}

// The skill calls its four closeout tickets "non-negotiable", so restricting
// them needs an equally explicit override or the agent follows the skill.
const CLOSEOUT_INSTRUCTIONS = {
  all: '',
  eval: `
CLOSEOUT TICKETS FOR THIS RUN — this overrides the skill's "four mandatory closeout tickets" rule: append ONLY the epic-level evaluation closeout ticket (Closeout #1), depending on every feature ticket. Do NOT create the regression-tests, help-docs, or code-map-refresh closeout tickets; this repository has no help documentation or code map to maintain and those tickets would only add cost.
`,
  none: `
CLOSEOUT TICKETS FOR THIS RUN — this overrides the skill's "four mandatory closeout tickets" rule: do NOT append any closeout tickets (no epic-eval, regression-tests, help-docs, or code-map-refresh ticket). The ticket list ends with the last feature ticket.
`
};

/**
 * Read the completion sentinel off the end of an agent transcript.
 * Returns { state: 'done'|'failed'|'missing', path? } — `path` is the file
 * the epic sentinel names, when present.
 */
function parseSentinel(output, { done, failed }) {
  const lines = String(output || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // Look at the tail, not just the last line: some agents append a blank
  // summary or token report after the final line of the reply.
  const tail = lines.slice(-5).reverse();
  for (const line of tail) {
    if (line.startsWith(failed)) return { state: 'failed' };
    if (line.startsWith(done)) {
      const rest = line.slice(done.length).trim();
      return rest ? { state: 'done', path: rest.replace(/^["'`]|["'`]$/g, '') } : { state: 'done' };
    }
  }
  return { state: 'missing' };
}

module.exports = {
  ENGINEERING_GUIDE_PATH,
  TICKET_WRITE_TOOL_PATH,
  EPIC_DONE_SENTINEL,
  EPIC_FAILED_SENTINEL,
  TICKETS_DONE_SENTINEL,
  TICKETS_FAILED_SENTINEL,
  STRATEGY_SKILL_NAMES,
  UNATTENDED_SKILL_NAME,
  REFINEMENT_SKILL_NAME,
  normalizeEpicMode,
  normalizeStrategy,
  normalizeCloseout,
  formatExistingEpics,
  selectEpicSkill,
  buildEpicPrompt,
  buildTicketPrompt,
  parseSentinel
};
