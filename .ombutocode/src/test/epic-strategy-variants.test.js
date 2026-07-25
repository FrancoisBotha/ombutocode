const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SKILL_DIRS = [
  path.join(__dirname, '../../templates/skills/Epics'),
  path.join(__dirname, '../../../docs/Skills/Epics'),
];

test('both Epic Generation variants ship in docs and templates', () => {
  for (const dir of SKILL_DIRS) {
    for (const file of ['Epic Generation - Layered.md', 'Epic Generation - Vertical Slice.md']) {
      assert.ok(fs.existsSync(path.join(dir, file)), `${file} missing from ${dir}`);
    }
    // The old single skill was replaced by the two variants.
    assert.ok(
      !fs.existsSync(path.join(dir, 'Epic Generation.md')),
      `superseded Epic Generation.md still present in ${dir}`
    );
  }
});

test('vertical slice skill demands a working product per epic', () => {
  const skill = fs.readFileSync(path.join(SKILL_DIRS[0], 'Epic Generation - Vertical Slice.md'), 'utf-8');
  assert.ok(/every epic ships a working product/i.test(skill), 'states the core principle');
  assert.ok(/Working increment:/.test(skill), 'requires a working-increment line in §1');
  assert.ok(/REQUIRED, first/.test(skill), 'requires an end-to-end acceptance criterion');
  assert.ok(/Vertical slices, not horizontal layers/.test(skill), 'contrasts slices with layers');
  assert.ok(/Epic Generation - Layered/.test(skill), 'points at the other variant');
});

test('layered skill keeps the parallel-execution framing', () => {
  const skill = fs.readFileSync(path.join(SKILL_DIRS[0], 'Epic Generation - Layered.md'), 'utf-8');
  assert.ok(/optimises for: parallel execution/i.test(skill), 'states what it optimises for');
  assert.ok(/What you give up/.test(skill), 'states the trade-off honestly');
  assert.ok(/Epic Generation - Vertical Slice/.test(skill), 'points at the other variant');
});

test('epic creation page offers the strategy choice and maps it to a skill', () => {
  const view = fs.readFileSync(
    path.join(__dirname, '../src/renderer/components/PlanEpicsView.vue'),
    'utf-8'
  );
  assert.ok(view.includes("epicStrategy = ref('vertical')"), 'defaults to the working-MVP strategy');
  assert.ok(view.includes("vertical: 'epic generation - vertical slice'"), 'maps vertical to its skill');
  assert.ok(view.includes("layered: 'epic generation - layered'"), 'maps layered to its skill');
  assert.ok(view.includes("setEpicStrategy('vertical')"), 'renders the vertical option');
  assert.ok(view.includes("setEpicStrategy('layered')"), 'renders the layered option');
  // Guidance so the choice is informed, not a coin toss.
  assert.ok(/Best when/.test(view), 'each option explains when to pick it');
  // Falls back for projects that still carry the old un-suffixed skill.
  assert.ok(view.includes("includes('epic generation')"), 'falls back to any Epic Generation skill');
});

test('the skill can be chosen and previewed before the agent launches', () => {
  const view = fs.readFileSync(
    path.join(__dirname, '../src/renderer/components/PlanEpicsView.vue'),
    'utf-8'
  );
  assert.ok(view.includes('epics-skill-picker-select'), 'landing card has a skill dropdown');
  assert.ok(view.includes('epics-skill-preview-inline'), 'landing card can preview the skill');
  assert.ok(view.includes('skillManuallyChosen'), 'tracks a hand-picked skill');
  // A hand-picked skill must survive the auto-selection in startSession().
  assert.ok(
    view.includes('if (skillManuallyChosen.value) {'),
    'startSession respects a hand-picked skill'
  );
});
