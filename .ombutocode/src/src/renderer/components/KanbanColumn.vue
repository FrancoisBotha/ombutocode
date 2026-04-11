<template>
  <div class="kanban-column" :data-column-id="columnId">
    <div class="column-header">
      <h3>{{ title }}</h3>
      <span class="task-count">{{ tasks.length }}</span>
    </div>

    <!-- Ticket Detail Modal -->
    <div v-if="selectedTask" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Ticket Details</h2>
        </div>
        <div class="modal-body">
          <div class="detail-row">
            <span class="detail-label">ID:</span>
            <span class="detail-value">{{ selectedTask.id }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Title:</span>
            <span class="detail-value">{{ getTicketTitle(selectedTask) }}</span>
          </div>
          <div class="detail-row" v-if="selectedTask.description">
            <span class="detail-label">Description:</span>
            <span class="detail-value">{{ selectedTask.description }}</span>
          </div>
          <div class="detail-row" v-if="selectedTask.epic_ref">
            <span class="detail-label">Feature Reference:</span>
            <span class="detail-value">{{ selectedTask.epic_ref }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Status:</span>
            <span class="detail-value status-badge" :class="selectedTask.status">{{ selectedTask.status }}</span>
          </div>
          <div class="detail-row" v-if="selectedTask.assignee">
            <span class="detail-label">Assignee:</span>
            <span class="detail-value">
              <span v-if="isHumanAssigned(selectedTask)" class="human-badge">Human</span>
              <span v-else>{{ formatAssignee(selectedTask.assignee) }}</span>
            </span>
          </div>
          <div class="detail-row" v-if="selectedTask.last_updated">
            <span class="detail-label">Last Updated:</span>
            <span class="detail-value">{{ formatDate(selectedTask.last_updated) }}</span>
          </div>
          <div class="detail-row" v-if="selectedTask.agent?.run_id">
            <span class="detail-label">Agent Run ID:</span>
            <span class="detail-value">{{ selectedTask.agent.run_id }}</span>
          </div>
          <div class="detail-row" v-if="selectedTask.agent?.state">
            <span class="detail-label">Agent State:</span>
            <span class="detail-value">
              <span class="agent-state-badge" :class="getAgentStateBadgeClass(selectedTask, false)">{{ getAgentStateLabel(selectedTask) }}</span>
            </span>
          </div>
          <div class="detail-row" v-if="selectedTask.agent?.started_at">
            <span class="detail-label">Agent Started:</span>
            <span class="detail-value">{{ formatDate(selectedTask.agent.started_at) }}</span>
          </div>
          <div class="detail-row" v-if="selectedTask.agent?.finished_at">
            <span class="detail-label">Agent Finished:</span>
            <span class="detail-value">{{ formatDate(selectedTask.agent.finished_at) }}</span>
          </div>
          <div class="detail-row" v-if="selectedTask.agent?.exit_code !== null && selectedTask.agent?.exit_code !== undefined">
            <span class="detail-label">Agent Exit Code:</span>
            <span class="detail-value">{{ selectedTask.agent.exit_code }}</span>
          </div>
          <div class="detail-row" v-if="selectedTask.agent?.error">
            <span class="detail-label">Agent Error:</span>
            <span class="detail-value">{{ selectedTask.agent.error }}</span>
          </div>
          <div class="detail-row" v-if="selectedTask.dependencies?.length">
            <span class="detail-label">Dependencies:</span>
            <ul class="detail-list">
              <li v-for="dep in selectedTask.dependencies" :key="dep">{{ dep }}</li>
            </ul>
          </div>
          <div class="detail-row" v-if="selectedTask.acceptance_criteria?.length">
            <span class="detail-label">Acceptance Criteria:</span>
            <ul class="detail-list">
              <li v-for="(criteria, idx) in selectedTask.acceptance_criteria" :key="idx">
                <label v-if="isHumanAssigned(selectedTask)" class="criterion-check">
                  <input
                    type="checkbox"
                    :checked="isCriterionChecked(selectedTask, idx)"
                    @change="toggleCriterion(selectedTask, idx)"
                  />
                  <span :class="{ 'criterion-done': isCriterionChecked(selectedTask, idx) }">{{ criteria }}</span>
                </label>
                <span v-else>{{ criteria }}</span>
              </li>
            </ul>
          </div>
          <div class="detail-row eval-summary-row" v-if="hasEvalSummary(selectedTask)">
            <div class="eval-summary-header">
              <span class="detail-label">Evaluation Summary:</span>
              <span class="eval-verdict-badge" :class="getEvalVerdictBadgeClass(selectedTask)">
                {{ getEvalVerdict(selectedTask) }}
              </span>
            </div>
            <p v-if="selectedTask.eval_summary?.timestamp" class="eval-summary-timestamp">
              {{ formatEvalSummaryTimestamp(selectedTask.eval_summary.timestamp) }}
            </p>
            <p v-if="!hasEvalCriteriaChecks(selectedTask)" class="eval-summary-empty">
              No per-criterion details available.
            </p>
            <ul v-else class="eval-checklist">
              <li v-for="(check, idx) in getEvalCriteriaChecks(selectedTask)" :key="`${check.criterion || 'criterion'}-${idx}`" class="eval-check-item">
                <div class="eval-check-main">
                  <span class="mdi" :class="getEvalCheckIconClass(check)"></span>
                  <span class="eval-check-criterion">{{ check.criterion || 'Unnamed criterion' }}</span>
                </div>
                <p v-if="isEvalCheckFail(check) && check.failure_reason" class="eval-check-reason">
                  <strong>Reason:</strong> {{ check.failure_reason }}
                </p>
                <p v-if="isEvalCheckFail(check) && check.suggestion" class="eval-check-suggestion">
                  <strong>Suggestion:</strong> {{ check.suggestion }}
                </p>
              </li>
            </ul>
            <div v-if="selectedTask.eval_summary?.epic_reference_check" class="eval-epic-ref-check">
              <span class="mdi" :class="selectedTask.eval_summary.epic_reference_check === 'PASS' ? 'mdi-check-circle eval-pass-icon' : (selectedTask.eval_summary.epic_reference_check === 'FAIL' ? 'mdi-close-circle eval-fail-icon' : 'mdi-help-circle eval-unknown-icon')"></span>
              <span>Epic Reference Check: <strong>{{ selectedTask.eval_summary.epic_reference_check }}</strong></span>
            </div>
            <div v-if="selectedTask.eval_summary?.failure_reasons?.length" class="eval-failure-reasons">
              <span class="detail-label">Failure Reasons:</span>
              <ul class="eval-failure-list">
                <li v-for="(reason, idx) in selectedTask.eval_summary.failure_reasons" :key="idx">{{ reason }}</li>
              </ul>
            </div>
          </div>
          <div class="detail-row" v-if="hasFailureCounts(selectedTask)">
            <span class="detail-label">Failure Counts:</span>
            <div class="detail-value failure-counts-container">
              <span v-if="selectedTask.fail_count > 0" class="failure-count-item">
                <span class="failure-count-label">Retries:</span>
                <span class="failure-count-value">{{ selectedTask.fail_count }}</span>
              </span>
              <span v-if="selectedTask.eval_fail_count > 0" class="failure-count-item">
                <span class="failure-count-label">Eval Failures:</span>
                <span class="failure-count-value">{{ selectedTask.eval_fail_count }}</span>
              </span>
            </div>
          </div>
          <div class="detail-row" v-if="selectedTask.files_touched?.length">
            <span class="detail-label">Files Touched:</span>
            <ul class="detail-list files-list">
              <li v-for="file in selectedTask.files_touched" :key="file">{{ file }}</li>
            </ul>
          </div>
          <div class="detail-row" v-if="selectedTask.notes">
            <span class="detail-label">Notes:</span>
            <span class="detail-value notes">{{ selectedTask.notes }}</span>
          </div>
        </div>
        <div class="modal-footer">
          <button
            v-if="isHumanAssigned(selectedTask) && (selectedTask.status === 'todo' || selectedTask.status === 'in_progress')"
            class="btn btn-success"
            @click="moveHumanToReview(selectedTask.id)"
          >
            <span class="mdi mdi-check-bold"></span> Move to Review
          </button>
          <button class="btn btn-primary" @click="closeModal">OK</button>
        </div>
      </div>
    </div>

    <!-- Reject Ticket Modal -->
    <div v-if="showRejectModal" class="modal-overlay" @click.self="closeRejectModal">
      <div class="modal-content reject-modal">
        <div class="modal-header">
          <h2>Reject Ticket</h2>
        </div>
        <div class="modal-body">
          <p class="reject-help-text">Add a short rejection comment. The ticket will move back to TODO.</p>
          <textarea
            v-model="rejectComment"
            class="reject-comment-input"
            rows="4"
            placeholder="What needs to be changed?"
          />
          <p v-if="rejectError" class="reject-error">{{ rejectError }}</p>
        </div>
        <div class="modal-footer reject-footer">
          <button class="btn btn-secondary" :disabled="rejectingId !== null" @click="closeRejectModal">Cancel</button>
          <button
            class="btn btn-danger"
            :disabled="rejectingId !== null || !rejectComment.trim()"
            @click="confirmRejectTicket"
          >
            {{ rejectingId ? 'Rejecting...' : 'Reject' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Console Dialog Modal -->
    <div v-if="showConsoleDialog" class="modal-overlay" @click.self="closeConsoleDialog">
      <div class="modal-content console-modal">
        <div class="modal-header">
          <h2>Agent Console: {{ consoleTicket?.id }}</h2>
          <span class="console-status-badge" :class="'is-' + (consoleTicket?.agent?.state || 'unknown')">
            {{ consoleTicket?.agent?.state || 'unknown' }}
          </span>
        </div>
        <div class="modal-body console-body">
          <!-- Live indicator -->
          <div v-if="isConsoleTicketRunning" class="console-live-indicator">
            <span class="live-dot"></span>
            <span class="live-text">Live - Refreshing</span>
          </div>

          <!-- Stdout Section - PRIORITIZED AT TOP -->
          <div class="console-section console-section-primary">
            <div class="console-section-header">
              <span class="console-section-title">Agent Output</span>
            </div>
            <div class="console-output console-output-primary">
              <pre v-if="consolePrimaryOutput" class="formatted-output">{{ formatConsolePrimaryOutput }}</pre>
              <p v-if="consolePrimaryOutputTruncated" class="console-truncated-note">Showing latest output tail</p>
              <p v-if="isPrimaryOutputMirroredFromStderr" class="console-truncated-note">
                Primary output is mirrored from stderr for this run.
              </p>
              <p v-else class="console-empty">No output available</p>
            </div>
          </div>

          <!-- Current Activity -->
          <div class="console-section console-section-compact">
            <div class="console-section-header">
              <span class="console-section-title">Current Activity</span>
            </div>
            <div class="console-activity">
              <p class="console-activity-line">{{ currentActivityLine }}</p>
              <ul v-if="recentRunNotes.length" class="console-activity-notes">
                <li v-for="(line, idx) in recentRunNotes" :key="idx">{{ line }}</li>
              </ul>
            </div>
          </div>

          <!-- Run Metadata -->
          <div class="console-section console-section-compact">
            <div class="console-metadata">
              <div class="metadata-row" v-if="consoleTicket?.agent?.run_id">
                <span class="metadata-label">Run ID:</span>
                <span class="metadata-value">{{ consoleTicket.agent.run_id }}</span>
              </div>
              <div class="metadata-row" v-if="consoleTicket?.agent?.started_at">
                <span class="metadata-label">Started:</span>
                <span class="metadata-value">{{ formatDate(consoleTicket.agent.started_at) }}</span>
              </div>
              <div class="metadata-row" v-if="consoleTicket?.agent?.finished_at">
                <span class="metadata-label">Finished:</span>
                <span class="metadata-value">{{ formatDate(consoleTicket.agent.finished_at) }}</span>
              </div>
              <div class="metadata-row" v-if="consoleTicket?.agent?.pid">
                <span class="metadata-label">PID:</span>
                <span class="metadata-value">{{ consoleTicket.agent.pid }}</span>
              </div>
              <div class="metadata-row" v-if="consoleTicket?.agent?.exit_code !== null && consoleTicket?.agent?.exit_code !== undefined">
                <span class="metadata-label">Exit Code:</span>
                <span class="metadata-value" :class="{ 'exit-success': consoleTicket.agent.exit_code === 0, 'exit-error': consoleTicket.agent.exit_code !== 0 }">
                  {{ consoleTicket.agent.exit_code }}
                </span>
              </div>
              <div class="metadata-row" v-if="consoleTicket?.agent?.name">
                <span class="metadata-label">Agent:</span>
                <span class="metadata-value">{{ consoleTicket.agent.name }}</span>
              </div>
            </div>
          </div>

          <!-- Stderr Section -->
          <div class="console-section console-section-compact">
            <div class="console-section-header">
              <span class="console-section-title">Diagnostics (stderr)</span>
            </div>
            <div class="console-output console-error">
              <pre v-if="consoleStderr">{{ consoleStderr }}</pre>
              <p v-if="consoleStderrTruncated" class="console-truncated-note">Showing latest diagnostics tail</p>
              <pre v-else-if="consoleTicket?.agent?.stderr_tail">{{ consoleTicket.agent.stderr_tail }}</pre>
              <pre v-else-if="consoleTicket?.agent?.stderr">{{ consoleTicket.agent.stderr }}</pre>
              <p v-else class="console-empty">No diagnostics available</p>
            </div>
          </div>

          <!-- Error message if any -->
          <div v-if="consoleTicket?.agent?.error" class="console-section console-section-compact">
            <div class="console-section-header">
              <span class="console-section-title">Error</span>
            </div>
            <div class="console-output console-error">
              <pre>{{ consoleTicket.agent.error }}</pre>
            </div>
          </div>

          <!-- Missing metadata message -->
          <div v-if="!hasAgentMetadata(consoleTicket)" class="console-no-data">
            <p>No run metadata available for this ticket.</p>
            <p class="console-hint">The agent may not have started yet, or the data is not available.</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="closeConsoleDialog">Close</button>
        </div>
      </div>
    </div>

    <div class="task-list">
      <div
        v-for="task in tasks"
        :key="task.id"
        class="task-card"
      >
        <div class="task-actions">
          <span v-if="getDependencyCount(task) > 0" class="dependency-badge">
            {{ getDependencyCount(task) }} deps
          </span>
          <button
            v-if="columnId === 'todo'"
            class="start-btn"
            :class="{ 'start-btn-disabled-dependency': getUnmetDependencies(task).length > 0 }"
            :disabled="isStartDisabled(task)"
            @click.stop="startAssignedTicket(task.id)"
            :title="getStartButtonTooltip(task)"
          >
            {{ getStartButtonLabel(task) }}
          </button>
          <button
            v-if="columnId === 'todo'"
            class="remove-btn"
            :disabled="isTodoRemoveDisabled(task)"
            @click.stop="removeTodoToBacklog(task.id)"
            title="Remove — move back to Backlog"
          >
            Remove
          </button>
          <button
            v-if="columnId === 'in_progress' && isProcessStale(task)"
            class="stale-badge"
            disabled
            title="Process is no longer running"
          >
            <span class="mdi mdi-alert-circle"></span>
            Stale
          </button>
          <button
            v-if="columnId === 'in_progress'"
            class="cancel-btn"
            :disabled="cancellingId === task.id"
            @click.stop="cancelRunningTicket(task.id)"
            title="Cancel running agent and reset to TODO"
          >
            {{ cancellingId === task.id ? 'Cancelling...' : 'Cancel' }}
          </button>
          <button
            v-if="columnId === 'eval'"
            class="skip-eval-btn"
            :disabled="isEvalSkipDisabled(task)"
            @click.stop="skipEvalToReview(task.id)"
            title="Skip eval — move to Review"
          >
            Skip
          </button>
          <div v-if="columnId === 'review'" class="review-actions">
            <button
              class="approve-btn"
              :disabled="isReviewActionDisabled(task)"
              @click.stop="approveTicket(task.id)"
              title="Approve — move to Done"
            >
              <span class="mdi mdi-check"></span>
            </button>
            <button
              class="reject-btn"
              :disabled="isReviewActionDisabled(task)"
              @click.stop="rejectTicket(task.id)"
              title="Reject — move back to TODO with comment"
            >
              <span class="mdi mdi-close"></span>
            </button>
          </div>
          <button
            v-if="columnId === 'done'"
            class="archive-btn"
            :disabled="archivingId === task.id"
            @click.stop="archiveTicket(task.id)"
            title="Archive ticket"
          >
            <span class="mdi mdi-archive-arrow-down"></span>
          </button>
        </div>
        <div class="task-main">
          <div class="task-title">{{ getTicketTitle(task) }}</div>
          <div class="task-id">{{ task.id }}</div>
          <div v-if="hasAssignee(task)" class="task-assignee">
            <span class="task-assignee-label">Assignee:</span>
            <span class="task-assignee-value">{{ formatAssignee(task.assignee) }}</span>
          </div>
          <div v-if="columnId === 'todo'" class="todo-agent-row">
            <label class="todo-agent-label" :for="`agent-select-${task.id}`">Agent:</label>
            <select
              :id="`agent-select-${task.id}`"
              class="todo-agent-select"
              :value="getAssignedAgentValue(task)"
              @click.stop
              @change.stop="updateAssignedAgent(task.id, $event.target.value)"
            >
              <option value="__none__">None</option>
              <option value="">-- Select --</option>
              <option value="human">Human</option>
              <optgroup label="Legacy Agents">
                <option value="kimi">Kimi</option>
                <option value="codex">Codex</option>
                <option value="claude">Claude</option>
              </optgroup>
              <optgroup 
                v-for="tool in agentToolsStore.tools.filter(t => t.enabled)" 
                :key="tool.id" 
                :label="tool.name"
              >
                <option 
                  v-for="model in tool.models.filter(m => m.enabled)" 
                  :key="model.id" 
                  :value="`${tool.id}:${model.id}`"
                >
                  {{ model.name }}
                </option>
              </optgroup>
            </select>
          </div>
          <div v-if="task.agent?.state" class="task-agent-state">
            <span
              class="agent-state-badge"
              :class="getAgentStateBadgeClass(task)"
              @click.stop="task.agent.state === 'running' ? openConsoleDialog(task) : null"
            >{{ getAgentStateLabel(task) }}</span>
          </div>
          <!-- Evaluator ownership display in EVAL column -->
          <div v-if="columnId === 'eval' && shouldShowEvaluator(task)" class="task-evaluator">
            <span class="task-evaluator-label">Evaluator:</span>
            <span class="task-evaluator-value">{{ task.agent.name }}</span>
          </div>
          <div v-else-if="columnId === 'eval'" class="task-evaluator task-evaluator--pending">
            <span class="task-evaluator-value">Awaiting evaluation</span>
          </div>
          <!-- Merge agent display in MERGING column -->
          <div v-if="columnId === 'merging' && shouldShowMergeAgent(task)" class="task-evaluator">
            <span class="task-evaluator-label">Merge Agent:</span>
            <span class="task-evaluator-value">{{ task.agent.name }}</span>
          </div>
          <div v-else-if="columnId === 'merging'" class="task-evaluator task-evaluator--pending">
            <span class="task-evaluator-value">Awaiting merge resolve</span>
          </div>
          <!-- Failed evaluation badge for tickets returned to todo -->
          <div v-if="columnId === 'todo' && isEvalFailure(task)" class="task-eval-failed-badge">
            <span class="mdi mdi-alert-circle"></span>
            <span>Eval failed</span>
          </div>
        </div>
        <!-- AD_HOC-032: Dependency error message display -->
        <div v-if="startErrorTicketId === task.id && startErrorMessage" class="start-error-message">
          <span class="mdi mdi-alert-circle"></span>
          <span class="error-text">{{ startErrorMessage }}</span>
        </div>
        <button
          class="info-btn"
          @click.stop="openTaskDetail(task)"
          title="View ticket details"
        >
          <span class="info-icon">i</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useBacklogStore } from '@/stores/backlogStore';
import { useAgentToolsStore } from '@/stores/agentToolsStore';

export default {
  name: 'KanbanColumn',
  props: {
    title: {
      type: String,
      required: true
    },
    tasks: {
      type: Array,
      default: () => []
    },
    columnId: {
      type: String,
      required: true
    }
  },
  setup(props) {
    const backlogStore = useBacklogStore();
    const agentToolsStore = useAgentToolsStore();
    const pickingUpId = ref(null);
    const approvingId = ref(null);
    const rejectingId = ref(null);
    const skippingEvalId = ref(null);
    const removingTodoId = ref(null);
    const archivingId = ref(null);
    const cancellingId = ref(null);
    const staleProcesses = ref(new Map());
    const selectedTask = ref(null);
    const showRejectModal = ref(false);
    const rejectTargetId = ref(null);
    const rejectComment = ref('');
    const rejectError = ref('');
    const showConsoleDialog = ref(false);
    const consoleTicket = ref(null);
    const consoleRefreshInterval = ref(null);
    const consoleStdout = ref('');
    const consoleStderr = ref('');
    const consoleStdoutTruncated = ref(false);
    const consoleStderrTruncated = ref(false);
    const isConsoleTicketRunning = computed(() => consoleTicket.value?.agent?.state === 'running');
    const rawStdout = computed(() => (
      consoleStdout.value ||
      consoleTicket.value?.agent?.stdout_tail ||
      consoleTicket.value?.agent?.stdout ||
      ''
    ));
    const rawStderr = computed(() => (
      consoleStderr.value ||
      consoleTicket.value?.agent?.stderr_tail ||
      consoleTicket.value?.agent?.stderr ||
      ''
    ));
    const isPrimaryOutputMirroredFromStderr = computed(() => !rawStdout.value && !!rawStderr.value);
    const consolePrimaryOutput = computed(() => rawStdout.value || rawStderr.value || '');
    const consolePrimaryOutputTruncated = computed(() => (
      rawStdout.value
        ? consoleStdoutTruncated.value
        : (isPrimaryOutputMirroredFromStderr.value && consoleStderrTruncated.value)
    ));

    // Parse stream-json output to show only relevant content
    function summarizeToolInput(name, input) {
      if (!input) return '';
      if (name === 'Bash' && input.command) {
        const cmd = input.command.length > 120 ? input.command.slice(0, 120) + '...' : input.command;
        return cmd;
      }
      if ((name === 'Read' || name === 'Write' || name === 'Edit') && input.file_path) {
        return input.file_path;
      }
      if ((name === 'Glob' || name === 'Grep') && input.pattern) {
        return input.pattern;
      }
      if (name === 'WebFetch' && input.url) return input.url;
      if (name === 'Task' && input.description) return input.description;
      // Fallback: show first string-valued param
      for (const [, v] of Object.entries(input)) {
        if (typeof v === 'string' && v.length > 0) {
          return v.length > 80 ? v.slice(0, 80) + '...' : v;
        }
      }
      return '';
    }

    function extractToolResultText(content) {
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .filter((b) => b?.type === 'text' && b.text)
          .map((b) => b.text)
          .join('\n');
      }
      if (typeof content === 'object' && content?.text) return content.text;
      return '';
    }

    function truncateBlock(text, max) {
      if (!text || text.length <= max) return text;
      return text.slice(0, max) + `\n... (${text.length - max} chars truncated)`;
    }

    function extractContentItems(contents, output) {
      if (!Array.isArray(contents)) return;
      for (const item of contents) {
        if (item.type === 'text' && item.text) {
          output.push(truncateBlock(item.text, 1000));
        } else if (item.type === 'tool_use') {
          const summary = summarizeToolInput(item.name, item.input);
          output.push(`▶ ${item.name}${summary ? ': ' + summary : ''}`);
        } else if (item.type === 'tool_result') {
          const resultText = extractToolResultText(item.content);
          if (resultText) {
            output.push(`  ⇒ ${truncateBlock(resultText, 300)}`);
          }
        }
      }
    }

    const formatConsolePrimaryOutput = computed(() => {
      const raw = consolePrimaryOutput.value;
      if (!raw) return '';

      try {
        const lines = raw.split('\n');
        const output = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (!trimmed.startsWith('{')) {
            output.push(line);
            continue;
          }

          let parsed;
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            output.push(line);
            continue;
          }

          // Skip system/init and metadata-only messages
          if (parsed.type === 'system') continue;

          // Handle assistant messages (text + tool_use)
          if (parsed.type === 'assistant' && parsed.message?.content) {
            extractContentItems(parsed.message.content, output);
            continue;
          }

          // Handle user messages (tool_result responses)
          if (parsed.type === 'user' && parsed.message?.content) {
            extractContentItems(parsed.message.content, output);
            continue;
          }

          // Handle result messages
          if (parsed.type === 'result' && parsed.result) {
            output.push(parsed.result);
            continue;
          }

          // Handle content_block_delta (streaming)
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            output.push(parsed.delta.text);
            continue;
          }

          // Skip unrecognized JSON objects (usage, session metadata, etc.)
        }

        return output.join('\n');
      } catch {
        return raw;
      }
    });

    const recentRunNotes = computed(() => {
      const notes = String(consoleTicket.value?.notes || '').trim();
      if (!notes) return [];

      const lines = notes
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      return lines.slice(-5);
    });

    const lastNonEmptyOutputLine = (value) => {
      const text = String(value || '').trim();
      if (!text) return '';
      const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
      return lines.length ? lines[lines.length - 1] : '';
    };

    const currentActivityLine = computed(() => {
      const state = consoleTicket.value?.agent?.state || 'unknown';
      const stdoutLine = lastNonEmptyOutputLine(consoleStdout.value || consoleTicket.value?.agent?.stdout_tail || consoleTicket.value?.agent?.stdout || '');
      const stderrLine = lastNonEmptyOutputLine(consoleStderr.value || consoleTicket.value?.agent?.stderr_tail || consoleTicket.value?.agent?.stderr || '');

      const recentNote = recentRunNotes.value.length
        ? recentRunNotes.value[recentRunNotes.value.length - 1]
        : '';

      if (state === 'running' && stdoutLine) {
        return `Running: ${stdoutLine}`;
      }
      if (state === 'running' && stderrLine) {
        return `Running (diagnostics): ${stderrLine}`;
      }
      if (recentNote) return recentNote;
      if (state === 'running') return 'Running. Waiting for output...';
      if (state === 'queued') return 'Queued. Waiting to start...';
      if (state === 'completed') return 'Run completed.';
      if (state === 'merge_failed') return 'Merge conflict detected. Awaiting merge resolve.';
      if (state === 'merge_aborted') return 'Merge resolution failed. Ticket unassigned from automation.';
      if (state === 'failed') return `Run failed${consoleTicket.value?.agent?.error ? `: ${consoleTicket.value.agent.error}` : '.'}`;
      return 'No runtime activity available.';
    });

    const openTaskDetail = (task) => {
      selectedTask.value = task;
    };

    const closeModal = () => {
      selectedTask.value = null;
    };

    const closeRejectModal = () => {
      if (rejectingId.value) return;
      showRejectModal.value = false;
      rejectTargetId.value = null;
      rejectComment.value = '';
      rejectError.value = '';
    };

    const formatDate = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleString();
    };

    const getEvalSummary = (task) => {
      const summary = task?.eval_summary;
      if (!summary || typeof summary !== 'object') return null;
      const verdict = String(summary.verdict || '').toUpperCase();
      if (verdict !== 'PASS' && verdict !== 'FAIL') return null;
      return summary;
    };

    const hasEvalSummary = (task) => !!getEvalSummary(task);

    const getEvalVerdict = (task) => String(getEvalSummary(task)?.verdict || '').toUpperCase();

    const isEvalFailure = (task) => getEvalVerdict(task) === 'FAIL';

    const getEvalVerdictBadgeClass = (task) => (
      getEvalVerdict(task) === 'PASS' ? 'is-pass' : 'is-fail'
    );

    const formatEvalSummaryTimestamp = (timestamp) => {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return String(timestamp);
      const formatted = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC'
      }).format(date);
      return `${formatted} UTC`;
    };

    const getEvalCriteriaChecks = (task) => {
      const checks = getEvalSummary(task)?.criteria_checks;
      return Array.isArray(checks) ? checks : [];
    };

    const hasEvalCriteriaChecks = (task) => getEvalCriteriaChecks(task).length > 0;

    const getEvalCheckResult = (check) => String(check?.result || '').toUpperCase();

    const isEvalCheckFail = (check) => getEvalCheckResult(check) === 'FAIL';

    const getEvalCheckIconClass = (check) => (
      getEvalCheckResult(check) === 'PASS'
        ? 'mdi-check-circle eval-check-icon-pass'
        : 'mdi-close-circle eval-check-icon-fail'
    );

    const hasFailureCounts = (task) => {
      const failCount = Number(task?.fail_count ?? 0);
      const evalFailCount = Number(task?.eval_fail_count ?? 0);
      return failCount > 0 || evalFailCount > 0;
    };

    const getTicketTitle = (task) => {
      if (!task) return '';
      if (typeof task.title === 'string' && task.title.trim()) return task.title;
      if (typeof task.text === 'string' && task.text.trim()) {
        return task.text.split(/\r?\n/)[0];
      }
      return '';
    };

    const getDependencyCount = (task) => {
      if (!task || !Array.isArray(task.dependencies)) return 0;
      return task.dependencies.length;
    };

    const getAssignedAgent = (task) => {
      const assignee = task?.assignee;
      if (assignee && typeof assignee === 'object') {
        const tool = String(assignee.tool || '').trim().toLowerCase();
        if (tool === 'codex' || tool === 'claude' || tool === 'kimi') return tool;
        return 'kimi';
      }
      const agent = String(assignee || '').trim().toLowerCase();
      if (agent === 'codex' || agent === 'claude' || agent === 'kimi') return agent;
      return 'kimi';
    };

    // Returns the select dropdown value for the task's assignee
    const getAssignedAgentValue = (task) => {
      const assignee = task?.assignee;
      if (assignee && typeof assignee === 'object') {
        const toolId = String(assignee.tool || '').trim().toLowerCase();
        const modelId = String(assignee.model || '').trim();
        if (toolId && modelId) {
          return `${toolId}:${modelId}`;
        }
        return '';
      }
      // For legacy string assignees
      const agent = String(assignee || '').trim().toLowerCase();
      if (agent === 'codex' || agent === 'claude' || agent === 'kimi') {
        return agent;
      }
      return '__none__';
    };

    const hasAssignee = (task) => {
      const assignee = task?.assignee;
      if (assignee && typeof assignee === 'object') {
        return String(assignee.tool || '').trim().length > 0;
      }
      return String(assignee || '').trim().length > 0;
    };

    const formatAssignee = (assignee) => {
      if (assignee && typeof assignee === 'object') {
        const tool = String(assignee.tool || '').trim();
        const model = String(assignee.model || '').trim();
        const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
        return model ? `${cap(tool)}/${cap(model)}` : cap(tool);
      }
      const value = String(assignee || '').trim();
      if (!value || value.toLowerCase() === 'none' || value === 'null') return 'Unassigned';
      return value.charAt(0).toUpperCase() + value.slice(1);
    };

    const isAgentBusy = (task) => {
      const state = task?.agent?.state;
      return state === 'queued' || state === 'running';
    };

    const hasActiveEvalAssignment = (task) => (
      task?.status === 'eval' && (task?.agent?.state === 'queued' || task?.agent?.state === 'running')
    );

    const isEvalRunInProgress = (task) => task?.status === 'eval' && task?.agent?.state === 'running';

    const shouldShowEvaluator = (task) => props.columnId === 'eval' && hasActiveEvalAssignment(task) && !!task?.agent?.name;

    const hasActiveMergeAssignment = (task) => (
      task?.status === 'merging' && (task?.agent?.state === 'queued' || task?.agent?.state === 'running')
    );

    const isMergeRunInProgress = (task) => task?.status === 'merging' && task?.agent?.state === 'running';

    const shouldShowMergeAgent = (task) => props.columnId === 'merging' && hasActiveMergeAssignment(task) && !!task?.agent?.name;

    const getAgentStateLabel = (task) => {
      if (props.columnId === 'eval' && isEvalRunInProgress(task)) {
        return 'Evaluating';
      }
      if (props.columnId === 'merging' && isMergeRunInProgress(task)) {
        return 'Resolving';
      }
      if (task?.agent?.state === 'merge_failed') {
        return 'Merge Failed';
      }
      if (task?.agent?.state === 'merge_aborted') {
        return 'Merge Aborted';
      }
      return task?.agent?.state || '';
    };

    const getAgentStateBadgeClass = (task, includeClickable = true) => {
      let stateClass;
      if (props.columnId === 'eval' && isEvalRunInProgress(task)) {
        stateClass = 'is-evaluating';
      } else if (props.columnId === 'merging' && isMergeRunInProgress(task)) {
        stateClass = 'is-resolving';
      } else {
        stateClass = `is-${task?.agent?.state || 'unknown'}`;
      }
      return [stateClass, { 'is-clickable': includeClickable && task?.agent?.state === 'running' }];
    };

    const isStartDisabled = (task) => {
      if (pickingUpId.value === task?.id) return true;
      if (!hasAssignee(task)) return true;
      if (isAgentBusy(task)) return true;
      // AD_HOC-003: Disable start button when dependencies are unmet
      return !backlogStore.hasResolvedDependencies(task);
    };

    /**
     * Get list of unmet dependencies for a ticket.
     * Returns an array of dependency IDs that are not in 'review' or 'done' status.
     * @param {Object} task - The ticket to check
     * @returns {string[]} - Array of unmet dependency IDs
     */
    const getUnmetDependencies = (task) => {
      if (!task || !Array.isArray(task.dependencies) || task.dependencies.length === 0) {
        return [];
      }

      const unmet = [];
      const ticketStatusById = new Map(
        backlogStore.tickets.map((t) => [t.id, t.status])
      );

      for (const dependency of task.dependencies) {
        const depId = normalizeDependencyId(dependency);
        if (!depId) continue;

        const depStatus = ticketStatusById.get(depId);
        if (depStatus !== 'review' && depStatus !== 'done') {
          unmet.push(depId);
        }
      }

      return unmet;
    };

    /**
     * Normalize a dependency ID from various formats.
     * @param {string} dependency - The dependency ID (can be in format 'TICKET-123' or '[TICKET-123]')
     * @returns {string|null} - Normalized dependency ID or null if invalid
     */
    function normalizeDependencyId(dependency) {
      if (!dependency || typeof dependency !== 'string') return null;
      const trimmed = dependency.trim();
      if (!trimmed) return null;
      // Handle format like [TICKET-123] or just TICKET-123
      const match = trimmed.match(/^\[?([^\]]+)\]?$/);
      return match ? match[1].trim() : trimmed;
    }

    /**
     * Get the tooltip text for the start button.
     * Shows different messages based on why the button is disabled.
     * @param {Object} task - The ticket
     * @returns {string} - Tooltip text
     */
    const getStartButtonTooltip = (task) => {
      if (!task) return '';
      if (pickingUpId.value === task.id) return 'Starting...';
      if (!hasAssignee(task)) return 'Assign an agent to start this ticket';
      if (task?.agent?.state === 'queued') return 'Ticket is queued';
      if (task?.agent?.state === 'running') return 'Ticket is already running';

      const unmet = getUnmetDependencies(task);
      if (unmet.length > 0) {
        return `Blocked: waiting for ${unmet.join(', ')} to be completed`;
      }

      return 'Start ticket with assigned agent';
    };

    const getStartButtonLabel = (task) => {
      if (pickingUpId.value === task?.id) return '...';
      if (!hasAssignee(task)) return 'Assign';
      if (task?.agent?.state === 'queued') return 'Queued';
      if (task?.agent?.state === 'running') return 'Running';
      return 'Start';
    };

    const isHumanAssigned = (task) => {
      const a = task?.assignee;
      return typeof a === 'string' && a.trim().toLowerCase() === 'human';
    };

    const isCriterionChecked = (task, index) => {
      const checked = task?.criteria_checked;
      return Array.isArray(checked) && checked[index] === true;
    };

    const toggleCriterion = async (task, index) => {
      const current = Array.isArray(task.criteria_checked)
        ? [...task.criteria_checked]
        : new Array(task.acceptance_criteria?.length || 0).fill(false);
      current[index] = !current[index];
      try {
        await backlogStore.updateTicketFields(task.id, { criteria_checked: current });
        // Refresh selectedTask from store so subsequent toggles read fresh data
        const fresh = backlogStore.tickets.find(t => t.id === task.id);
        if (fresh) selectedTask.value = fresh;
      } catch (e) {
        console.error('Failed to toggle criterion:', e);
      }
    };

    const moveHumanToReview = async (ticketId) => {
      try {
        await backlogStore.updateTicketStatus(ticketId, 'review');
        closeModal();
      } catch (e) {
        console.error('Failed to move to review:', e);
      }
    };

    const isReviewActionDisabled = (task) => approvingId.value === task?.id || rejectingId.value === task?.id;
    const isEvalSkipDisabled = (task) => (
      skippingEvalId.value === task?.id ||
      task?.agent?.state === 'queued' ||
      task?.agent?.state === 'running'
    );
    const isTodoRemoveDisabled = (task) => (
      removingTodoId.value === task?.id ||
      task?.agent?.state === 'queued' ||
      task?.agent?.state === 'running'
    );

    const updateAssignedAgent = async (ticketId, assigneeValue) => {
      try {
        let assignee;
        // Check if it's a tool:model format
        if (assigneeValue && assigneeValue.includes(':')) {
          const [toolId, modelId] = assigneeValue.split(':');
          assignee = { tool: toolId, model: modelId };
        } else if (assigneeValue === '__none__') {
          assignee = null;
        } else {
          // Legacy string format
          assignee = assigneeValue;
        }
        await backlogStore.updateTicketAssignee(ticketId, assignee);
      } catch (e) {
        console.error('Failed to update ticket assignee:', e);
      }
    };

    const startErrorTicketId = ref(null);
    const startErrorMessage = ref('');

    const startAssignedTicket = async (ticketId) => {
      if (pickingUpId.value) return;
      pickingUpId.value = ticketId;
      startErrorTicketId.value = null;
      startErrorMessage.value = '';
      try {
        await backlogStore.startTicketByAssignedAgent(ticketId);
      } catch (e) {
        console.error('Failed to start ticket with assigned agent:', e);
        // AD_HOC-032: Display dependency error message
        startErrorTicketId.value = ticketId;
        startErrorMessage.value = e?.message || 'Failed to start ticket. Please try again.';
      } finally {
        pickingUpId.value = null;
      }
    };

    const approveTicket = async (ticketId) => {
      if (approvingId.value) return;
      approvingId.value = ticketId;
      try {
        await backlogStore.updateTicketStatus(ticketId, 'done');
      } catch (e) {
        console.error('Failed to approve ticket:', e);
      } finally {
        approvingId.value = null;
      }
    };

    const removeTodoToBacklog = async (ticketId) => {
      if (removingTodoId.value) return;
      removingTodoId.value = ticketId;
      try {
        await backlogStore.updateTicketStatus(ticketId, 'backlog');
      } catch (e) {
        console.error('Failed to move TODO ticket back to backlog:', e);
      } finally {
        removingTodoId.value = null;
      }
    };

    const skipEvalToReview = async (ticketId) => {
      if (skippingEvalId.value) return;
      skippingEvalId.value = ticketId;
      try {
        await backlogStore.updateTicketStatus(ticketId, 'review');
      } catch (e) {
        console.error('Failed to skip eval ticket to review:', e);
      } finally {
        skippingEvalId.value = null;
      }
    };

    const rejectTicket = async (ticketId) => {
      if (rejectingId.value) return;
      rejectTargetId.value = ticketId;
      rejectComment.value = '';
      rejectError.value = '';
      showRejectModal.value = true;
    };

    const confirmRejectTicket = async () => {
      if (rejectingId.value || !rejectTargetId.value) return;
      const trimmedComment = rejectComment.value.trim();
      if (!trimmedComment) {
        rejectError.value = 'Rejection comment is required.';
        return;
      }

      rejectingId.value = rejectTargetId.value;
      rejectError.value = '';
      try {
        await backlogStore.rejectReviewTicket(rejectTargetId.value, trimmedComment);
        closeRejectModal();
      } catch (e) {
        rejectError.value = e?.message || 'Failed to reject ticket.';
        console.error('Failed to reject ticket:', e);
      } finally {
        rejectingId.value = null;
      }
    };

    const hasAgentMetadata = (ticket) => {
      if (!ticket?.agent) return false;
      const a = ticket.agent;
      return a.run_id || a.state || a.started_at || a.stdout_tail || a.stderr_tail || a.stdout || a.stderr || a.stdout_log_file || a.stderr_log_file;
    };

    const refreshConsoleLogs = async () => {
      if (!consoleTicket.value?.id) return;
      try {
        const logs = await backlogStore.readRunLogs(
          consoleTicket.value.id,
          consoleTicket.value?.agent?.run_id || null
        );
        consoleStdout.value = logs?.stdout || '';
        consoleStderr.value = logs?.stderr || '';
        consoleStdoutTruncated.value = !!logs?.stdoutTruncated;
        consoleStderrTruncated.value = !!logs?.stderrTruncated;
      } catch (e) {
        console.error('Failed to read run logs:', e);
      }
    };

    const openConsoleDialog = (task) => {
      if (!task?.agent?.state) return;
      consoleTicket.value = task;
      showConsoleDialog.value = true;
      refreshConsoleLogs();
      
      // Start auto-refresh if ticket is running
      if (task.agent.state === 'running') {
        startConsoleRefresh();
      }
    };

    const closeConsoleDialog = () => {
      showConsoleDialog.value = false;
      consoleTicket.value = null;
      consoleStdout.value = '';
      consoleStderr.value = '';
      consoleStdoutTruncated.value = false;
      consoleStderrTruncated.value = false;
      stopConsoleRefresh();
    };

    const startConsoleRefresh = () => {
      stopConsoleRefresh(); // Clear any existing interval
      consoleRefreshInterval.value = setInterval(async () => {
        if (!consoleTicket.value) {
          stopConsoleRefresh();
          return;
        }
        
        try {
          // Refresh the ticket data from store
          await backlogStore.loadBacklog();
          
          // Find the updated ticket
          const updatedTicket = backlogStore.tickets.find(t => t.id === consoleTicket.value?.id);
          if (updatedTicket) {
            consoleTicket.value = updatedTicket;
            await refreshConsoleLogs();
            
            // Stop refresh if ticket is no longer running
            if (updatedTicket.agent?.state !== 'running') {
              stopConsoleRefresh();
            }
          }
        } catch (e) {
          console.error('Failed to refresh console data:', e);
        }
      }, 2000); // Refresh every 2 seconds
    };

    const stopConsoleRefresh = () => {
      if (consoleRefreshInterval.value) {
        clearInterval(consoleRefreshInterval.value);
        consoleRefreshInterval.value = null;
      }
    };

    const archiveTicket = async (ticketId) => {
      if (archivingId.value) return;
      archivingId.value = ticketId;
      try {
        await window.electron.ipcRenderer.invoke('archive:moveTicket', { ticketId });
        await backlogStore.loadBacklog();
      } catch (e) {
        console.error('Failed to archive ticket:', e);
      } finally {
        archivingId.value = null;
      }
    };

    const isProcessStale = (task) => {
      const pid = task?.agent?.pid;
      if (!pid || typeof pid !== 'number') return false;
      if (task?.agent?.state !== 'running') return false;
      return staleProcesses.value.get(task.id) === true;
    };

    const checkStaleProcesses = async () => {
      if (props.columnId !== 'in_progress') return;

      for (const task of props.tasks) {
        const pid = task?.agent?.pid;
        if (pid && typeof pid === 'number' && task?.agent?.state === 'running') {
          try {
            const result = await window.electron.ipcRenderer.invoke('agent:checkProcessAlive', { pid });
            staleProcesses.value.set(task.id, !result.alive);
          } catch (e) {
            console.error('Failed to check process status:', e);
          }
        }
      }
    };

    const cancelRunningTicket = async (ticketId) => {
      if (cancellingId.value) return;
      cancellingId.value = ticketId;
      try {
        await window.electron.ipcRenderer.invoke('agent:cancelRunningTicket', { ticketId });
        await backlogStore.loadBacklog();
      } catch (e) {
        console.error('Failed to cancel ticket:', e);
      } finally {
        cancellingId.value = null;
      }
    };

    let staleCheckInterval = null;

    onMounted(() => {
      // Load coding agents from codingagents.yml for the dropdown
      agentToolsStore.loadAgents();

      // Check for stale processes on mount and periodically
      checkStaleProcesses();
      if (props.columnId === 'in_progress') {
        staleCheckInterval = setInterval(checkStaleProcesses, 5000); // Check every 5 seconds
      }
    });

    // Cleanup interval on component unmount
    onUnmounted(() => {
      stopConsoleRefresh();
      if (staleCheckInterval) {
        clearInterval(staleCheckInterval);
      }
    });

    return {
      pickingUpId,
      approvingId,
      rejectingId,
      skippingEvalId,
      removingTodoId,
      archivingId,
      cancellingId,
      selectedTask,
      showRejectModal,
      rejectComment,
      rejectError,
      startErrorTicketId,
      startErrorMessage,
      showConsoleDialog,
      consoleTicket,
      consoleStdout,
      consoleStderr,
      consoleStdoutTruncated,
      consoleStderrTruncated,
      consolePrimaryOutput,
      consolePrimaryOutputTruncated,
      formatConsolePrimaryOutput,
      isPrimaryOutputMirroredFromStderr,
      isConsoleTicketRunning,
      currentActivityLine,
      recentRunNotes,
      agentToolsStore,
      getTicketTitle,
      getDependencyCount,
      getAssignedAgent,
      getAssignedAgentValue,
      hasAssignee,
      formatAssignee,
      isStartDisabled,
      getStartButtonLabel,
      getUnmetDependencies,
      getStartButtonTooltip,
      shouldShowEvaluator,
      shouldShowMergeAgent,
      getAgentStateLabel,
      getAgentStateBadgeClass,
      isReviewActionDisabled,
      isEvalSkipDisabled,
      isTodoRemoveDisabled,
      updateAssignedAgent,
      isHumanAssigned,
      isCriterionChecked,
      toggleCriterion,
      moveHumanToReview,
      startAssignedTicket,
      removeTodoToBacklog,
      skipEvalToReview,
      approveTicket,
      rejectTicket,
      confirmRejectTicket,
      archiveTicket,
      isProcessStale,
      cancelRunningTicket,
      openTaskDetail,
      closeModal,
      closeRejectModal,
      formatDate,
      hasEvalSummary,
      getEvalVerdict,
      isEvalFailure,
      getEvalVerdictBadgeClass,
      formatEvalSummaryTimestamp,
      getEvalCriteriaChecks,
      hasEvalCriteriaChecks,
      isEvalCheckFail,
      getEvalCheckIconClass,
      hasAgentMetadata,
      openConsoleDialog,
      closeConsoleDialog,
      hasFailureCounts
    };
  }
};
</script>

