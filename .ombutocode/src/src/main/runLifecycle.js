'use strict';

/**
 * Extract plain text content from stream-json output.
 * When Claude uses --output-format stream-json, stdout contains JSON objects
 * with text content embedded. This function extracts all text fragments and
 * concatenates them into plain text for eval parsing.
 */
function extractTextFromStreamJson(rawOutput) {
  const text = String(rawOutput || '');
  if (!text.trim()) return '';

  // Check if output looks like stream-json (starts with JSON or contains JSON lines)
  const lines = text.split('\n');
  let hasJsonLines = false;
  const textParts = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed);
        hasJsonLines = true;

        // Extract text from assistant message content
        if (obj?.type === 'assistant' && obj?.message?.content) {
          const content = obj.message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block?.type === 'text' && typeof block.text === 'string') {
                textParts.push(block.text);
              }
            }
          }
        }

        // Extract text from content_block_delta events
        if (obj?.type === 'content_block_delta' && obj?.delta?.text) {
          textParts.push(obj.delta.text);
        }

        // Extract from result messages
        if (obj?.type === 'result' && obj?.result) {
          const result = obj.result;
          if (typeof result === 'string') {
            textParts.push(result);
          } else if (Array.isArray(result)) {
            for (const block of result) {
              if (block?.type === 'text' && typeof block.text === 'string') {
                textParts.push(block.text);
              }
            }
          }
        }
      } catch {
        // Not valid JSON, treat as plain text
        textParts.push(trimmed);
      }
    } else {
      // Plain text line
      textParts.push(trimmed);
    }
  }

  // If no JSON lines detected, return original text as-is
  if (!hasJsonLines) return text;

  return textParts.join('\n');
}

function extractStructuredVerdict(text) {
  const structuredVerdictMatch = String(text || '').match(
    /\bEVALUATION[_\s-]?RESULT\s*:\s*[*`_~\[(\s-]*(PASS|FAIL)[*`_~\])\s-]*/i
  );
  if (!structuredVerdictMatch) return null;
  return structuredVerdictMatch[1].toLowerCase() === 'pass' ? 'pass' : 'fail';
}

function resolveTicketStatusAfterRun({ runState, currentStatus }) {
  if (currentStatus === 'merging') {
    return currentStatus; // Handled by merging-specific logic in main.js
  }

  if (currentStatus === 'eval') {
    if (runState === 'completed') {
      return 'review';
    }

    if (runState === 'failed') {
      return 'todo';
    }

    return currentStatus;
  }

  if (currentStatus === 'test') {
    if (runState === 'completed') {
      return 'eval';
    }

    if (runState === 'failed') {
      return 'todo';
    }

    return currentStatus;
  }

  if (runState === 'completed') {
    return 'test';
  }

  if (runState === 'failed') {
    return 'todo';
  }

  return currentStatus;
}

function isAdHocEpic(epicRef) {
  const normalized = String(epicRef || '').trim().toLowerCase();
  return normalized === 'docs/Epics/epic_ad_hoc.md';
}

