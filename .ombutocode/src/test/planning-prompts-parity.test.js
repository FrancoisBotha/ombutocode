const test = require('node:test');
const assert = require('node:assert/strict');

const { buildEpicPrompt, buildTicketPrompt } = require('../src/main/planningPrompts');

// Guard against drift between planningPrompts.js and the prompts the Plan
// views used to build inline. The two `vue*Prompt` helpers below are verbatim
// transcriptions of the template literals that lived in PlanEpicsView.vue
// (startSession) and PlanTicketGenView.vue (buildPrompt) before the views were
// switched to the shared module over IPC. If the module's output ever differs
// from these strings, fix the module — not this file.

function vueEpicPrompt({ mode = 'bulk', targetEpicPath = null, epicStrategy, selectedSkillContent, selectedPrd, selectedArch, selectedStyleGuide, selectedCodeMap, epics }) {
  const contextParts = [`Read the PRD at "docs/${selectedPrd}"`];
  if (selectedArch) contextParts.push(`the Architecture document at "docs/${selectedArch}"`);
  if (selectedStyleGuide) contextParts.push(`the Style Guide at "docs/${selectedStyleGuide}"`);
  if (selectedCodeMap) contextParts.push(`the Code Map at "docs/${selectedCodeMap}"`);

  const skillPrefix = selectedSkillContent ? selectedSkillContent + '\n\n---\n\n' : '';
  const baseContext = `${contextParts.join(', and ')}. Also read the engineering guide at ".ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md" to understand the project conventions and ticket workflow.`;

  const existingEpicLines = epics.length
    ? epics.map(e => `- ${e.name.replace(/\.md$/, '')} (${e.status || 'NEW'})`).join('\n')
    : '(none yet)';

  let instruction;
  if (mode === 'refine' && targetEpicPath) {
    instruction = `Refine the epic at "docs/${targetEpicPath}". First, read that file in full. Then propose specific edits to tighten its purpose, scope, acceptance criteria, FR/NFR cross-references, dependencies, and any other section that needs work. Ask me to confirm each significant edit before writing changes. Keep the existing numeric prefix and \`Status:\` value untouched unless I explicitly ask to change them.

Existing epics for context (do not duplicate scope across them):
${existingEpicLines}`;
  } else if (mode === 'single') {
    instruction = `Apply the Epic Generation skill above to propose ONE NEW epic that fills a gap in the existing set. Do NOT redo the whole epic breakdown. Identify what's missing relative to the source documents above, then propose a single epic with title + one-line summary and ask me to confirm before creating the file. Pick the next available numeric prefix (continue from the highest \`epic_NN_\` already in use).

Existing epics (do not duplicate scope):
${existingEpicLines}`;
  } else if (epicStrategy === 'layered') {
    instruction = `Apply the Epic Generation - Layered skill above to produce the initial epic set. Decompose by subsystem and architectural layer, favouring seams that let epics be built in parallel, and declare real prerequisites in \`Depends On:\`. Start by proposing the list of epics with a one-line summary for each. Ask me to confirm before creating the files.`;
  } else {
    instruction = `Apply the Epic Generation - Vertical Slice skill above to produce the initial epic set. Every epic must end with an application that builds, runs, and lets a user complete a real task end to end — no epic whose value only materialises in a later epic. Apply "The test" from the skill to each proposed epic before showing it to me. Propose the list as a table of sequence number, title, and what a user can do once that epic is DONE. Ask me to confirm before creating the files.`;
  }

  return `${skillPrefix}${baseContext}

${instruction}`;
}

function vueTicketPrompt(epic, selectedSkillContent) {
  const skillPrefix = selectedSkillContent ? selectedSkillContent + '\n\n' : '';

  return `${skillPrefix}Read the epic specification at "docs/${epic.path}". Also read the engineering guide at ".ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md" to understand the ticket conventions and workflow.

Generate implementation tickets that break this epic into concrete development tasks, and WRITE THEM to the canonical backlog database using the ticket-write tool at ".ombutocode/tools/ticket-write.cjs". Do not write to ".ombutocode/planning/backlog.yml" — it is legacy.

Each ticket needs:
- id: an epic-derived uppercase prefix plus a zero-padded sequence, e.g. AUTH-001 (choose the prefix yourself from the epic name)
- title: clear, actionable title
- status: backlog
- assignee: null
- epic_ref: docs/${epic.path}
- acceptance_criteria: list of testable criteria
- dependencies: list of ticket IDs this depends on (if any)

Guidelines:
- Each ticket should be completable by one agent in one session
- Include setup/infrastructure tickets before feature tickets
- Aim for 3-8 tickets per epic
- After writing the tickets, update the epic status from NEW to TICKETS

DO NOT ASK ME ANYTHING. This session is often left unattended: if you stop to ask about the ID prefix, the ticket split, or permission to write, the run stalls and nothing gets written at all. Make your best decision, record any assumption in the ticket's notes field, and proceed. Print the summary table as a record of what you are writing — not as a request for approval — then write immediately.

Start by reading the epic. Finish with exactly "DONE - TICKETS WRITTEN" as your last line once you have verified the tickets are in the database, or "FAILED - NO TICKETS WRITTEN" if writing did not succeed.`;
}