<style scoped>
.kanban-column {
  flex: 1;
  min-width: 202px;
  max-width: 216px;
  background-color: #f1f2f4;
  border-radius: 8px;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  max-height: 100%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.kanban-column[data-column-id="todo"] {
  min-width: 212px;
  max-width: 227px;
}

.column-header {
  display: flex;
  align-items: center;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
  user-select: none;
}

.column-header h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: #44546f;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.task-count {
  background-color: #e1e4e9;
  color: #44546f;
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.125rem 0.5rem;
  border-radius: 10px;
  margin-left: 0.5rem;
}

.task-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 0.25rem;
  margin-right: -0.5rem;
  padding-right: 0.5rem;
  min-height: 10px;
}

.task-card {
  background-color: white;
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  padding: 0.75rem;
  padding-bottom: 0.2rem;
  padding-right: 0.2rem;
  margin-bottom: 0.5rem;
  cursor: default;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  align-items: stretch;
  gap: 0.5rem;
  position: relative;
}

.task-main {
  min-width: 0;
}

.task-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #172b4d;
  margin-bottom: 0.25rem;
  word-break: break-word;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.task-id {
  font-size: 0.75rem;
  color: #6b778c;
  word-break: break-word;
}

.task-assignee {
  margin-top: 0.3rem;
  display: flex;
  gap: 0.25rem;
  align-items: baseline;
  flex-wrap: wrap;
}

