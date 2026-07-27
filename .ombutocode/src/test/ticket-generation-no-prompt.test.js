const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf-8');

const SKILLS = [
  ['Ticket Generation', '../../templates/skills/Ticket Generation/Ticket Generation.md'],
  ['BDD Ticket Generation', '../../templates/skills/BDD/BDD Ticket Generation.md'],
];
const DOC_SKILLS = [
  ['Ticket Generation', '../../../docs/Skills/Ticket Generation/Ticket Generation.md'],
  ['BDD Ticket Generation', '../../../docs/Skills/BDD/BDD Ticket Generation.md'],
];

test('ticket-generation skills never stop to ask the user', () => {
  for (const [name, rel] of SKILLS) {
    const skill = read(rel);
    assert.ok(
      /Run to completion without prompting/.test(skill),
      `${name} should carry the no-prompting section`
    );
    // The exact phrasings that used to stall unattended runs.
    assert.ok(!/Wait for user confirmation/i.test(skill), `${name} should not wait for confirmation`);
    assert.ok(
      !/Confirm the chosen prefix with the user/i.test(skill),
      `${name} should not ask the user to approve the ID prefix`
    );
    assert.ok(
      !/\*\*Always confirm\*\* with the user before writing/i.test(skill),
      `${name} should not require confirmation before writing`
    );
  }
});

test('both skills end with the same completion marker', () => {
  for (const [name, rel] of SKILLS) {
    const skill = read(rel);
    assert.ok(skill.includes('DONE - TICKETS WRITTEN'), `${name} should define the success marker`);
    assert.ok(
      skill.includes('FAILED - NO TICKETS WRITTEN'),
      `${name} should define a failure marker so a stalled run is not read as success`
    );
    assert.ok(
      /only after/i.test(skill),
      `${name} should require verification before claiming success`
    );
  }
});

test('the shipped skills and the project copies match', () => {
  for (let i = 0; i < SKILLS.length; i += 1) {
    const template = read(SKILLS[i][1]);
    const projectCopy = read(DOC_SKILLS[i][1]);
    assert.equal(template, projectCopy, `${SKILLS[i][0]} template and docs copy should be identical`);
  }
});

test('the launcher prompts agree with the skills', () => {
  const ticketGen = read('../src/renderer/components/PlanTicketGenView.vue');
  const bddView = read('../src/renderer/components/PlanBddUseCasesView.vue');

  for (const [name, content] of [['PlanTicketGenView', ticketGen], ['PlanBddUseCasesView', bddView]]) {
    assert.ok(content.includes('DO NOT ASK ME ANYTHING'), `${name} should tell the agent not to prompt`);
    assert.ok(content.includes('DONE - TICKETS WRITTEN'), `${name} should require the completion marker`);
    assert.ok(
      !/ask me to confirm before writing/i.test(content),
      `${name} should no longer ask for confirmation before writing`
    );
  }

  // The old prompt also contradicted the skill on where tickets are stored.
  assert.ok(
    ticketGen.includes('ticket-write.cjs'),
    'the ticket-gen prompt should name the canonical writer'
  );
  assert.ok(
    !/added to the backlog in "\.ombutocode\/planning\/backlog\.yml"/.test(ticketGen),
    'the ticket-gen prompt should not point at the legacy YAML backlog'
  );

  // Authoring a BDD story is still meant to be a conversation — only the
  // ticket-writing flow runs unattended.
  assert.ok(
    /Ask me one question at a time/.test(bddView),
    'the BDD authoring flow should remain interactive'
  );
});
