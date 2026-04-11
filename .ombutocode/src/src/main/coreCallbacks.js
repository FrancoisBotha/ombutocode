'use strict';

const { resolveEvalOutcomeAfterRun, resolveTestOutcomeAfterRun, formatTestOutcomeNote, extractTextFromStreamJson } = require('./runLifecycle');
const { squashMergeTicketBranchSync, commitWorktreeChangesSync, branchHasCommitsAheadSync, removeWorktree } = require('./worktreeManager');
const { agentDisplayName } = require('./codingAgentRuntime');

/**
 * Create the agent runtime callbacks (onRunStarted, onRunUpdated, onRunFinished)
 * and the scheduler's onEvalPreparationFailed handler.
 *
 * These are shared between the Electron app (main.js) and headless mode (headless.js).
 *
 * @param {Object} deps
 * @param {Function} deps.appendAgentLog
 * @param {Function} deps.updateTicket
 * @param {Function} deps.buildRunOutputFilePaths
 * @param {Function} deps.writeRunOutputFiles
 * @param {Function} deps.removeRunOutputFile
 * @param {Map}      deps.runOutputFilesByRunId
 * @param {Function} deps.logSchedulerEvent
 * @param {Function} deps.appendTicketNote
 * @param {Function} deps.formatCommandLine
 * @param {Function} deps.shorten
 * @param {number}   deps.NOTE_OUTPUT_LIMIT
 * @param {Function} deps.summarizeSquashMergeFailure
 * @param {Function} deps.summarizeTrialMergeFailure
 * @param {Function} deps.readMaxEvalRetries - () => number
 * @param {string}   deps.projectRoot
 * @param {Function} [deps.onTitleBrandingUpdate] - optional Electron-only callback
 * @returns {Object}
 */