.task-assignee-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: #6b778c;
}

.task-assignee-value {
  font-size: 0.72rem;
  color: #172b4d;
  font-weight: 500;
}

.task-agent-state {
  margin-top: 0.35rem;
}

.todo-agent-row {
  margin-top: 0.4rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.todo-agent-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: #44546f;
}

.todo-agent-select {
  border: 1px solid #d0d4db;
  border-radius: 4px;
  font-size: 0.72rem;
  padding: 0.1rem 0.3rem;
  background-color: #fff;
  color: #172b4d;
  flex: 1;
  min-width: 0;
  max-width: 100%;
}

.task-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.375rem;
  flex-shrink: 0;
}

.dependency-badge {
  background-color: #eaf2ff;
  color: #3451a3;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 999px;
  padding: 0.125rem 0.5rem;
}

.start-btn {
  border: none;
  border-radius: 999px;
  background-color: #1f845a;
  color: white;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.2rem 0.55rem;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.start-btn:hover {
  background-color: #196946;
}

.start-btn:disabled {
  background-color: #a5adba;
  cursor: not-allowed;
}

/* AD_HOC-003: Visual indicator for start button disabled due to unmet dependencies */
.start-btn-disabled-dependency:disabled {
  background-color: #d5dbe3;
  color: #6b778c;
  cursor: not-allowed;
  opacity: 0.8;
}

.remove-btn {
  border: none;
  border-radius: 4px;
  padding: 0.2rem 0.45rem;
  background-color: #dfe1e6;
  color: #172b4d;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.remove-btn:hover {
  background-color: #c1c7d0;
}

.remove-btn:disabled {
  background-color: #ebecf0;
  color: #a5adba;
  cursor: not-allowed;
}

.approve-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background-color: #2ecc71;
  color: white;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.15s ease;
}

