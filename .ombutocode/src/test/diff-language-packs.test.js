/**
 * The diff viewer's language map lives inside a .vue file, which the CJS test
 * runner cannot import, so these assert against the source text — the same
 * approach the skills tests use.
 *
 * The rule worth pinning: every @codemirror package the component imports must
 * also be a declared dependency. Several language packs are present in
 * node_modules only as transitive deps of others, so an undeclared import works
 * locally and breaks on a clean install.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const componentPath = path.join(__dirname, '../src/renderer/components/TicketChangesDialog.vue');
const component = fs.readFileSync(componentPath, 'utf-8');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));

/** Extensions that must resolve to a highlighter, grouped by language. */
const EXPECTED_EXTENSIONS = {
  'C/C++': ['c', 'h', 'cpp', 'cxx', 'cc', 'hpp', 'hxx', 'hh'],
  'C#': ['cs'],
  Python: ['py', 'pyw', 'pyi'],
  Rust: ['rs'],
  Ruby: ['rb', 'rake', 'gemspec'],
  JavaScript: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'json'],
  Markup: ['html', 'htm', 'vue', 'css', 'scss', 'md', 'markdown']
};

test('every @codemirror import is a declared dependency', () => {
  const imports = [...component.matchAll(/from '(@codemirror\/[^'/]+)/g)].map(m => m[1]);
  assert.ok(imports.length > 0, 'component should import codemirror packages');

  for (const name of new Set(imports)) {
    assert.ok(
      pkg.dependencies[name],
      `${name} is imported but not declared in package.json — it would break a clean install`
    );
  }
});

test('the language map covers the expected file extensions', () => {
  const mapMatch = component.match(/const LANGUAGE_BY_EXTENSION = \{([\s\S]*?)\n\};/);
  assert.ok(mapMatch, 'LANGUAGE_BY_EXTENSION should be present');
  const body = mapMatch[1];

  for (const [language, extensions] of Object.entries(EXPECTED_EXTENSIONS)) {
    for (const ext of extensions) {
      assert.match(
        body,
        new RegExp(`(^|[\\s,{])${ext}\\s*:`, 'm'),
        `${language}: .${ext} should map to a highlighter`
      );
    }
  }
});

test('C# and Ruby go through the legacy stream-mode wrapper', () => {
  // Neither has a published Lezer grammar; StreamLanguage is the supported
  // fallback and keeps them off third-party packages.
  assert.match(component, /StreamLanguage/, 'should import StreamLanguage');
  assert.match(component, /legacy-modes\/mode\/clike/, 'C# uses the clike legacy mode');
  assert.match(component, /legacy-modes\/mode\/ruby/, 'Ruby uses the ruby legacy mode');
});

test('the newly added language packages resolve at runtime', () => {
  assert.equal(typeof require('@codemirror/lang-cpp').cpp, 'function');
  assert.equal(typeof require('@codemirror/lang-python').python, 'function');
  assert.equal(typeof require('@codemirror/lang-rust').rust, 'function');
  assert.equal(typeof require('@codemirror/language').StreamLanguage, 'function');
  assert.ok(require('@codemirror/legacy-modes/mode/clike').csharp, 'csharp stream mode exists');
  assert.ok(require('@codemirror/legacy-modes/mode/ruby').ruby, 'ruby stream mode exists');
});

test('an unknown extension falls back to no highlighter rather than throwing', () => {
  // languageExtension returns [] for anything unmapped, and swallows a factory
  // that throws — both are what keep an exotic file from breaking the dialog.
  assert.match(component, /const factory = LANGUAGE_BY_EXTENSION\[ext\];/);
  assert.match(component, /if \(!factory\) return \[\];/);
  assert.match(component, /catch \(_\) \{\s*return \[\];/);
});
