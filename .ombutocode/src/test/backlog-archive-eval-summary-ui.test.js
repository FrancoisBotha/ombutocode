const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('BacklogDetail sidebar displays eval summary checklist with same format as Kanban modal', () => {
  const backlogDetailPath = path.join(__dirname, '../src/renderer/components/BacklogDetail.vue');
  const content = fs.readFileSync(backlogDetailPath, 'utf-8');

  // Check Evaluation Summary section exists
  assert.ok(
    content.includes('Evaluation Summary'),
    'BacklogDetail should render an Evaluation Summary section'
  );
  
  // Check v-if conditional rendering
  assert.ok(
    content.includes('v-if="hasEvalSummary(ticket)"'),
    'BacklogDetail should conditionally render eval summary section'
  );
  
  // Check verdict badge with CSS classes
  assert.ok(
    content.includes('eval-verdict-badge'),
    'BacklogDetail should display eval verdict badge'
  );
  assert.ok(
    content.includes('is-pass') && content.includes('is-fail'),
    'BacklogDetail should have pass/fail badge classes'
  );
  
  // Check timestamp formatting
  assert.ok(
    content.includes('formatEvalSummaryTimestamp'),
    'BacklogDetail should format eval summary timestamp'
  );
  
  // Check checklist rendering
  assert.ok(
    content.includes('eval-checklist'),
    'BacklogDetail should render eval checklist'
  );
  assert.ok(
    content.includes('getEvalCriteriaChecks'),
    'BacklogDetail should use criteria checks helper'
  );
  
  // Check pass/fail icons
  assert.ok(
    content.includes('mdi-check-circle') && content.includes('mdi-close-circle'),
    'BacklogDetail should show pass/fail icons'
  );
  
  // Check failure reason and suggestion display
  assert.ok(
    content.includes('check.failure_reason'),
    'BacklogDetail should display failure_reason for failed criteria'
  );
  assert.ok(
    content.includes('check.suggestion'),
    'BacklogDetail should display suggestion for failed criteria'
  );
  
  // Check empty criteria message
  assert.ok(
    content.includes('No per-criterion details available'),
    'BacklogDetail should show message when no criteria checks exist'
  );
});

test('ArchiveTable detail panel displays eval summary checklist with same format as Kanban modal', () => {
  const archiveTablePath = path.join(__dirname, '../src/renderer/components/ArchiveTable.vue');
  const content = fs.readFileSync(archiveTablePath, 'utf-8');

  // Check Evaluation Summary section exists
  assert.ok(
    content.includes('Evaluation Summary'),
    'ArchiveTable should render an Evaluation Summary section'
  );
  
  // Check v-if conditional rendering
  assert.ok(
    content.includes('v-if="hasEvalSummary(selectedTicket)"'),
    'ArchiveTable should conditionally render eval summary section'
  );
  
  // Check verdict badge with CSS classes
  assert.ok(
    content.includes('eval-verdict-badge'),
    'ArchiveTable should display eval verdict badge'
  );
  assert.ok(
    content.includes('is-pass') && content.includes('is-fail'),
    'ArchiveTable should have pass/fail badge classes'
  );
  
  // Check timestamp formatting
  assert.ok(
    content.includes('formatEvalSummaryTimestamp'),
    'ArchiveTable should format eval summary timestamp'
  );
  
  // Check checklist rendering
  assert.ok(
    content.includes('eval-checklist'),
    'ArchiveTable should render eval checklist'
  );
  assert.ok(
    content.includes('getEvalCriteriaChecks'),
    'ArchiveTable should use criteria checks helper'
  );
  
  // Check pass/fail icons
  assert.ok(
    content.includes('mdi-check-circle') && content.includes('mdi-close-circle'),
    'ArchiveTable should show pass/fail icons'
  );
  
  // Check failure reason and suggestion display
  assert.ok(
    content.includes('check.failure_reason'),
    'ArchiveTable should display failure_reason for failed criteria'
  );
  assert.ok(
    content.includes('check.suggestion'),
    'ArchiveTable should display suggestion for failed criteria'
  );
  
  // Check empty criteria message
  assert.ok(
    content.includes('No per-criterion details available'),
    'ArchiveTable should show message when no criteria checks exist'
  );
});

test('BacklogDetail handles missing eval_summary gracefully (section not rendered)', () => {
  const backlogDetailPath = path.join(__dirname, '../src/renderer/components/BacklogDetail.vue');
  const content = fs.readFileSync(backlogDetailPath, 'utf-8');

  // Check hasEvalSummary helper validates eval_summary properly
  assert.ok(
    content.includes('const getEvalSummary = (ticket) => {'),
    'BacklogDetail should define getEvalSummary helper'
  );
  
  assert.ok(
    content.includes("verdict !== 'PASS' && verdict !== 'FAIL'") || 
    content.includes("verdict !== 'FAIL' && verdict !== 'PASS'"),
    'BacklogDetail should validate verdict is PASS or FAIL'
  );
  
  // Section uses v-if to only render when eval_summary exists
  assert.ok(
    content.includes('v-if="hasEvalSummary(ticket)"'),
    'BacklogDetail eval summary section should use v-if conditional'
  );
  
  // Check both dt and dd use the same conditional
  const evalSummaryDtMatch = content.match(/<dt[^>]*v-if="hasEvalSummary\(ticket\)"[^>]*>Evaluation Summary<\/dt>/);
  const evalSummaryDdMatch = content.match(/<dd[^>]*v-if="hasEvalSummary\(ticket\)"[^>]*class="eval-summary-section"/);
  
  assert.ok(
    evalSummaryDtMatch,
    'BacklogDetail dt element should have v-if conditional'
  );
  assert.ok(
    evalSummaryDdMatch,
    'BacklogDetail dd element should have v-if conditional'
  );
});

test('ArchiveTable handles missing eval_summary gracefully (section not rendered)', () => {
  const archiveTablePath = path.join(__dirname, '../src/renderer/components/ArchiveTable.vue');
  const content = fs.readFileSync(archiveTablePath, 'utf-8');

  // Check hasEvalSummary helper validates eval_summary properly
  assert.ok(
    content.includes('const getEvalSummary = (ticket) => {'),
    'ArchiveTable should define getEvalSummary helper'
  );
  
  assert.ok(
    content.includes("verdict !== 'PASS' && verdict !== 'FAIL'") || 
    content.includes("verdict !== 'FAIL' && verdict !== 'PASS'"),
    'ArchiveTable should validate verdict is PASS or FAIL'
  );
  
  // Section uses v-if to only render when eval_summary exists
  assert.ok(
    content.includes('v-if="hasEvalSummary(selectedTicket)"'),
    'ArchiveTable eval summary section should use v-if conditional'
  );
  
  // Check both dt and dd use the same conditional
  const evalSummaryDtMatch = content.match(/<dt[^>]*v-if="hasEvalSummary\(selectedTicket\)"[^>]*>Evaluation Summary<\/dt>/);
  const evalSummaryDdMatch = content.match(/<dd[^>]*v-if="hasEvalSummary\(selectedTicket\)"[^>]*class="eval-summary-section"/);
  
  assert.ok(
    evalSummaryDtMatch,
    'ArchiveTable dt element should have v-if conditional'
  );
  assert.ok(
    evalSummaryDdMatch,
    'ArchiveTable dd element should have v-if conditional'
  );
});