.approve-btn:hover {
  background-color: #27ae60;
}

.approve-btn:disabled {
  background-color: #a5adba;
  cursor: not-allowed;
}

.skip-eval-btn {
  border: none;
  border-radius: 4px;
  padding: 0.22rem 0.5rem;
  background-color: #5e6c84;
  color: white;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1;
  transition: background-color 0.15s ease;
}

.skip-eval-btn:hover {
  background-color: #44546f;
}

.skip-eval-btn:disabled {
  background-color: #a5adba;
  cursor: not-allowed;
}

.cancel-btn {
  border: none;
  border-radius: 4px;
  padding: 0.22rem 0.5rem;
  background-color: #c9a86c;
  color: white;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1;
  transition: background-color 0.15s ease;
}

.cancel-btn:hover {
  background-color: #b8956a;
}

.cancel-btn:disabled {
  background-color: #a5adba;
  cursor: not-allowed;
}

.stale-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.5rem;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  color: #b42318;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: not-allowed;
}

.stale-badge .mdi {
  font-size: 0.85rem;
}

.review-actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-left: auto;
}

.reject-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background-color: #e74c3c;
  color: white;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.15s ease;
}

.reject-btn:hover {
  background-color: #cb4335;
}

.reject-btn:disabled {
  background-color: #a5adba;
  cursor: not-allowed;
}