function parseEvalVerdict(outputText) {
  const text = String(outputText || '');
  if (!text.trim()) return null;

  const structuredVerdict = extractStructuredVerdict(text);
  if (structuredVerdict) return structuredVerdict;

  const failPatterns = [
    /\beval(?:uation)?(?:[_\s-]result)?\s*[:=-]\s*[*`_~\[(\s-]*fail\b/i,
    /\bverdict\s*[:=-]\s*[*`_~\[(\s-]*fail\b/i,
    /\bevaluation (?:outcome|result)\s*[:=-]\s*[*`_~\[(\s-]*fail\b/i,
    /\bevaluation failed\b/i
  ];

  for (const pattern of failPatterns) {
    if (pattern.test(text)) return 'fail';
  }

  const passPatterns = [
    /\beval(?:uation)?(?:[_\s-]result)?\s*[:=-]\s*[*`_~\[(\s-]*pass\b/i,
    /\bverdict\s*[:=-]\s*[*`_~\[(\s-]*pass\b/i,
    /\bevaluation (?:outcome|result)\s*[:=-]\s*[*`_~\[(\s-]*pass\b/i,
    /\bstatus\s+is\s+review\b/i,
    /\bstatus\s*[:=-]\s*review\b/i,
    // Narrative pass patterns — agent confirms all criteria without structured markers
    /\ball\s+\d+\s+(?:acceptance\s+)?criteria\s+(?:are\s+)?(?:confirmed|met|verified|satisfied|pass(?:ed|ing)?)\b/i,
    /\bacceptance\s+criteria\s*(?:[—–:-]\s*|\s+)all\s+(?:met|pass(?:ed)?|verified|confirmed)\b/i,
    /\ball\s+(?:acceptance\s+)?criteria\s+(?:are\s+)?(?:confirmed|met|verified|satisfied|pass(?:ed|ing)?)\b/i
  ];

  for (const pattern of passPatterns) {
    if (pattern.test(text)) return 'pass';
  }

  return null;
}

function parseStructuredEvalOutput(outputText) {
  const text = String(outputText || '');
  if (!text.trim()) {
    return {
      hasStructuredVerdict: false,
      hasAcceptanceCriteriaChecksHeader: false,
      hasAcceptanceCriteriaChecks: false,
      hasFeatureReferenceCheck: false,
      epicReferencePass: null,
      criteriaChecks: []
    };
  }

  const hasStructuredVerdict = !!extractStructuredVerdict(text);
  const hasAcceptanceCriteriaChecksHeader = /\bACCEPTANCE[_\s-]?CRITERIA[_\s-]?CHECKS\s*:/i.test(text);
  const acceptanceCriteriaChecksBodyMatch = text.match(
    /\bACCEPTANCE[_\s-]?CRITERIA[_\s-]?CHECKS\s*:\s*([\s\S]*?)(?:\n\s*#*\s*[*_~`]*\s*(?:FEATURE[_\s-]?REFERENCE[_\s-]?CHECK|VERIFICATION[_\s-]?COMMANDS|SUMMARY|EVALUATION[_\s-]?RESULT)\s*[*_~`]*\s*:|$)/i
  );
  const hasAcceptanceCriteriaChecksBody = acceptanceCriteriaChecksBodyMatch
    ? /\b(PASS|FAIL)\b|[✅✓☑❌✗☒]/i.test(acceptanceCriteriaChecksBodyMatch[1] || '')
    : false;
  const hasAcceptanceCriteriaChecks = hasAcceptanceCriteriaChecksHeader && hasAcceptanceCriteriaChecksBody;

  const featureCheckMatch = text.match(
    /\b(?:FEATURE|EPIC)[_\s-]?REFERENCE[_\s-]?CHECK\s*:\s*[*`_~\[(\s-]*(PASS|FAIL)\b/i
  );
  const hasFeatureReferenceCheck = !!featureCheckMatch;
  const epicReferencePass = featureCheckMatch
    ? featureCheckMatch[1].toLowerCase() === 'pass'
    : null;
  const criteriaChecks = hasAcceptanceCriteriaChecksBody
    ? parseAcceptanceCriteriaChecks(acceptanceCriteriaChecksBodyMatch[1] || '')
    : [];

  return {
    hasStructuredVerdict,
    hasAcceptanceCriteriaChecksHeader,
    hasAcceptanceCriteriaChecks,
    hasFeatureReferenceCheck,
    epicReferencePass,
    criteriaChecks
  };
}

function normalizeCriterionResult(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'PASS' || normalized === 'FAIL') {
    return normalized;
  }
  return null;
}

function extractLabelValue(text, labels) {
  const source = String(text || '');
  for (const label of labels) {
    const match = source.match(
      new RegExp(
        `${label}\\s*[:=-]\\s*([\\s\\S]*?)(?=\\b(?:failure[_\\s-]?reason|reason|evidence|suggestion)\\s*[:=-]|$)`,
        'i'
      )
    );
    if (match && match[1] && match[1].trim()) {
      return match[1].trim().replace(/\s*\|\s*$/, '').trim();
    }
  }
  return null;
}

function stripKnownTrailingLabels(text) {
  return String(text || '')
    .replace(/\b(?:failure[_\s-]?reason|reason|evidence|suggestion)\s*[:=-][\s\S]*$/i, '')
    .trim();
}

function parseCriterionCheckLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return null;

  const cleaned = raw.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim();
  let criterion = '';
  let result = null;

  // Checkmark / cross emoji patterns (✅/✓/☑ → PASS, ❌/✗/☒ → FAIL)
  const emojiMatch = cleaned.match(/^([✅✓☑❌✗☒])\s*(.+)$/);
  if (emojiMatch) {
    result = /[✅✓☑]/.test(emojiMatch[1]) ? 'PASS' : 'FAIL';
    criterion = stripKnownTrailingLabels(emojiMatch[2]);
  }
  // Trailing emoji: "criterion text ✅"
  if (!result) {
    const trailingEmoji = cleaned.match(/^(.+?)\s*([✅✓☑❌✗☒])\s*$/);
    if (trailingEmoji) {
      result = /[✅✓☑]/.test(trailingEmoji[2]) ? 'PASS' : 'FAIL';
      criterion = stripKnownTrailingLabels(trailingEmoji[1]);
    }
  }
  // Markdown table cell: "| criterion | ✅ |" or "| criterion | PASS |"
  if (!result) {
    const tableMatch = cleaned.match(/^\|?\s*(.+?)\s*\|\s*([✅✓☑❌✗☒]|PASS|FAIL)\s*\|?\s*$/i);
    if (tableMatch) {
      const marker = tableMatch[2];
      result = /[✅✓☑]/u.test(marker) || /^PASS$/i.test(marker) ? 'PASS' : 'FAIL';
      criterion = stripKnownTrailingLabels(tableMatch[1]);
    }
  }

  let match = !result ? cleaned.match(/^(PASS|FAIL)\s*[:=-]\s*(.+)$/i) : null;
  if (match) {
    result = normalizeCriterionResult(match[1]);
    criterion = stripKnownTrailingLabels(match[2]);
  }

  if (!result) {
    match = cleaned.match(/^(.+?)\s*=>\s*(PASS|FAIL)\b/i);
    if (match) {
      criterion = match[1].trim();
      result = normalizeCriterionResult(match[2]);
    }
  }

  if (!result) {
    match = cleaned.match(/^(.+?)\s*:\s*(PASS|FAIL)\b/i);
    if (match) {
      criterion = match[1].trim();
      result = normalizeCriterionResult(match[2]);
    }
  }

  if (!result) {
    match = cleaned.match(/^(PASS|FAIL)\b/i);
    if (match) {
      result = normalizeCriterionResult(match[1]);
      criterion = stripKnownTrailingLabels(cleaned.slice(match[0].length));
    }
  }

  if (!result) return null;

  criterion = criterion
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s*\|\s*$/g, '')
    .trim();

  if (!criterion) {
    criterion = 'Unspecified criterion';
  }

  if (result === 'PASS') {
    return {
      criterion,
      result,
      failure_reason: null,
      suggestion: null
    };
  }

  const failureReason = extractLabelValue(cleaned, ['failure[_\\s-]?reason', 'reason', 'evidence'])
    || 'Evaluator marked this criterion as FAIL without a detailed reason.';
  const suggestion = extractLabelValue(cleaned, ['suggestion'])
    || 'Update the implementation to satisfy this criterion, then re-run evaluation.';

  return {
    criterion,
    result,
    failure_reason: failureReason,
    suggestion
  };
}

function parseAcceptanceCriteriaChecks(sectionBody) {
  const SECTION_HEADER_RE = /\b(?:FEATURE[_\s-]?REFERENCE[_\s-]?CHECK|VERIFICATION[_\s-]?COMMANDS|SUMMARY|EVALUATION[_\s-]?RESULT)\s*:/i;

  const lines = String(sectionBody || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const checks = [];
  for (const line of lines) {
    if (SECTION_HEADER_RE.test(line)) continue;
    // Accept bullet lines (- *), numbered lines (1.), and table rows (|)
    if (!/[-*|]/.test(line[0]) && !/^\d+\./.test(line)) continue;
    const parsed = parseCriterionCheckLine(line);
    if (parsed) checks.push(parsed);
  }
  return checks;
}

function buildEvalSummary({ verdict, structured, timestamp, rawOutput, reasons }) {
  const normalizedVerdict = verdict === 'pass' ? 'PASS' : 'FAIL';
  const criteriaChecks = structured && structured.hasAcceptanceCriteriaChecks
    ? structured.criteriaChecks
    : [];

  const finalChecks = Array.isArray(criteriaChecks) ? criteriaChecks : [];
  const summary = {
    verdict: normalizedVerdict,
    criteria_checks: finalChecks,
    epic_reference_check: structured?.hasFeatureReferenceCheck
      ? (structured.epicReferencePass ? 'PASS' : 'FAIL')
      : 'NOT_FOUND',
    timestamp: timestamp || new Date().toISOString()
  };

  if (reasons && reasons.length > 0) {
    summary.failure_reasons = reasons;
  }

  // When structured parsing yielded no criteria but raw output exists,
  // preserve a truncated excerpt for debugging / retry context.
  if (finalChecks.length === 0 && rawOutput && String(rawOutput).trim()) {
    const raw = String(rawOutput);
    summary.raw_excerpt = raw.length > 500 ? raw.slice(-500) : raw;
  }

  return summary;
}

function resolveEvalOutcomeAfterRun({
  runState,
  currentStatus,
  stdout = '',
  stderr = '',
  runError = '',
  epicRef = '',
  finishedAt = ''
}) {
  const nextStatus = resolveTicketStatusAfterRun({ runState, currentStatus });
  if (currentStatus !== 'eval') {
    return { nextStatus, verdict: null, reasons: [], evalSummary: null };
  }

  // Extract plain text from stream-json output if applicable
  const rawCombined = `${stdout || ''}\n${stderr || ''}`;
  const combinedOutput = extractTextFromStreamJson(rawCombined);
  const verdict = parseEvalVerdict(combinedOutput);
  const structured = parseStructuredEvalOutput(combinedOutput);

  if (structured.hasAcceptanceCriteriaChecksHeader && !structured.hasAcceptanceCriteriaChecks) {
    console.warn('[eval] ACCEPTANCE_CRITERIA_CHECKS header found but body parsing failed — criteria_checks will be empty. Raw output may contain useful data for debugging.');
  }

  const lowerOutput = combinedOutput.toLowerCase();
  const reasons = [];

  const acceptanceCriteriaReferenced = structured.hasAcceptanceCriteriaChecks
    ? true
    : structured.hasAcceptanceCriteriaChecksHeader
      ? false
      : /acceptance criteria|acceptance_criteria/.test(lowerOutput);
  if (!acceptanceCriteriaReferenced) {
    reasons.push('Evaluator output is missing explicit acceptance-criteria verification.');
  }

  const epicRefRequired = !isAdHocEpic(epicRef);
  const epicRefLower = String(epicRef || '').trim().toLowerCase();
  const epicRefStem = epicRefLower.replace(/^.*\//, '').replace(/\.md$/, '');
  let epicRefReferenced = !epicRefRequired || !epicRefLower
    ? true
    : lowerOutput.includes(epicRefLower)
      || (epicRefStem && lowerOutput.includes(epicRefStem))
      || /(?:feature|epic)\s*(?:spec(?:ification)?|reference|file)|(?:verified|checked).{0,30}(?:feature|epic)/.test(lowerOutput);

  if (epicRefRequired && structured.hasFeatureReferenceCheck) {
    epicRefReferenced = structured.epicReferencePass === true;
  }

  if (epicRefRequired && !epicRefReferenced) {
    reasons.push(`Evaluator output is missing explicit epic spec verification for ${epicRef}. The eval agent must include an EPIC_REFERENCE_CHECK: PASS or FAIL line.`);
  }

  if (runState === 'failed') {
    if (runError) {
      reasons.unshift(`Evaluator run failed: ${runError}`);
    } else {
      reasons.unshift('Evaluator run failed before producing a passing decision.');
    }
    return {
      nextStatus: 'todo',
      verdict: 'fail',
      reasons,
      evalSummary: buildEvalSummary({
        verdict: 'fail',
        structured,
        timestamp: finishedAt,
        rawOutput: combinedOutput,
        reasons
      })
    };
  }

  // SMART VERDICT INFERENCE: Override explicit FAIL or missing verdict when all structured
  // components clearly show PASS. This handles cases where the eval agent correctly checks
  // everything but outputs EVALUATION_RESULT: FAIL incorrectly, or omits the header entirely.
  if (verdict !== 'pass' && structured.hasAcceptanceCriteriaChecks) {
    const allCriteriaPass = structured.criteriaChecks.length > 0 &&
      structured.criteriaChecks.every((check) => check.result === 'PASS');

    const featureCheckOk = !epicRefRequired || epicRefReferenced ||
      (structured.hasFeatureReferenceCheck && structured.epicReferencePass === true);

    if (allCriteriaPass && featureCheckOk) {
      return {
        nextStatus: 'review',
        verdict: 'pass',
        reasons: [],
        evalSummary: buildEvalSummary({
          verdict: 'pass',
          structured,
          timestamp: finishedAt,
          rawOutput: combinedOutput
        })
      };
    }
  }

  if (verdict === 'fail') {
    if (reasons.length === 0) {
      reasons.push('Evaluator returned FAIL verdict.');
    }
    return {
      nextStatus: 'todo',
      verdict: 'fail',
      reasons,
      evalSummary: buildEvalSummary({
        verdict: 'fail',
        structured,
        timestamp: finishedAt,
        rawOutput: combinedOutput,
        reasons
      })
    };
  }

  if (verdict === 'pass' && reasons.length === 0) {
    return {
      nextStatus: 'review',
      verdict: 'pass',
      reasons: [],
      evalSummary: buildEvalSummary({
        verdict: 'pass',
        structured,
        timestamp: finishedAt,
        rawOutput: combinedOutput
      })
    };
  }

  if (verdict !== 'pass') {
    reasons.unshift('Evaluator output is missing an explicit PASS verdict.');
  }

  return {
    nextStatus: 'todo',
    verdict: 'fail',
    reasons,
    evalSummary: buildEvalSummary({
        verdict: 'fail',
        structured,
        timestamp: finishedAt,
        rawOutput: combinedOutput,
        reasons
      })
  };
}

function formatEvaluationOutcomeNote({ previousStatus, verdict, reasons }) {
  if (previousStatus !== 'eval') return null;

  if (verdict === 'pass') {
    return 'Eval passed.';
  }

  if (verdict === 'fail') {
    const formattedReasons = Array.isArray(reasons) && reasons.length > 0
      ? reasons.map((reason) => `- ${reason}`).join('\n')
      : '';
    return formattedReasons ? `Eval failed.\n${formattedReasons}` : 'Eval failed.';
  }

  return null;
}

// --- Test phase parsing (mirrors eval but for unit tests / lint / type-check) ---

function extractTestVerdict(text) {
  const match = String(text || '').match(
    /\bTEST[_\s-]?RESULT\s*:\s*[*`_~\[(\s-]*(PASS|FAIL)[*`_~\])\s-]*/i
  );
  if (!match) return null;
  return match[1].toLowerCase() === 'pass' ? 'pass' : 'fail';
}

function parseStructuredTestOutput(outputText) {
  const text = String(outputText || '');
  if (!text.trim()) {
    return { hasStructuredVerdict: false, checks: [] };
  }

  const hasStructuredVerdict = !!extractTestVerdict(text);
  const checks = [];

  const checkLabels = ['UNIT_TESTS', 'LINT_CHECK', 'TYPE_CHECK'];
  for (const label of checkLabels) {
    const pattern = new RegExp(
      `\\b${label}\\s*:\\s*[*\`_~\\[(\\s-]*(PASS|FAIL)\\b[*\`_~\\])\\s-]*(?:\\s*\\|\\s*(.*))?`,
      'i'
    );
    const match = text.match(pattern);
    if (match) {
      checks.push({
        check_name: label,
        result: match[1].toUpperCase(),
        details: (match[2] || '').trim() || null
      });
    }
  }

  // Extract FAILURE_DETAILS if present
  const failureDetailsMatch = text.match(
    /\bFAILURE_DETAILS\s*:\s*([\s\S]*?)(?:\n\s*(?:TEST[_\s-]?RESULT|UNIT_TESTS|LINT_CHECK|TYPE_CHECK)\s*:|$)/i
  );
  const failureDetails = failureDetailsMatch
    ? failureDetailsMatch[1].trim()
    : null;

  return { hasStructuredVerdict, checks, failureDetails };
}

function buildTestSummary({ verdict, checks, timestamp, rawOutput }) {
  const normalizedVerdict = verdict === 'pass' ? 'PASS' : 'FAIL';
  const finalChecks = Array.isArray(checks) ? checks : [];
  const summary = {
    verdict: normalizedVerdict,
    checks: finalChecks,
    timestamp: timestamp || new Date().toISOString()
  };

  if (finalChecks.length === 0 && rawOutput && String(rawOutput).trim()) {
    const raw = String(rawOutput);
    summary.raw_excerpt = raw.length > 500 ? raw.slice(-500) : raw;
  }

  return summary;
}

function resolveTestOutcomeAfterRun({
  runState,
  currentStatus,
  stdout = '',
  stderr = '',
  runError = '',
  finishedAt = ''
}) {
  const nextStatus = resolveTicketStatusAfterRun({ runState, currentStatus });
  if (currentStatus !== 'test') {
    return { nextStatus, verdict: null, reasons: [], testSummary: null };
  }

  const rawCombined = `${stdout || ''}\n${stderr || ''}`;
  const combinedOutput = extractTextFromStreamJson(rawCombined);
  const verdict = extractTestVerdict(combinedOutput);
  const structured = parseStructuredTestOutput(combinedOutput);
  const reasons = [];

  if (runState === 'failed') {
    if (runError) {
      reasons.unshift(`Test run failed: ${runError}`);
    } else {
      reasons.unshift('Test run failed before producing a verdict.');
    }
    return {
      nextStatus: 'todo',
      verdict: 'fail',
      reasons,
      testSummary: buildTestSummary({
        verdict: 'fail',
        checks: structured.checks,
        timestamp: finishedAt,
        rawOutput: combinedOutput
      })
    };
  }

  if (verdict === 'pass') {
    return {
      nextStatus: 'eval',
      verdict: 'pass',
      reasons: [],
      testSummary: buildTestSummary({
        verdict: 'pass',
        checks: structured.checks,
        timestamp: finishedAt,
        rawOutput: combinedOutput
      })
    };
  }

  if (verdict === 'fail') {
    if (structured.failureDetails) {
      reasons.push(structured.failureDetails);
    } else {
      reasons.push('Test agent returned FAIL verdict.');
    }
    return {
      nextStatus: 'todo',
      verdict: 'fail',
      reasons,
      testSummary: buildTestSummary({
        verdict: 'fail',
        checks: structured.checks,
        timestamp: finishedAt,
        rawOutput: combinedOutput
      })
    };
  }

  // No explicit verdict found — fail closed
  reasons.unshift('Test output is missing an explicit TEST_RESULT: PASS verdict.');
  return {
    nextStatus: 'todo',
    verdict: 'fail',
    reasons,
    testSummary: buildTestSummary({
      verdict: 'fail',
      checks: structured.checks,
      timestamp: finishedAt,
      rawOutput: combinedOutput
    })
  };
}

function formatTestOutcomeNote({ previousStatus, verdict, reasons, testSummary }) {
  if (previousStatus !== 'test') return null;

  if (verdict === 'pass') {
    return 'Test passed.';
  }

  if (verdict === 'fail') {
    const parts = ['Test failed.'];

    // Include structured check results if available
    const checks = testSummary && Array.isArray(testSummary.checks) ? testSummary.checks : [];
    if (checks.length > 0) {
      parts.push('Checks:');
      for (const check of checks) {
        const line = check.details
          ? `- ${check.check_name}: ${check.result} | ${check.details}`
          : `- ${check.check_name}: ${check.result}`;
        parts.push(line);
      }
    }

    // Include failure reasons
    if (Array.isArray(reasons) && reasons.length > 0) {
      parts.push('Details:');
      for (const reason of reasons) {
        parts.push(`- ${reason}`);
      }
    }

    // Include raw excerpt if no checks were parsed
    if (checks.length === 0 && testSummary && testSummary.raw_excerpt) {
      parts.push('Output excerpt:');
      parts.push(testSummary.raw_excerpt);
    }

    return parts.join('\n');
  }

  return null;
}

module.exports = {
  resolveTicketStatusAfterRun,
  resolveEvalOutcomeAfterRun,
  resolveTestOutcomeAfterRun,
  formatEvaluationOutcomeNote,
  formatTestOutcomeNote,
  extractTextFromStreamJson
};