function createRuntimeCallbacks(deps) {
  const {
    appendAgentLog,
    updateTicket,
    buildRunOutputFilePaths,
    writeRunOutputFiles,
    removeRunOutputFile,
    runOutputFilesByRunId,
    logSchedulerEvent,
    appendTicketNote,
    formatCommandLine,
    shorten,
    NOTE_OUTPUT_LIMIT,
    summarizeSquashMergeFailure,
    summarizeTrialMergeFailure,
    readMaxEvalRetries,
    projectRoot,
    onTitleBrandingUpdate
  } = deps;

  // Resolved after scheduler is created (circular dependency)
  let scheduler = null;

  function setScheduler(s) {
    scheduler = s;
  }

  // --- onRunStarted ---
  function onRunStarted(run) {
    const displayName = agentDisplayName(run.agentName);
    const logPrefix = String(run.agentName || 'agent').toUpperCase();
    const commandLine = formatCommandLine(run.command, run.args);
    appendAgentLog({
      ts: new Date().toISOString(),
      event: 'run_started',
      agentName: run.agentName,
      runId: run.runId,
      ticketId: run.ticketId,
      state: run.state,
      pid: run.pid,
      command: run.command,
      args: run.args,
      commandLine,
      startedAt: run.startedAt
    });
    console.log(
      `[${logPrefix}] run_started runId=${run.runId} ticketId=${run.ticketId} pid=${run.pid || 'n/a'} command="${commandLine}"`
    );
    logSchedulerEvent('run.started', 'info', `Run started: ${run.agentName} on ${run.ticketId}`, { ticketId: run.ticketId, runId: run.runId, agentName: run.agentName, details: { pid: run.pid, commandLine } });
    const logPaths = buildRunOutputFilePaths(run);
    runOutputFilesByRunId.set(run.runId, logPaths);
    writeRunOutputFiles(logPaths, run);

    updateTicket(run.ticketId, (ticket) => {
      // Keep TEST, EVAL, and MERGING tickets in their status while runs are active.
      if (ticket.status === 'test') {
        // Keep test status while test agent runs
      } else if (ticket.status === 'eval') {
        // Keep eval status while evaluator runs
      } else if (ticket.status === 'merging') {
        // Keep merging status while merge agent runs
      } else {
        const prevStatus = ticket.status;
        ticket.status = 'in_progress';
        logSchedulerEvent('ticket.status_changed', 'info', `Ticket ${run.ticketId} status: ${prevStatus} → in_progress`, { ticketId: run.ticketId, runId: run.runId, agentName: run.agentName, details: { from: prevStatus, to: 'in_progress' } });
      }
      ticket.assignee = run.agentName;
      ticket.agent = {
        name: run.agentName,
        run_id: run.runId,
        state: run.state,
        started_at: run.startedAt,
        finished_at: null,
        duration_ms: null,
        pid: run.pid || null,
        signal: null,
        command: run.command,
        args: run.args,
        exit_code: null,
        stdout_tail: null,
        stderr_tail: null,
        stdout_log_file: logPaths.stdoutRelative,
        stderr_log_file: logPaths.stderrRelative,
        stdout_truncated: false,
        stderr_truncated: false,
        error: null
      };
      // Clear notes only on fresh implementation runs (no prior failures).
      // When retrying after failure, preserve existing notes so the agent
      // can see what went wrong in previous attempts.
      // Test, eval, and merge runs always append to keep the progression visible.
      if (ticket.status !== 'test' && ticket.status !== 'eval' && ticket.status !== 'merging') {
        const failCount = Number(ticket.fail_count) || 0;
        if (failCount === 0) {
          ticket.notes = '';
        }
      }
    });
  }

  // --- onRunUpdated ---
  function onRunUpdated(run) {
    const logPaths = runOutputFilesByRunId.get(run.runId);
    writeRunOutputFiles(logPaths, run);
  }

  // --- onRunFinished ---
  function onRunFinished(run) {
    const displayName = agentDisplayName(run.agentName);
    const logPrefix = String(run.agentName || 'agent').toUpperCase();
    const commandLine = formatCommandLine(run.command, run.args);
    const stdoutSummary = shorten(run.stdout, NOTE_OUTPUT_LIMIT);
    const stderrSummary = shorten(run.stderr, NOTE_OUTPUT_LIMIT);

    appendAgentLog({
      ts: new Date().toISOString(),
      event: 'run_finished',
      agentName: run.agentName,
      runId: run.runId,
      ticketId: run.ticketId,
      state: run.state,
      pid: run.pid,
      signal: run.signal,
      durationMs: run.durationMs,
      command: run.command,
      args: run.args,
      commandLine,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      exitCode: run.exitCode,
      error: run.error || null,
      stdout: run.stdout,
      stderr: run.stderr,
      stdoutTruncated: run.stdoutTruncated,
      stderrTruncated: run.stderrTruncated
    });

    console.log(
      `[${logPrefix}] run_finished runId=${run.runId} ticketId=${run.ticketId} state=${run.state} exit=${run.exitCode} signal=${run.signal || 'none'} durationMs=${run.durationMs}`
    );
    if (stdoutSummary) {
      console.log(`[${logPrefix}] stdout: ${stdoutSummary}`);
    }
    if (stderrSummary) {
      console.log(`[${logPrefix}] stderr: ${stderrSummary}`);
    }
    const logPaths = runOutputFilesByRunId.get(run.runId);
    writeRunOutputFiles(logPaths, run);
    let keepRunLogs = run.state !== 'completed';

    // Automatic git commit for successful implementation runs
    let implementationCommitted = false;
    if (!run.isEval && !run.isTest && run.state === 'completed' && run.exitCode === 0 && run.workingDirectory) {
      // Step 1: Try to commit any uncommitted changes
      try {
        const commitResult = commitWorktreeChangesSync(run.ticketId, {
          projectRoot,
          worktreePath: run.workingDirectory,
          commitMessage: `${run.ticketId}: Implementation changes`
        });

        if (commitResult.committed) {
          implementationCommitted = true;
          console.log(
            `[${logPrefix}] Auto-committed changes to ticket branch: ${commitResult.commitSha}`
          );
          logSchedulerEvent('autocommit.success', 'info', `Auto-committed changes: ${commitResult.commitSha}`, { ticketId: run.ticketId, runId: run.runId, agentName: run.agentName });
        }
      } catch (commitError) {
        console.error(
          `[${logPrefix}] Failed to auto-commit changes: ${commitError.message}`
        );
        logSchedulerEvent('autocommit.failure', 'warn', `Failed to auto-commit: ${commitError.message}`, { ticketId: run.ticketId, runId: run.runId, agentName: run.agentName });
      }

      // Step 2: If commit didn't produce a result (nothing to commit or commit threw),
      // always assume implementation exists and proceed to test phase.
      // The agent may have committed directly (Claude with --dangerously-skip-permissions),
      // and branchHasCommitsAheadSync has proven unreliable on Windows worktrees.
      // If the implementation is truly empty, the test/eval phase will catch it.
      if (!implementationCommitted) {
        implementationCommitted = true;
        console.log(
          `[${logPrefix}] No new changes to commit — assuming agent committed directly, proceeding to test phase`
        );
        logSchedulerEvent('autocommit.assumed', 'info', `No uncommitted changes but assuming agent committed directly`, { ticketId: run.ticketId, runId: run.runId, agentName: run.agentName });
      }
    }

    updateTicket(run.ticketId, (ticket) => {
      // Defense-in-depth: if this is NOT a test run but the ticket status is
      // 'test', the agent likely tampered with the live DB. Treat as 'in_progress'.
      // Similarly for eval status with non-eval runs.
      let effectiveStatus = ticket.status;
      if (!run.isTest && ticket.status === 'test') {
        effectiveStatus = 'in_progress';
      } else if (!run.isEval && ticket.status === 'eval') {
        effectiveStatus = 'in_progress';
      }
      if (effectiveStatus !== ticket.status) {
        console.warn(
          `[Scheduler] Status mismatch for ${run.ticketId}: DB says '${ticket.status}' but run type doesn't match. Using '${effectiveStatus}' to prevent misparse.`
        );
      }

      // Test-specific outcome handling (test → eval on pass, test → todo on fail)
      const previousStatus = ticket.status;
      if (previousStatus === 'test') {
        const testOutcome = resolveTestOutcomeAfterRun({
          runState: run.state,
          currentStatus: effectiveStatus,
          stdout: run.stdout,
          stderr: run.stderr,
          runError: run.error,
          finishedAt: run.finishedAt
        });

        ticket.status = testOutcome.nextStatus;
        logSchedulerEvent('ticket.status_changed', 'info', `Ticket ${ticket.id} status: ${previousStatus} → ${testOutcome.nextStatus}`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { from: previousStatus, to: testOutcome.nextStatus, trigger: 'test_outcome', verdict: testOutcome.verdict } });

        if (testOutcome.verdict === 'pass') {
          logSchedulerEvent('test.pass', 'info', `Test passed for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName });
          appendTicketNote(ticket, 'Test passed.');
        } else if (testOutcome.verdict === 'fail') {
          logSchedulerEvent('test.fail', 'warn', `Test failed for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName });
          if (typeof ticket.fail_count !== 'number') {
            ticket.fail_count = 0;
          }
          ticket.fail_count += 1;
          ticket.test_summary = testOutcome.testSummary;
          logSchedulerEvent('ticket.fail_count_incremented', 'warn', `Ticket ${ticket.id} test failure count: ${ticket.fail_count}`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { failCount: ticket.fail_count } });
          const maxRetries = readMaxEvalRetries();
          if (ticket.fail_count >= maxRetries) {
            ticket.assignee = 'NONE';
            console.log(`[Backlog] Ticket ${ticket.id} has failed ${ticket.fail_count} times (max: ${maxRetries}). Setting assignee to NONE to prevent automation pickup.`);
            logSchedulerEvent('ticket.max_retries_reached', 'error', `Ticket ${ticket.id} reached max retries (${ticket.fail_count}/${maxRetries}). Assignee set to NONE.`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { failCount: ticket.fail_count, maxRetries } });
            appendTicketNote(ticket, `Ticket halted: failed ${ticket.fail_count} times (max: ${maxRetries}). Requires manual intervention.`);
          }
          const testNote = formatTestOutcomeNote({
            previousStatus,
            verdict: testOutcome.verdict,
            reasons: testOutcome.reasons,
            testSummary: testOutcome.testSummary
          });
          if (testNote) {
            appendTicketNote(ticket, testNote);
          }
        }

        // Reset fail_count on test pass (ticket moving to eval)
        if (testOutcome.nextStatus === 'eval' && testOutcome.verdict === 'pass') {
          // Clear test_summary on pass — no longer needed for retry context
          ticket.test_summary = null;
        }

        const existingAgent = ticket.agent && typeof ticket.agent === 'object' ? ticket.agent : {};
        ticket.agent = {
          ...existingAgent,
          name: run.agentName,
          run_id: run.runId,
          state: run.state,
          started_at: run.startedAt || existingAgent.started_at || null,
          finished_at: run.finishedAt || null,
          duration_ms: run.durationMs,
          pid: run.pid || existingAgent.pid || null,
          signal: run.signal || null,
          command: run.command || existingAgent.command || null,
          args: run.args || existingAgent.args || [],
          exit_code: run.exitCode,
          stdout_tail: null,
          stderr_tail: null,
          stdout_log_file: keepRunLogs ? (logPaths?.stdoutRelative || existingAgent.stdout_log_file || null) : null,
          stderr_log_file: keepRunLogs ? (logPaths?.stderrRelative || existingAgent.stderr_log_file || null) : null,
          stdout_truncated: !!run.stdoutTruncated,
          stderr_truncated: !!run.stderrTruncated,
          error: run.error || null
        };

        if (run.state === 'completed') {
          logSchedulerEvent('run.finished', 'info', `Run completed: ${run.agentName} on ${run.ticketId} (exit=${run.exitCode})`, { ticketId: run.ticketId, runId: run.runId, agentName: run.agentName, details: { exitCode: run.exitCode, durationMs: run.durationMs } });
        } else {
          appendTicketNote(ticket, `Run crashed: ${run.error || 'unknown error'}`);
          logSchedulerEvent('run.failed', 'error', `Run failed: ${run.agentName} on ${run.ticketId}${run.error ? `: ${run.error}` : ''}`, { ticketId: run.ticketId, runId: run.runId, agentName: run.agentName, details: { exitCode: run.exitCode, error: run.error || null } });
        }
        return;
      }

      let evalOutcome = resolveEvalOutcomeAfterRun({
        runState: run.state,
        currentStatus: effectiveStatus,
        stdout: run.stdout,
        stderr: run.stderr,
        runError: run.error,
        epicRef: ticket.epic_ref,
        finishedAt: run.finishedAt
      });

      // Merging-specific outcome handling
      if (previousStatus === 'merging') {
        const existingAgent = ticket.agent && typeof ticket.agent === 'object' ? ticket.agent : {};
        let mergeResolved = false;

        if (run.state === 'completed' && run.exitCode === 0) {
          const rawOutput = `${run.stdout || ''}\n${run.stderr || ''}`;
          const plainText = extractTextFromStreamJson(rawOutput);
          const reportedSuccess = /MERGE_RESOLVE_RESULT:\s*SUCCESS/i.test(plainText);

          if (reportedSuccess) {
            const evalPassed = ticket.eval_summary?.verdict === 'PASS';

            if (evalPassed) {
              // Eval already passed — attempt squash merge before moving to review
              try {
                const mergeResult = squashMergeTicketBranchSync(ticket.id, {
                  projectRoot,
                  title: ticket.title
                });
                ticket.status = 'review';
                logSchedulerEvent('ticket.status_changed', 'info', `Ticket ${ticket.id} status: merging → review`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { from: 'merging', to: 'review', trigger: 'merge_resolve_squash_success' } });
                ticket.agent = {
                  ...existingAgent,
                  name: run.agentName,
                  run_id: run.runId,
                  state: 'completed',
                  finished_at: run.finishedAt || null,
                  duration_ms: run.durationMs,
                  exit_code: run.exitCode,
                  error: null
                };
                appendTicketNote(ticket, 'Merge resolved. Squash merge completed.');
                logSchedulerEvent('merge_resolve.success', 'info', `Merge resolve succeeded and squash merge completed for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId, details: { commitSha: mergeResult.commitSha } });
                scheduler.recordSquashMerge();
                removeWorktree(ticket.id, { projectRoot }).catch((err) => {
                  console.error(`[Scheduler] Failed to remove worktree for ${ticket.id}:`, err.message);
                });
                mergeResolved = true;
              } catch (mergeError) {
                // Squash merge still fails after resolve — back to merge_failed
                ticket.agent = {
                  ...existingAgent,
                  name: run.agentName,
                  run_id: run.runId,
                  state: 'merge_failed',
                  finished_at: run.finishedAt || null,
                  duration_ms: run.durationMs,
                  exit_code: run.exitCode,
                  error: null
                };
                keepRunLogs = true;
                appendTicketNote(ticket, `Merge resolved but squash merge still failed: ${mergeError?.message || 'unknown'}.`);
                logSchedulerEvent('merge_resolve.squash_failed', 'warn', `Merge resolve succeeded but squash merge still failed for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId });
              }
            } else {
              // Eval hasn't passed yet — send to eval (which will attempt merge after pass)
              ticket.status = 'eval';
              logSchedulerEvent('ticket.status_changed', 'info', `Ticket ${ticket.id} status: merging → eval`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { from: 'merging', to: 'eval', trigger: 'merge_resolve_needs_eval' } });
              ticket.agent = {
                ...existingAgent,
                name: run.agentName,
                run_id: run.runId,
                state: 'completed',
                finished_at: run.finishedAt || null,
                duration_ms: run.durationMs,
                exit_code: run.exitCode,
                error: null
              };
              appendTicketNote(ticket, 'Merge resolved. Queued for eval.');
              logSchedulerEvent('merge_resolve.success', 'info', `Merge resolve succeeded for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId });
              mergeResolved = true;
            }
          } else {
            // No SUCCESS marker — treat as merge_failed for retry
            ticket.agent = {
              ...existingAgent,
              name: run.agentName,
              run_id: run.runId,
              state: 'merge_failed',
              finished_at: run.finishedAt || null,
              duration_ms: run.durationMs,
              exit_code: run.exitCode,
              error: null
            };
            keepRunLogs = true;
            appendTicketNote(ticket, 'Merge resolve completed but agent did not report SUCCESS.');
            logSchedulerEvent('merge_resolve.aborted', 'warn', `Merge resolve aborted for ${ticket.id} (no SUCCESS marker)`, { ticketId: ticket.id, runId: run.runId });
          }
        } else {
          // Run crashed — treat as merge_failed for retry
          ticket.agent = {
            ...existingAgent,
            name: run.agentName,
            run_id: run.runId,
            state: 'merge_failed',
            finished_at: run.finishedAt || null,
            duration_ms: run.durationMs,
            exit_code: run.exitCode,
            error: run.error || null
          };
          keepRunLogs = true;
          appendTicketNote(ticket, `Merge resolve run failed (exit code ${run.exitCode}).`);
          logSchedulerEvent('merge_resolve.failed', 'warn', `Merge resolve failed for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId });
        }

        // Failed merge resolves: increment fail_count and enforce maxRetries
        if (!mergeResolved) {
          ticket.status = 'todo';
          logSchedulerEvent('ticket.status_changed', 'info', `Ticket ${ticket.id} status: merging → todo`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { from: 'merging', to: 'todo', trigger: 'merge_resolve_failed' } });
          if (typeof ticket.fail_count !== 'number') {
            ticket.fail_count = 0;
          }
          ticket.fail_count += 1;
          logSchedulerEvent('ticket.fail_count_incremented', 'warn', `Ticket ${ticket.id} merge failure count: ${ticket.fail_count}`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { failCount: ticket.fail_count } });
          const maxRetries = readMaxEvalRetries();
          if (ticket.fail_count >= maxRetries) {
            ticket.assignee = 'NONE';
            console.log(`[Backlog] Ticket ${ticket.id} has failed ${ticket.fail_count} times (max: ${maxRetries}). Setting assignee to NONE to prevent automation pickup.`);
            logSchedulerEvent('ticket.max_retries_reached', 'error', `Ticket ${ticket.id} reached max retries (${ticket.fail_count}/${maxRetries}). Assignee set to NONE.`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { failCount: ticket.fail_count, maxRetries } });
            appendTicketNote(ticket, `Ticket halted: failed ${ticket.fail_count} times (max: ${maxRetries}). Requires manual intervention.`);
          } else {
            console.log(`[Backlog] Ticket ${ticket.id} merge failure count: ${ticket.fail_count}/${maxRetries}`);
          }
        }
        return;
      }

      if (previousStatus === 'eval' && evalOutcome.nextStatus === 'review' && evalOutcome.verdict === 'pass') {
        logSchedulerEvent('eval.pass', 'info', `Eval passed for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName });
        try {
          const mergeResult = squashMergeTicketBranchSync(ticket.id, {
            projectRoot,
            title: ticket.title
          });
          appendTicketNote(ticket, 'Eval passed. Squash merge completed.');
          logSchedulerEvent('eval.squash_merge', 'info', `Squash merge completed: ${mergeResult.branch} -> ${mergeResult.baseBranch}`, { ticketId: ticket.id, runId: run.runId, details: { commitSha: mergeResult.commitSha } });
          scheduler.recordSquashMerge();
          removeWorktree(ticket.id, { projectRoot }).catch((err) => {
            console.error(`[Scheduler] Failed to remove worktree for ${ticket.id}:`, err.message);
          });
        } catch (error) {
          const isConflict = error?.details?.conflict === true;
          const mergeDetails = summarizeSquashMergeFailure(error);
          if (isConflict) {
            appendTicketNote(ticket, 'Eval passed but squash merge hit conflicts.');
            logSchedulerEvent('eval.squash_conflict', 'warn', `Squash merge conflict for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId });
          } else {
            appendTicketNote(ticket, 'Eval passed but squash merge failed. Manual merge required.');
          }
          if (isConflict) {
            evalOutcome = {
              nextStatus: 'todo',
              verdict: 'fail',
              evalSummary: {
                verdict: 'FAIL',
                criteria_checks: evalOutcome?.evalSummary?.criteria_checks || [],
                timestamp: run.finishedAt || new Date().toISOString()
              },
              reasons: [
                `Automatic squash merge failed due to conflicts: ${error?.message || 'unknown error'}`
              ]
            };
            ticket._mergeFailed = true;
          }
        }
      }

      // Note: the "no code changes" guard was removed. implementationCommitted is
      // always set to true after a successful run because agents (especially Claude
      // with --dangerously-skip-permissions) commit directly and branchHasCommitsAheadSync
      // proved unreliable on Windows worktrees. If the implementation is truly empty,
      // the test/eval phase will catch it.

      ticket.status = evalOutcome.nextStatus;
      if (previousStatus !== evalOutcome.nextStatus) {
        logSchedulerEvent('ticket.status_changed', 'info', `Ticket ${ticket.id} status: ${previousStatus} → ${evalOutcome.nextStatus}`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { from: previousStatus, to: evalOutcome.nextStatus, trigger: 'eval_outcome', verdict: evalOutcome.verdict || null } });
      }

      // Eval verdict note
      if (previousStatus === 'eval') {
        if (evalOutcome.verdict === 'pass' && evalOutcome.nextStatus === 'review') {
          appendTicketNote(ticket, 'Eval passed.');
        } else if (evalOutcome.verdict === 'fail' || evalOutcome.nextStatus === 'todo') {
          const reasons = Array.isArray(evalOutcome.reasons) && evalOutcome.reasons.length > 0
            ? evalOutcome.reasons.map(r => `- ${r}`).join('\n')
            : '';
          appendTicketNote(ticket, reasons ? `Eval failed.\n${reasons}` : 'Eval failed.');
          logSchedulerEvent('eval.fail', 'warn', `Eval failed for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName });
        }
      }

      // Track run failures and enforce max-retries limit.
      // A failure is either a process crash (run.state === 'failed') or an eval
      // verdict of FAIL that sends the ticket back to todo.
      const isRunFailure = run.state === 'failed' && evalOutcome.nextStatus === 'todo';
      const isEvalVerdictFailure = previousStatus === 'eval'
        && evalOutcome.nextStatus === 'todo'
        && evalOutcome.verdict !== 'pass';
      if (isRunFailure || isEvalVerdictFailure) {
        if (typeof ticket.fail_count !== 'number') {
          ticket.fail_count = 0;
        }
        if (typeof ticket.eval_fail_count !== 'number') {
          ticket.eval_fail_count = 0;
        }
        ticket.fail_count += 1;
        if (isEvalVerdictFailure) {
          ticket.eval_fail_count += 1;
          logSchedulerEvent('ticket.eval_fail_count_incremented', 'warn', `Ticket ${ticket.id} eval failure count: ${ticket.eval_fail_count}`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { evalFailCount: ticket.eval_fail_count } });
        }
        logSchedulerEvent('ticket.fail_count_incremented', 'warn', `Ticket ${ticket.id} failure count: ${ticket.fail_count}`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { failCount: ticket.fail_count } });
        const maxRetries = readMaxEvalRetries();
        if (ticket.fail_count >= maxRetries) {
          ticket.assignee = 'NONE';
          console.log(`[Backlog] Ticket ${ticket.id} has failed ${ticket.fail_count} times (max: ${maxRetries}). Setting assignee to NONE to prevent automation pickup.`);
          logSchedulerEvent('ticket.max_retries_reached', 'error', `Ticket ${ticket.id} reached max retries (${ticket.fail_count}/${maxRetries}). Assignee set to NONE.`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { failCount: ticket.fail_count, maxRetries } });
          appendTicketNote(ticket, `Ticket halted: failed ${ticket.fail_count} times (max: ${maxRetries}). Requires manual intervention.`);
        } else {
          console.log(`[Backlog] Ticket ${ticket.id} failure count: ${ticket.fail_count}/${maxRetries}`);
        }
      }

      // Reset fail_count only on eval pass (ticket moving to review), not on
      // any completed run — a completed run with verdict FAIL should not reset.
      if (previousStatus === 'eval' && evalOutcome.nextStatus === 'review' && evalOutcome.verdict === 'pass') {
        if (typeof ticket.fail_count === 'number' && ticket.fail_count > 0) {
          console.log(`[Backlog] Ticket ${ticket.id} eval passed. Resetting fail_count from ${ticket.fail_count} to 0.`);
          ticket.fail_count = 0;
        }
        if (typeof ticket.eval_fail_count === 'number' && ticket.eval_fail_count > 0) {
          ticket.eval_fail_count = 0;
        }
      }

      if (previousStatus === 'eval') {
        ticket.eval_summary = evalOutcome.evalSummary;

        if (evalOutcome.evalSummary && Array.isArray(ticket.acceptance_criteria) && Array.isArray(evalOutcome.evalSummary.criteria_checks)) {
          const checks = evalOutcome.evalSummary.criteria_checks;
          ticket.acceptance_criteria = ticket.acceptance_criteria.map((criterion) => {
            const clean = criterion.replace(/^\[[ x]\]\s*/, '');
            const match = checks.find((c) =>
              c.criterion && (
                c.criterion.toLowerCase().includes(clean.toLowerCase()) ||
                clean.toLowerCase().includes(c.criterion.toLowerCase())
              )
            );
            if (match) {
              return match.result === 'PASS' ? `[x] ${clean}` : `[ ] ${clean}`;
            }
            return clean;
          });
        }
      }

      const existingAgent = ticket.agent && typeof ticket.agent === 'object' ? ticket.agent : {};
      ticket.agent = {
        ...existingAgent,
        name: run.agentName,
        run_id: run.runId,
        state: run.state,
        started_at: run.startedAt || existingAgent.started_at || null,
        finished_at: run.finishedAt || null,
        duration_ms: run.durationMs,
        pid: run.pid || existingAgent.pid || null,
        signal: run.signal || null,
        command: run.command || existingAgent.command || null,
        args: run.args || existingAgent.args || [],
        exit_code: run.exitCode,
        stdout_tail: null,
        stderr_tail: null,
        stdout_log_file: keepRunLogs ? (logPaths?.stdoutRelative || existingAgent.stdout_log_file || null) : null,
        stderr_log_file: keepRunLogs ? (logPaths?.stderrRelative || existingAgent.stderr_log_file || null) : null,
        stdout_truncated: !!run.stdoutTruncated,
        stderr_truncated: !!run.stderrTruncated,
        error: run.error || null
      };

      if (ticket._mergeFailed) {
        ticket.agent.state = 'merge_failed';
        delete ticket._mergeFailed;
      }

      if (run.state === 'completed') {
        logSchedulerEvent('run.finished', 'info', `Run completed: ${run.agentName} on ${run.ticketId} (exit=${run.exitCode})`, { ticketId: run.ticketId, runId: run.runId, agentName: run.agentName, details: { exitCode: run.exitCode, durationMs: run.durationMs } });
      } else {
        appendTicketNote(ticket, `Run crashed: ${run.error || 'unknown error'}`);
        logSchedulerEvent('run.failed', 'error', `Run failed: ${run.agentName} on ${run.ticketId}${run.error ? `: ${run.error}` : ''}`, { ticketId: run.ticketId, runId: run.runId, agentName: run.agentName, details: { exitCode: run.exitCode, error: run.error || null } });
      }
    });

    if (keepRunLogs) {
      runOutputFilesByRunId.delete(run.runId);
    } else {
      removeRunOutputFile(logPaths?.stdoutPath);
      removeRunOutputFile(logPaths?.stderrPath);
      runOutputFilesByRunId.delete(run.runId);
    }

    // Trigger title bar branding update (Electron-only)
    if (onTitleBrandingUpdate && run.ticketId === 'KIMI_PICKUP-009' && run.state === 'completed' && run.exitCode === 0) {
      onTitleBrandingUpdate('Ombuto Code 3');
    }

    // Notify scheduler of run completion for cooldown tracking
    scheduler.onRunFinished(run);
  }

  // --- onEvalPreparationFailed factory ---
  function createOnEvalPreparationFailed() {
    return ({ ticketId, error }) => {
      const timestamp = new Date().toISOString();
      const isConflict = error?.details?.conflict === true;
      const rebaseAttempted = !!error?.rebaseAttempted;
      const detailLines = summarizeTrialMergeFailure(error);
      logSchedulerEvent('eval.preparation_failed', 'error', `Eval preparation failed for ${ticketId}: ${error?.message || error}`, { ticketId, details: { isConflict, rebaseAttempted } });

      updateTicket(ticketId, (ticket) => {
        const previousStatus = ticket.status;
        ticket.status = 'todo';
        logSchedulerEvent('ticket.status_changed', 'info', `Ticket ${ticketId} status: ${previousStatus} → todo`, { ticketId, details: { from: previousStatus, to: 'todo', trigger: 'eval_preparation_failed', isConflict, rebaseAttempted } });

        if (isConflict) {
          ticket.agent = {
            ...(ticket.agent || {}),
            state: 'merge_failed'
          };
        }

        if (rebaseAttempted) {
          appendTicketNote(ticket, 'Trial merge failed. Auto-rebase also failed.');
        } else if (isConflict) {
          appendTicketNote(ticket, 'Trial merge failed (merge conflict).');
        } else {
          appendTicketNote(ticket, 'Trial merge preparation failed.');
        }

        // Count trial merge failures toward the retry limit
        if (typeof ticket.fail_count !== 'number') {
          ticket.fail_count = 0;
        }
        ticket.fail_count += 1;
        logSchedulerEvent('ticket.fail_count_incremented', 'warn', `Ticket ${ticketId} failure count: ${ticket.fail_count} (trial merge)`, { ticketId, details: { failCount: ticket.fail_count } });
        const maxRetries = readMaxEvalRetries();
        if (ticket.fail_count >= maxRetries) {
          ticket.assignee = 'NONE';
          console.log(`[Backlog] Ticket ${ticketId} has failed ${ticket.fail_count} times (max: ${maxRetries}). Setting assignee to NONE to prevent automation pickup.`);
          logSchedulerEvent('ticket.max_retries_reached', 'error', `Ticket ${ticketId} reached max retries (${ticket.fail_count}/${maxRetries}). Assignee set to NONE.`, { ticketId, details: { failCount: ticket.fail_count, maxRetries } });
          appendTicketNote(ticket, `Ticket halted: failed ${ticket.fail_count} times (max: ${maxRetries}). Requires manual intervention.`);
        }
      });

      scheduler.dispatch({ reason: 'eval-preparation-failed' });
    };
  }

  return {
    onRunStarted,
    onRunUpdated,
    onRunFinished,
    setScheduler,
    createOnEvalPreparationFailed
  };
}

module.exports = { createRuntimeCallbacks };