.archive-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background-color: #a5adba;
  color: white;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.15s ease;
  margin-left: auto;
}

.archive-btn:hover {
  background-color: #8993a4;
}

.archive-btn:disabled {
  background-color: #d5dbe3;
  cursor: not-allowed;
}

.info-btn {
  align-self: flex-end;
  margin-top: -0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  cursor: pointer;
  padding: 2px;
}

.info-icon {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.95rem;
  font-weight: 700;
  font-style: italic;
  color: #0d9488;
  line-height: 1;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid #0d9488;
  border-radius: 50%;
  transition: all 0.15s ease;
}

.info-btn:hover .info-icon {
  background-color: #0d9488;
  color: white;
}

.task-list::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.task-list::-webkit-scrollbar-track {
  background: transparent;
}

.task-list::-webkit-scrollbar-thumb {
  background-color: #c1c7d0;
  border-radius: 3px;
}

.task-list::-webkit-scrollbar-thumb:hover {
  background-color: #a5adba;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  max-width: 500px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e1e4e8;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #172b4d;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-bottom: 1rem;
}

.detail-row:last-child {
  margin-bottom: 0;
}

.detail-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b778c;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  font-size: 0.875rem;
  color: #172b4d;
  word-break: break-word;
}

.detail-value.description {
  white-space: pre-wrap;
  background-color: #f4f5f7;
  padding: 0.75rem;
  border-radius: 6px;
  font-family: inherit;
  line-height: 1.5;
}

