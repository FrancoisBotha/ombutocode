#!/usr/bin/env node
/*
 * One-shot rewrite of codingagent-templates.json:
 *   - Impl templates (kimi / codex / claude) get a TEST-DRIVEN DEVELOPMENT
 *     section: write tests first, confirm they fail, then implement, then
 *     verify they pass. Tests are committed alongside implementation.
 *   - Test templates (kimi_test / codex_test / claude_test) are rewritten
 *     to be agent-instructed (project-stack agnostic) instead of pinned to
 *     the donor project's Rust / TypeScript / Swift / Node layer paths.
 *
 * Eval / merge_resolve / epic_eval templates are intentionally not touched.
 *
 * Run from the project root:
 *   node .ombutocode/scripts/update-test-templates.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TEMPLATES_PATH = path.join(__dirname, '..', 'codingagent-templates.json');

// ── Shared template fragments ──────────────────────────────────────────────

const TDD_INSTRUCTION = [
  'TEST-DRIVEN DEVELOPMENT (MANDATORY — applies BEFORE you write any implementation code):',
  '1. Detect the project test framework by reading manifest files (package.json, *.csproj, Cargo.toml, go.mod, pom.xml, requirements.txt, build.gradle, Gemfile, etc.) and the existing test directory layout. If the project has no existing test setup, scaffold one at the conventional location for the chosen language (e.g. `tests/`, `__tests__/`, `*.Tests/`).',
  "2. Write unit tests that cover this ticket's acceptance criteria — one test per criterion where practical. Follow the project's existing test conventions (file naming, directory layout, assertion style). Test the public contract the criteria describe, not the implementation details.",
  '3. RUN the tests now. They MUST FAIL — they are testing code you have not written yet. If any pass without an implementation, those tests are not testing the right thing — rewrite them.',
  '4. ONLY THEN implement the production code to make the tests pass.',
  '5. Run the tests again. They MUST all pass before you finish.',
  '6. In your final output, emit ONE of these markers on its own line:',
  '   - `TESTS_ADDED: path/to/test1, path/to/test2` (relative paths, comma-separated)',
  '   - `TESTS_SKIPPED: <specific reason>` — only for purely-UI / docs / config / data tickets where unit tests are not practical. Be specific; the test phase will reject vague rationales.',
  '7. Also emit on its own line:',
  '   - `TEST_COMMAND: <exact command>` — the command the test phase should run to execute your tests, scoped to just the tests you added (e.g. `dotnet test --filter FullyQualifiedName~UserAuthTests`, `npx jest path/to/foo.test.ts`, `cargo test --test foo`, `go test ./pkg/foo`, `pytest path/to/test_foo.py`).',
  '   - Or `TEST_COMMAND: none` if TESTS_SKIPPED above.'
].join('\n');

const NEW_TEST_PROMPT = [
  'You are in TEST mode. Do NOT pick up tickets from the backlog or implement code. Your ONLY job is to run the unit tests the implementation phase added for this ticket, run lint/type checks on the changed files, and report PASS/FAIL.',
  '',
  'Test ticket {{ticketId}} (title: {{title}}). Do not implement new code and do not edit backlog status fields.',
  '',
  '{{retryContext}}',
  '',
  'MANDATORY OUTPUT FORMAT — YOUR RESPONSE WILL BE MACHINE-PARSED:',
  'Your FIRST lines of output MUST use this exact structured format. If this format is missing, the test is automatically marked FAILED.',
  '',
  'TEST_RESULT: PASS or FAIL',
  'UNIT_TESTS: PASS or FAIL | <details>',
  'LINT_CHECK: PASS or FAIL | <details>',
  'TYPE_CHECK: PASS or FAIL | <details>',
  'FAILURE_DETAILS: <summary of what failed>',
  '',
  'Format rules:',
  "1. TEST_RESULT line MUST appear FIRST — use EXACTLY 'PASS' or 'FAIL'",
  '2. All sub-checks must report PASS or FAIL with details after the pipe',
  "3. Without 'TEST_RESULT: PASS', the tooling marks the test as FAILED",
  '4. Output the structured format FIRST, then any additional explanation after',
  '',
  'TESTING STEPS:',
  '',
  "Step 1: IDENTIFY THIS TICKET'S CHANGED FILES",
  '- Run: git diff --name-only main...HEAD',
  '- Split into two buckets:',
  '  * TEST FILES — anything in a test directory (`test/`, `tests/`, `__tests__/`, `spec/`) or matching common naming patterns (`*Test*.{cs,java,kt,scala}`, `*_test.{go,py,rs}`, `*.test.{js,jsx,ts,tsx,mjs}`, `*.spec.{js,jsx,ts,tsx}`, `*_spec.rb`, `test_*.py`).',
  '  * IMPLEMENTATION FILES — everything else (the production code this ticket added or changed).',
  '- Only failures in files belonging to one of these two buckets count against this ticket. Pre-existing failures elsewhere are NOT this ticket\'s problem.',
  '',
  'Step 2: HANDLE THE NO-TESTS CASE',
  '- If Step 1 produced ZERO test files, look at the implementation phase output (agent stdout in the run log, or the ticket notes) for a `TESTS_SKIPPED: <reason>` marker.',
  '  * If a `TESTS_SKIPPED:` marker is present with a specific reason, report UNIT_TESTS: PASS | tests skipped per impl-phase rationale: <quote the reason> and continue to Step 4.',
  '  * If no skip marker is present, the impl phase violated the TDD requirement. Report UNIT_TESTS: FAIL | no tests added and no TESTS_SKIPPED rationale found — TDD requirement violated and proceed to Step 5 with overall FAIL.',
  '',
  'Step 3: RUN THE TESTS',
  '- Determine the project test framework from the manifest files (package.json scripts/devDependencies, *.csproj, Cargo.toml, go.mod, pom.xml/build.gradle, requirements.txt/pyproject.toml, Gemfile, etc.).',
  '- Run ONLY the tests in the test files identified in Step 1 (not the whole suite — that may contain pre-existing failures unrelated to this ticket). Use the framework\'s mechanism for running specific files:',
  '  * .NET: `dotnet test --filter "FullyQualifiedName~<class-name>"` or `dotnet test <path/to/test-project>`',
  '  * Node / TypeScript: `npx jest <path>`, `npx vitest run <path>`, `node --test <path>`',
  '  * Rust: `cargo test <test_name>` or `cargo test --test <file_stem>`',
  '  * Go: `go test ./<package-path>`',
  '  * Python: `pytest <path>` or `python -m unittest <module>`',
  '  * Java: `mvn test -Dtest=<ClassName>` or `gradle test --tests <ClassName>`',
  '  * Ruby: `rspec <path>` or `ruby -Itest <path>`',
  '- If the impl agent emitted a `TEST_COMMAND:` marker in its output, prefer that exact command — it already knows which tests it wrote and how to run them.',
  '- Capture full output with pass/fail counts. Report UNIT_TESTS: PASS or FAIL.',
  '',
  "Step 4: LINT AND TYPE CHECK (THIS TICKET'S OWN FILES ONLY)",
  "- Identify the project's lint and type-check tooling from the same manifest files.",
  '- Run ONLY on files identified in Step 1 (both test and implementation files). Common patterns:',
  '  * TypeScript: `npx eslint <files>` and `npx tsc --noEmit`',
  '  * Rust: `cargo clippy -- -D warnings`',
  '  * .NET: `dotnet build` (compile errors will surface here); `dotnet format --verify-no-changes <files>` for style',
  '  * Go: `go vet ./...` and `gofmt -l <files>`',
  '  * Python: `ruff <files>` and `mypy <files>` (or whichever the project uses)',
  '  * Java: `mvn compile` and the project\'s configured linter (Checkstyle, SpotBugs)',
  "- PRE-EXISTING FAILURES IN OTHER FILES DO NOT COUNT. If a lint/type error appears in a file NOT in Step 1's lists, it is not this ticket's responsibility.",
  '- If the project has no configured lint tool, report LINT_CHECK: PASS | no linter configured. Same for TYPE_CHECK if there is no static type checker.',
  '- Report LINT_CHECK: PASS or FAIL and TYPE_CHECK: PASS or FAIL.',
  '',
  'Step 5: DETERMINE OVERALL RESULT',
  '- If ALL sub-checks pass: TEST_RESULT: PASS',
  '- If ANY sub-check fails: TEST_RESULT: FAIL with FAILURE_DETAILS explaining what failed and where',
  '',
  'IMPORTANT: Do NOT verify acceptance criteria or epic specifications. That is the eval phase, which runs after you.',
  '',
  'REMINDER: Start your response with the structured format (TEST_RESULT, UNIT_TESTS, LINT_CHECK, TYPE_CHECK).'
].join('\n');

// ── Impl-template editor ───────────────────────────────────────────────────

/**
 * Mutates an implementation-phase prompt string to:
 *  - replace the legacy "Do NOT run tests" line with a tighter one that only
 *    forbids project-wide lint/type-check (the agent now DOES run its own
 *    unit tests as part of the TDD cycle)
 *  - inject the TEST-DRIVEN DEVELOPMENT block just before "Provide a concise
 *    summary of files changed" (always the last line of these prompts)
 *
 * Idempotent: if the TDD block is already present, no change.
 */