// Mirror of what PlanEpicsView.startSession() sends over IPC.
function moduleEpicPrompt(state) {
  return buildEpicPrompt({
    mode: state.mode,
    strategy: state.epicStrategy,
    skillContent: state.selectedSkillContent,
    prd: state.selectedPrd,
    arch: state.selectedArch,
    styleGuide: state.selectedStyleGuide,
    codeMap: state.selectedCodeMap,
    existingEpics: state.epics.map(e => ({ name: e.name, status: e.status })),
    targetEpicPath: state.targetEpicPath
  });
}

const SKILL = '# Epic Generation\n\nSome skill body with `code` and ${not-interpolated}.';
const EPICS = [
  { name: 'epic_01_FOUNDATION.md', status: 'TICKETS', path: 'Epics/epic_01_FOUNDATION.md' },
  { name: 'epic_02_AUTH.md', status: undefined, path: 'Epics/epic_02_AUTH.md' },
  { name: 'epic_03_BILLING.md', status: 'NEW', path: 'Epics/epic_03_BILLING.md' }
];

const docVariants = [
  { label: 'PRD only', selectedArch: '', selectedStyleGuide: '', selectedCodeMap: '' },
  { label: 'PRD + arch', selectedArch: 'Architecture/architecture.md', selectedStyleGuide: '', selectedCodeMap: '' },
  { label: 'PRD + style guide', selectedArch: '', selectedStyleGuide: 'Style Guide/style-guide.md', selectedCodeMap: '' },
  { label: 'PRD + code map', selectedArch: '', selectedStyleGuide: '', selectedCodeMap: 'Code Map/code-map.md' },
  { label: 'all documents', selectedArch: 'Architecture/architecture.md', selectedStyleGuide: 'Style Guide/style-guide.md', selectedCodeMap: 'Code Map/code-map.md' }
];

const modeVariants = [
  { label: 'bulk-vertical', mode: 'bulk', epicStrategy: 'vertical', epics: [] },
  { label: 'bulk-layered', mode: 'bulk', epicStrategy: 'layered', epics: [] },
  { label: 'single', mode: 'single', epicStrategy: 'vertical', epics: EPICS },
  { label: 'refine', mode: 'refine', epicStrategy: 'vertical', epics: EPICS, targetEpicPath: 'Epics/epic_02_AUTH.md' }
];

for (const modeVariant of modeVariants) {
  for (const docVariant of docVariants) {
    for (const skill of [SKILL, '']) {
      const name = `epic prompt parity: ${modeVariant.label}, ${docVariant.label}, ${skill ? 'with' : 'without'} skill`;
      test(name, () => {
        const state = {
          ...modeVariant,
          ...docVariant,
          selectedSkillContent: skill,
          selectedPrd: 'Product Requirements Document/prd.md'
        };
        assert.equal(moduleEpicPrompt(state), vueEpicPrompt(state));
      });
    }
  }
}

test('epic prompt parity: refine without a target falls through to the strategy instruction', () => {
  const state = {
    mode: 'refine', targetEpicPath: null, epicStrategy: 'layered', epics: EPICS,
    selectedSkillContent: SKILL, selectedPrd: 'p.md', selectedArch: '', selectedStyleGuide: '', selectedCodeMap: ''
  };
  assert.equal(moduleEpicPrompt(state), vueEpicPrompt(state));
});

test('epic prompt parity: single with no existing epics prints "(none yet)"', () => {
  const state = {
    mode: 'single', epicStrategy: 'vertical', epics: [],
    selectedSkillContent: '', selectedPrd: 'p.md', selectedArch: '', selectedStyleGuide: '', selectedCodeMap: ''
  };
  assert.equal(moduleEpicPrompt(state), vueEpicPrompt(state));
});

// Closeout tickets became opt-in (default none) after the prompt moved out of
// the view, so today's prompt is the historical one plus one explicit closeout
// paragraph before the final "Start by reading the epic" line. Everything else
// must still match byte for byte.
const CLOSEOUT_NONE_PARAGRAPH = '\nCLOSEOUT TICKETS FOR THIS RUN: none. Do NOT append any closeout tickets (no epic-eval, regression-tests, help-docs, or code-map-refresh ticket); the ticket list ends with the last feature ticket.\n';
function vueTicketPromptWithCloseout(epic, skill) {
  const legacy = vueTicketPrompt(epic, skill);
  const marker = '\nStart by reading the epic.';
  const i = legacy.lastIndexOf(marker);
  return legacy.slice(0, i) + CLOSEOUT_NONE_PARAGRAPH + legacy.slice(i);
}

for (const skill of [SKILL, '']) {
  test(`ticket prompt parity: ${skill ? 'with' : 'without'} skill`, () => {
    const epic = EPICS[0];
    assert.equal(
      buildTicketPrompt({ epicPath: epic.path, skillContent: skill }),
      vueTicketPromptWithCloseout(epic, skill)
    );
  });
}