.detail-list {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.875rem;
  color: #172b4d;
}

.detail-list li {
  margin-bottom: 0.25rem;
}

.detail-list li:last-child {
  margin-bottom: 0;
}

.files-list {
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 0.8rem;
}

.detail-value.notes {
  white-space: pre-wrap;
  background-color: #f4f5f7;
  padding: 0.75rem;
  border-radius: 6px;
  font-family: inherit;
  line-height: 1.5;
  font-size: 0.875rem;
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  width: fit-content;
}

.agent-state-badge {
  display: inline-block;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
}

.agent-state-badge.is-queued {
  background-color: #e6f0ff;
  color: #3451a3;
}

.agent-state-badge.is-running {
  background-color: #fff3cd;
  color: #856404;
}

.agent-state-badge.is-failed {
  background-color: #fde8ea;
  color: #7f1d1d;
}

.agent-state-badge.is-completed {
  background-color: #dcfce7;
  color: #166534;
}

.agent-state-badge.is-merge_failed {
  background-color: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
}

.agent-state-badge.is-merge_aborted {
  background-color: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}

.agent-state-badge.is-evaluating {
  background-color: #ffedd5;
  color: #9a3412;
  border: 1px solid #fdba74;
}

.agent-state-badge.is-resolving {
  background-color: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
}