function rewriteImplPrompt(prompt) {
  if (prompt.includes('TEST-DRIVEN DEVELOPMENT (MANDATORY')) return prompt;

  let out = prompt;

  // Swap the over-broad "no testing during impl" line.
  out = out.replace(
    'Do NOT run tests, lint, or type-checking — that is handled automatically by the test phase after implementation.',
    'Do NOT run project-wide lint or full-suite tests — the test phase handles those. You DO run your own targeted unit tests as part of the TDD cycle below.'
  );

  // Inject the TDD block right before the final summary instruction.
  const finalLine = 'Provide a concise summary of files changed.';
  if (out.includes(finalLine)) {
    out = out.replace(finalLine, `${TDD_INSTRUCTION}\n\n${finalLine}`);
  } else {
    // Defensive: if the prompt was previously edited and the anchor moved,
    // append at the end so we don't silently lose the instruction.
    out = `${out}\n\n${TDD_INSTRUCTION}`;
  }
  return out;
}

// ── Main ───────────────────────────────────────────────────────────────────

const templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));

// Impl templates — inject TDD block. Kimi puts the prompt in args[?]; Claude
// and Codex use a `stdin` key.
if (templates.kimi) {
  const args = templates.kimi.args || [];
  const idx = args.findIndex(a => typeof a === 'string' && a.includes('Implement ticket {{ticketId}}'));
  if (idx >= 0) args[idx] = rewriteImplPrompt(args[idx]);
}
if (templates.codex && typeof templates.codex.stdin === 'string') {
  templates.codex.stdin = rewriteImplPrompt(templates.codex.stdin);
}
if (templates.claude && typeof templates.claude.stdin === 'string') {
  templates.claude.stdin = rewriteImplPrompt(templates.claude.stdin);
}

// Test templates — full replacement with the generic, agent-instructed
// version. Kimi keeps its `stdin` shape (no change to the wrapping args);
// Claude and Codex same.
if (templates.kimi_test && typeof templates.kimi_test.stdin === 'string') {
  templates.kimi_test.stdin = NEW_TEST_PROMPT;
}
if (templates.codex_test && typeof templates.codex_test.stdin === 'string') {
  templates.codex_test.stdin = NEW_TEST_PROMPT;
}
if (templates.claude_test && typeof templates.claude_test.stdin === 'string') {
  templates.claude_test.stdin = NEW_TEST_PROMPT;
}

fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2) + '\n', 'utf8');
console.log('Updated codingagent-templates.json:');
console.log('  - kimi/codex/claude impl prompts: TDD section injected');
console.log('  - kimi_test/codex_test/claude_test prompts: rewritten to generic agent-instructed form');
