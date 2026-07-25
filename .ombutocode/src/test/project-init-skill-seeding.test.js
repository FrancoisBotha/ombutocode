const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ensureOmbutocodeStructure, copyMissingFiles } = require('../src/main/projectInit');

function makeAppRoot() {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-app-'));
  const skills = path.join(appRoot, '.ombutocode', 'templates', 'skills', 'Bootstrapping');
  fs.mkdirSync(skills, { recursive: true });
  fs.writeFileSync(path.join(skills, 'Initiate Stack.md'), '# Initiate Stack\n');
  fs.writeFileSync(path.join(skills, 'Bootstrap Prototype.md'), '# Bootstrap Prototype\n');
  fs.writeFileSync(
    path.join(appRoot, '.ombutocode', 'templates', 'backlog.yml'),
    'version: 1\ntickets: []\n'
  );
  return appRoot;
}

function cleanup(...dirs) {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
}

test('newly shipped skills are seeded into an existing project', () => {
  const appRoot = makeAppRoot();
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-proj-'));

  // Simulate a project created before Bootstrap Prototype shipped.
  const projectSkills = path.join(projectRoot, 'docs', 'Skills', 'Bootstrapping');
  fs.mkdirSync(projectSkills, { recursive: true });
  fs.writeFileSync(path.join(projectSkills, 'Initiate Stack.md'), '# edited by the user\n');

  ensureOmbutocodeStructure(projectRoot, appRoot);

  assert.ok(
    fs.existsSync(path.join(projectSkills, 'Bootstrap Prototype.md')),
    'the new skill should be copied into docs/Skills'
  );
  assert.equal(
    fs.readFileSync(path.join(projectSkills, 'Initiate Stack.md'), 'utf-8'),
    '# edited by the user\n',
    'an existing skill must not be overwritten'
  );
  assert.ok(
    fs.existsSync(path.join(projectRoot, '.ombutocode', 'templates', 'skills', 'Bootstrapping', 'Bootstrap Prototype.md')),
    'skill templates should be copied recursively into the project'
  );

  cleanup(appRoot, projectRoot);
});

test('skills a user deleted are not resurrected on the same run they exist', () => {
  const appRoot = makeAppRoot();
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-proj-'));

  ensureOmbutocodeStructure(projectRoot, appRoot);
  const seeded = path.join(projectRoot, 'docs', 'Skills', 'Bootstrapping', 'Bootstrap Prototype.md');
  assert.ok(fs.existsSync(seeded), 'first run seeds the skill');

  fs.writeFileSync(seeded, '# user rewrote this\n');
  ensureOmbutocodeStructure(projectRoot, appRoot);
  assert.equal(
    fs.readFileSync(seeded, 'utf-8'),
    '# user rewrote this\n',
    'a second run must leave user content alone'
  );

  cleanup(appRoot, projectRoot);
});

test('copyMissingFiles is a no-op when source and destination are the same tree', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-same-'));
  fs.writeFileSync(path.join(dir, 'a.md'), 'a');

  const copied = copyMissingFiles(dir, dir);

  assert.deepEqual(copied, [], 'nothing should be copied onto itself');
  assert.deepEqual(fs.readdirSync(dir), ['a.md']);

  cleanup(dir);
});