.agent-state-badge.is-clickable {
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

.agent-state-badge.is-clickable:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.status-badge.todo {
  background-color: #e1e4e8;
  color: #44546f;
}

.status-badge.inProgress,
.status-badge.in_progress {
  background-color: #deebff;
  color: #0747a6;
}

.status-badge.eval {
  background-color: #e3f2fd;
  color: #1565c0;
}

.status-badge.merging {
  background-color: #fef3c7;
  color: #92400e;
}

.status-badge.review {
  background-color: #fff0b3;
  color: #974f0c;
}

.status-badge.done {
  background-color: #e3fcef;
  color: #006644;
}

.priority-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  width: fit-content;
}

.priority-badge.high {
  background-color: #ffebe6;
  color: #de350b;
}

.priority-badge.medium {
  background-color: #fff0b3;
  color: #974f0c;
}

.priority-badge.low {
  background-color: #e3fcef;
  color: #006644;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #e1e4e8;
  display: flex;
  justify-content: flex-end;
}

.btn {
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  border: none;
  font-weight: 500;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.btn-primary {
  background-color: #0d9488;
  color: white;
}

.btn-primary:hover {
  background-color: #0f766e;
}

.btn-secondary {
  background-color: #f4f5f7;
  color: #172b4d;
  margin-right: 0.5rem;
}

.btn-secondary:hover {
  background-color: #e9edf2;
}

.btn-danger {
  background-color: #e74c3c;
  color: white;
}

.btn-danger:hover {
  background-color: #cb4335;
}

.btn-success {
  background-color: #16a34a;
  color: white;
  margin-right: 0.5rem;
}

.btn-success:hover {
  background-color: #15803d;
}

.btn:disabled {
  background-color: #d5dbe3;
  color: #6b778c;
  cursor: not-allowed;
}

.human-badge {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 600;
  background-color: #dbeafe;
  color: #1e40af;
}

.criterion-check {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  cursor: pointer;
}

.criterion-check input[type="checkbox"] {
  margin-top: 0.2rem;
  cursor: pointer;
}

.criterion-done {
  text-decoration: line-through;
  color: #9ca3af;
}

.reject-modal {
  max-width: 520px;
}

.reject-help-text {
  margin-top: 0;
  margin-bottom: 0.75rem;
  color: #44546f;
  font-size: 0.875rem;
}

.reject-comment-input {
  width: 100%;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  padding: 0.65rem 0.75rem;
  font-size: 0.875rem;
  font-family: inherit;
  resize: vertical;
  outline: none;
}

.reject-comment-input:focus {
  border-color: #0d9488;
  box-shadow: 0 0 0 2px rgba(13, 148, 136, 0.15);
}

.reject-error {
  margin-top: 0.55rem;
  margin-bottom: 0;
  color: #b42318;
  font-size: 0.82rem;
}

/* AD_HOC-032: Start error message styling */
.start-error-message {
  margin-top: 0.5rem;
  padding: 0.5rem 0.6rem;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 4px;
  color: #b42318;
  font-size: 0.8rem;
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  line-height: 1.4;
}

.start-error-message .mdi {
  flex-shrink: 0;
  font-size: 1rem;
  margin-top: 0.1rem;
}

.start-error-message .error-text {
  flex: 1;
}

.reject-footer {
  justify-content: flex-end;
}

/* Console Dialog Styles */
.console-modal {
  max-width: 700px;
  width: 90%;
  max-height: 85vh;
}

.console-body {
  max-height: 72vh;
  overflow-y: auto;
}

.console-status-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.console-status-badge.is-running {
  background-color: #fff3cd;
  color: #856404;
}

.console-status-badge.is-completed {
  background-color: #dcfce7;
  color: #166534;
}

.console-status-badge.is-failed {
  background-color: #fde8ea;
  color: #7f1d1d;
}

.console-status-badge.is-merge_failed {
  background-color: #fef3c7;
  color: #92400e;
}

.console-status-badge.is-merge_aborted {
  background-color: #fee2e2;
  color: #991b1b;
}

.console-status-badge.is-queued {
  background-color: #e6f0ff;
  color: #3451a3;
}

.console-status-badge.is-unknown {
  background-color: #e1e4e8;
  color: #44546f;
}

.console-section {
  margin-bottom: 1rem;
}

.console-section:last-child {
  margin-bottom: 0;
}

.console-metadata {
  background-color: #f8f9fa;
  border-radius: 6px;
  padding: 0.75rem 1rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.5rem;
}

.metadata-row {
  display: flex;
  gap: 0.5rem;
  font-size: 0.85rem;
}

.metadata-label {
  color: #6b778c;
  font-weight: 500;
  white-space: nowrap;
}

.metadata-value {
  color: #172b4d;
  word-break: break-word;
}

.metadata-value.exit-success {
  color: #166534;
  font-weight: 600;
}

.metadata-value.exit-error {
  color: #7f1d1d;
  font-weight: 600;
}

.console-live-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding: 0.5rem 0.75rem;
  background-color: #e3f2fd;
  border-radius: 6px;
  width: fit-content;
}

