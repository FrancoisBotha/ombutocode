const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '../../tools');
const TOOL_NAMES = ['db-query', 'ticket-write', 'svg-to-png'];

test('agent tools are CommonJS and named .cjs', () => {
  for (const name of TOOL_NAMES) {
    assert.ok(fs.existsSync(path.join(TOOLS_DIR, `${name}.cjs`)), `${name}.cjs should exist`);
    // The .js twin would be parsed as ESM in a "type": "module" project and
    // die on its first require().
    assert.ok(!fs.existsSync(path.join(TOOLS_DIR, `${name}.js`)), `${name}.js should be gone`);
  }
});

test('the manifest points at the .cjs files', () => {
  const raw = fs.readFileSync(path.join(TOOLS_DIR, 'tools.json'), 'utf-8');
  const manifest = JSON.parse(raw);

  assert.ok(!/\b(db-query|ticket-write|svg-to-png)\.js\b/.test(raw), 'no stale .js references');
  for (const tool of manifest.tools) {
    assert.ok(tool.path.endsWith('.cjs'), `${tool.name} path should be .cjs`);
    assert.ok(tool.invocation.includes('.cjs'), `${tool.name} invocation should be .cjs`);
    assert.ok(
      fs.existsSync(path.join(TOOLS_DIR, path.basename(tool.path))),
      `${tool.name} manifest path should resolve to a real file`
    );
  }
});

test('docs and skills invoke the .cjs tools', () => {
  const docs = [
    path.join(__dirname, '../../OMBUTOCODE_ENGINEERING_GUIDE.md'),
    path.join(__dirname, '../../templates/skills/Ticket Generation/Ticket Generation.md'),
    path.join(__dirname, '../../templates/skills/BDD/BDD Ticket Generation.md'),
    path.join(__dirname, '../../templates/skills/Diagnostics/Fix Ticket.md'),
    path.join(__dirname, '../../templates/skills/Styling/Mockup Generator.md'),
  ];
  for (const doc of docs) {
    const text = fs.readFileSync(doc, 'utf-8');
    assert.ok(
      !/\b(db-query|ticket-write|svg-to-png)\.js\b/.test(text),
      `${path.basename(doc)} still references a .js tool`
    );
  }
});

test('tools run inside a project declaring "type": "module"', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-esm-'));
  fs.writeFileSync(path.join(projectRoot, 'package.json'), '{"name":"esm","type":"module"}');
  const toolsDir = path.join(projectRoot, '.ombutocode', 'tools');
  fs.mkdirSync(toolsDir, { recursive: true });

  for (const name of TOOL_NAMES) {
    const dest = path.join(toolsDir, `${name}.cjs`);
    fs.copyFileSync(path.join(TOOLS_DIR, `${name}.cjs`), dest);

    // No args → usage banner. The failure this guards against is a hard
    // startup crash ("require is not defined in ES module scope"), not a
    // non-zero exit from a missing argument.
    let output = '';
    try {
      output = execFileSync(process.execPath, [dest], { cwd: projectRoot, encoding: 'utf-8' });
    } catch (err) {
      output = `${err.stdout || ''}${err.stderr || ''}`;
    }
    assert.ok(
      !/require is not defined/i.test(output),
      `${name}.cjs should not be parsed as ESM: ${output.slice(0, 200)}`
    );
    assert.match(output, /Tool|Usage|Commands/i, `${name}.cjs should print its usage banner`);
  }

  fs.rmSync(projectRoot, { recursive: true, force: true });
});