.live-dot {
  width: 8px;
  height: 8px;
  background-color: #0d9488;
  border-radius: 50%;
  animation: pulse-dot 1.5s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.1);
  }
}

.live-text {
  font-size: 0.8rem;
  color: #0d9488;
  font-weight: 500;
}

.console-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.console-section-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: #6b778c;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.console-output {
  background-color: #1e1e1e;
  border-radius: 6px;
  padding: 0.75rem;
  max-height: 200px;
  overflow-y: auto;
}

.console-output pre {
  margin: 0;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 0.8rem;
  line-height: 1.5;
  color: #e4e4e4;
  white-space: pre-wrap;
  word-break: break-word;
}

.console-output pre.formatted-output {
  color: #d4d4d4;
  tab-size: 2;
}

.console-output.console-error pre {
  color: #fca5a5;
}

.console-empty {
  margin: 0;
  color: #6b778c;
  font-style: italic;
  font-size: 0.85rem;
}

.console-no-data {
  text-align: center;
  padding: 2rem 1rem;
  color: #6b778c;
}

.console-no-data p {
  margin: 0 0 0.5rem 0;
}

.console-hint {
  font-size: 0.85rem;
  color: #8c9bab;
}

.console-truncated-note {
  margin: 0.45rem 0 0 0;
  color: #8c9bab;
  font-size: 0.75rem;
}

/* Scrollbar styling for console output */
.console-output::-webkit-scrollbar {
  width: 8px;
}

.console-output::-webkit-scrollbar-track {
  background: #2d2d2d;
  border-radius: 4px;
}

.console-output::-webkit-scrollbar-thumb {
  background-color: #4a4a4a;
  border-radius: 4px;
}

.console-output::-webkit-scrollbar-thumb:hover {
  background-color: #5a5a5a;
}

.console-activity {
  background-color: #f8fafc;
  border: 1px solid #dbe5f0;
  border-radius: 6px;
  padding: 0.75rem;
}

.console-activity-line {
  margin: 0;
  color: #172b4d;
  font-size: 0.85rem;
  font-weight: 500;
}

.console-activity-notes {
  margin: 0.55rem 0 0 1rem;
  padding: 0;
  color: #44546f;
  font-size: 0.8rem;
  line-height: 1.4;
}

/* Evaluator ownership display styles */
.task-evaluator {
  margin-top: 0.35rem;
  margin-bottom: 0.2rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.4rem;
  background-color: #e3f2fd;
  border-radius: 4px;
  font-size: 0.7rem;
}

.task-evaluator--pending {
  background-color: #fff3cd;
  color: #856404;
}

.task-evaluator-label {
  font-weight: 600;
  color: #1565c0;
}

.task-evaluator-value {
  color: #1565c0;
  font-weight: 500;
}

.task-evaluator--pending .task-evaluator-value {
  color: #856404;
}

/* Failed evaluation badge for todo column */
.task-eval-failed-badge {
  margin-top: 0.35rem;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.5rem;
  background-color: #fde8ea;
  color: #7f1d1d;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  width: fit-content;
}

.task-eval-failed-badge .mdi {
  font-size: 0.8rem;
}

.eval-summary-row {
  border-top: 1px solid #eaedf0;
  padding-top: 0.75rem;
}

.eval-summary-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.eval-verdict-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.eval-verdict-badge.is-pass {
  background-color: #dcfce7;
  color: #166534;
}

.eval-verdict-badge.is-fail {
  background-color: #fde8ea;
  color: #7f1d1d;
}

.eval-summary-timestamp {
  margin: 0.1rem 0 0.35rem 0;
  font-size: 0.78rem;
  color: #5e6c84;
}

.eval-summary-empty {
  margin: 0;
  font-size: 0.82rem;
  color: #5e6c84;
}

.eval-checklist {
  margin: 0;
  padding-left: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.eval-check-item {
  background-color: #f8fafc;
  border: 1px solid #dbe5f0;
  border-radius: 6px;
  padding: 0.55rem 0.65rem;
}

.eval-check-main {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
}

.eval-check-criterion {
  color: #172b4d;
  font-size: 0.84rem;
  line-height: 1.45;
}

.eval-check-icon-pass {
  color: #16a34a;
  font-size: 1rem;
  margin-top: 0.05rem;
}

.eval-check-icon-fail {
  color: #dc2626;
  font-size: 1rem;
  margin-top: 0.05rem;
}

.eval-check-reason,
.eval-check-suggestion {
  margin: 0.4rem 0 0 1.45rem;
  font-size: 0.8rem;
  line-height: 1.45;
  color: #44546f;
}

.eval-check-suggestion {
  font-style: italic;
  color: #0f766e;
}

.eval-epic-ref-check {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.5rem;
  font-size: 0.82rem;
  color: var(--text-color, #2c3e50);
}

.eval-pass-icon { color: #2fa96a; }
.eval-fail-icon { color: #d14545; }
.eval-unknown-icon { color: #9ca3af; }

.eval-failure-reasons {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(209, 69, 69, 0.08);
  border-radius: 4px;
  border-left: 3px solid #d14545;
}

.eval-failure-list {
  margin: 0.25rem 0 0;
  padding: 0 0 0 1.25rem;
  font-size: 0.8rem;
  color: #d14545;
  line-height: 1.5;
}

.eval-failure-list li {
  margin-bottom: 0.2rem;
}

.failure-counts-container {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.failure-count-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.failure-count-label {
  font-weight: 500;
  color: #6b778c;
}

.failure-count-value {
  font-weight: 600;
  color: #dc2626;
}
</style>
