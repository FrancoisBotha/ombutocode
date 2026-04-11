<template>
  <aside class="backlog-detail">
    <h3 class="detail-title">{{ ticket.title }}</h3>

    <dl class="detail-fields">
      <dt>ID</dt>
      <dd>{{ ticket.id }}</dd>

      <dt>Status</dt>
      <dd><span class="status-badge" :class="'status-' + ticket.status">{{ ticket.status }}</span></dd>

      <dt>Description</dt>
      <dd class="description-text">{{ ticket.description || 'None' }}</dd>

      <dt>Feature Ref</dt>
      <dd>{{ ticket.epic_ref || 'None' }}</dd>

      <dt>Dependencies</dt>
      <dd>{{ ticket.dependencies && ticket.dependencies.length ? ticket.dependencies.join(', ') : 'None' }}</dd>

      <dt>Assignee</dt>
      <dd>
        <span v-if="isHumanAssigned" class="assignee-badge assignee-human">Human</span>
        <span v-else-if="ticket.assignee">{{ formatAssignee(ticket.assignee) }}</span>
        <span v-else>Unassigned</span>
        <button
          v-if="!isHumanAssigned && (ticket.status === 'backlog' || ticket.status === 'todo')"
          class="btn btn-assign-human"
          @click="assignToHuman"
        >
          <span class="mdi mdi-account"></span> Assign to Human
        </button>
        <button
          v-if="isHumanAssigned && (ticket.status === 'backlog' || ticket.status === 'todo')"
          class="btn btn-unassign-human"
          @click="unassignHuman"
        >
          <span class="mdi mdi-account-remove"></span> Unassign
        </button>
      </dd>

      <dt>Acceptance Criteria</dt>
      <dd>
        <ul v-if="ticket.acceptance_criteria && ticket.acceptance_criteria.length" class="criteria-list">
          <li v-for="(criterion, i) in ticket.acceptance_criteria" :key="i" class="criterion-item">
            <label v-if="isHumanAssigned" class="criterion-check">
              <input
                type="checkbox"
                :checked="isCriterionChecked(i)"
                @change="toggleCriterion(i)"
              />
              <span :class="{ 'criterion-done': isCriterionChecked(i) }">{{ criterion }}</span>
            </label>
            <span v-else>{{ criterion }}</span>
          </li>
        </ul>
        <span v-else>None</span>
      </dd>

      <dt v-if="hasEvalSummary(ticket)">Evaluation Summary</dt>
      <dd v-if="hasEvalSummary(ticket)" class="eval-summary-section">
        <div class="eval-summary-header">
          <span class="eval-verdict-badge" :class="getEvalVerdictBadgeClass(ticket)">
            {{ getEvalVerdict(ticket) }}
          </span>
        </div>
        <p v-if="ticket.eval_summary?.timestamp" class="eval-summary-timestamp">
          {{ formatEvalSummaryTimestamp(ticket.eval_summary.timestamp) }}
        </p>
        <p v-if="!hasEvalCriteriaChecks(ticket)" class="eval-summary-empty">
          No per-criterion details available.
        </p>
        <ul v-else class="eval-checklist">
          <li v-for="(check, idx) in getEvalCriteriaChecks(ticket)" :key="`${check.criterion || 'criterion'}-${idx}`" class="eval-check-item">
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
      </dd>

      <dt v-if="hasFailureCounts(ticket)">Failure Counts</dt>
      <dd v-if="hasFailureCounts(ticket)" class="failure-counts-section">
        <span v-if="ticket.fail_count > 0" class="failure-count-item">
          <span class="failure-count-label">Retries:</span>
          <span class="failure-count-value">{{ ticket.fail_count }}</span>
        </span>
        <span v-if="ticket.eval_fail_count > 0" class="failure-count-item">
          <span class="failure-count-label">Eval Failures:</span>
          <span class="failure-count-value">{{ ticket.eval_fail_count }}</span>
        </span>
      </dd>

      <dt>Files Touched</dt>
      <dd>
        <ul v-if="ticket.files_touched && ticket.files_touched.length" class="files-list">
          <li v-for="(file, i) in ticket.files_touched" :key="i">{{ file }}</li>
        </ul>
        <span v-else>None</span>
      </dd>

      <dt>Notes</dt>
      <dd>{{ ticket.notes || 'None' }}</dd>
    </dl>

    <div class="detail-actions">
      <button
        v-if="ticket.status === 'backlog'"
        class="btn btn-promote"
        @click="promote"
      >
        <span class="mdi mdi-arrow-up-bold"></span> Promote to TODO
      </button>
      <button
        v-if="isHumanAssigned && (ticket.status === 'todo' || ticket.status === 'in_progress')"
        class="btn btn-review"
        @click="moveToReview"
      >
        <span class="mdi mdi-check-bold"></span> Move to Review
      </button>
    </div>
  </aside>
</template>

<script>
import { computed, ref } from 'vue';
import { useBacklogStore } from '@/stores/backlogStore';

export default {
  name: 'BacklogDetail',
  props: {
    ticket: {
      type: Object,
      required: true
    }
  },
  setup(props) {
    const backlogStore = useBacklogStore();

    const isHumanAssigned = computed(() => {
      const a = props.ticket?.assignee;
      if (typeof a === 'string') return a.trim().toLowerCase() === 'human';
      return false;
    });

    // Track checked criteria as an array of booleans stored in ticket.criteria_checked
    const isCriterionChecked = (index) => {
      const checked = props.ticket?.criteria_checked;
      return Array.isArray(checked) && checked[index] === true;
    };

    const toggleCriterion = async (index) => {
      const current = Array.isArray(props.ticket.criteria_checked)
        ? [...props.ticket.criteria_checked]
        : new Array(props.ticket.acceptance_criteria?.length || 0).fill(false);
      current[index] = !current[index];
      try {
        await backlogStore.updateTicketFields(props.ticket.id, { criteria_checked: current });
      } catch (e) {
        console.error('Failed to toggle criterion:', e);
      }
    };

    const formatAssignee = (assignee) => {
      if (typeof assignee === 'string') return assignee;
      if (assignee && typeof assignee === 'object') {
        return `${assignee.tool}${assignee.model ? ':' + assignee.model : ''}`;
      }
      return '';
    };

    async function assignToHuman() {
      try {
        await backlogStore.updateTicketAssignee(props.ticket.id, 'human');
      } catch (e) {
        console.error('Failed to assign to human:', e);
      }
    }

    async function unassignHuman() {
      try {
        await backlogStore.updateTicketAssignee(props.ticket.id, null);
      } catch (e) {
        console.error('Failed to unassign:', e);
      }
    }

    async function promote() {
      try {
        await backlogStore.promoteToTodo(props.ticket.id);
      } catch (e) {
        console.error('Failed to promote ticket:', e);
      }
    }

    async function moveToReview() {
      try {
        await backlogStore.updateTicketStatus(props.ticket.id, 'review');
      } catch (e) {
        console.error('Failed to move to review:', e);
      }
    }

    const getEvalSummary = (ticket) => {
      const summary = ticket?.eval_summary;
      if (!summary || typeof summary !== 'object') return null;
      const verdict = String(summary.verdict || '').toUpperCase();
      if (verdict !== 'PASS' && verdict !== 'FAIL') return null;
      return summary;
    };

    const hasEvalSummary = (ticket) => !!getEvalSummary(ticket);

    const getEvalVerdict = (ticket) => String(getEvalSummary(ticket)?.verdict || '').toUpperCase();

    const getEvalVerdictBadgeClass = (ticket) => (
      getEvalVerdict(ticket) === 'PASS' ? 'is-pass' : 'is-fail'
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

    const getEvalCriteriaChecks = (ticket) => {
      const checks = getEvalSummary(ticket)?.criteria_checks;
      return Array.isArray(checks) ? checks : [];
    };

    const hasEvalCriteriaChecks = (ticket) => getEvalCriteriaChecks(ticket).length > 0;

    const getEvalCheckResult = (check) => String(check?.result || '').toUpperCase();

    const isEvalCheckFail = (check) => getEvalCheckResult(check) === 'FAIL';

    const getEvalCheckIconClass = (check) => (
      getEvalCheckResult(check) === 'PASS'
        ? 'mdi-check-circle eval-check-icon-pass'
        : 'mdi-close-circle eval-check-icon-fail'
    );

    const hasFailureCounts = (ticket) => {
      const failCount = Number(ticket?.fail_count ?? 0);
      const evalFailCount = Number(ticket?.eval_fail_count ?? 0);
      return failCount > 0 || evalFailCount > 0;
    };

    return {
      promote,
      moveToReview,
      isHumanAssigned,
      isCriterionChecked,
      toggleCriterion,
      formatAssignee,
      assignToHuman,
      unassignHuman,
      hasEvalSummary,
      getEvalVerdict,
      getEvalVerdictBadgeClass,
      formatEvalSummaryTimestamp,
      getEvalCriteriaChecks,
      hasEvalCriteriaChecks,
      isEvalCheckFail,
      getEvalCheckIconClass,
      hasFailureCounts
    };
  }
};
</script>

<style scoped>
.backlog-detail {
  padding: 1.5rem;
  overflow-y: auto;
  height: 100%;
  background-color: #ffffff;
  border-left: 1px solid #e1e4e8;
}

.detail-title {
  margin: 0 0 1.25rem;
  font-size: 1.1rem;
  font-weight: 600;
  color: #2c3e50;
}

.detail-fields {
  margin: 0;
}

.detail-fields dt {
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b778c;
  margin-top: 1rem;
}

.detail-fields dt:first-child {
  margin-top: 0;
}

.detail-fields dd {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  color: #2c3e50;
  line-height: 1.5;
}

.status-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-backlog {
  background-color: #e1e4e8;
  color: #505f79;
}

.status-todo {
  background-color: #e1e7ff;
  color: #4a6bdf;
}

.status-in_progress {
  background-color: #fff3cd;
  color: #856404;
}

.status-done {
  background-color: #d4edda;
  color: #155724;
}

.status-blocked {
  background-color: #f8d7da;
  color: #721c24;
}

.criteria-list,
.files-list {
  margin: 0.25rem 0 0;
  padding-left: 1.25rem;
}

.criteria-list li,
.files-list li {
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
}

.files-list li {
  font-family: monospace;
  font-size: 0.8rem;
}

.detail-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1.5rem;
  flex-wrap: wrap;
}

.btn-promote,
.btn-review {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-promote {
  background-color: #4a90e2;
}

.btn-promote:hover {
  background-color: #357abd;
}

.btn-review {
  background-color: #16a34a;
}

.btn-review:hover {
  background-color: #15803d;
}

.assignee-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 600;
}

.assignee-human {
  background-color: #dbeafe;
  color: #1e40af;
}

.btn-assign-human,
.btn-unassign-human {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-left: 0.5rem;
  padding: 0.2rem 0.6rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background-color: #f9fafb;
  color: #374151;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-assign-human:hover {
  background-color: #dbeafe;
  border-color: #93c5fd;
}

.btn-unassign-human:hover {
  background-color: #fee2e2;
  border-color: #fca5a5;
}

.criterion-item {
  margin-bottom: 0.35rem;
}

.criterion-check {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
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

/* Eval Summary Styles */
.eval-summary-section {
  margin-top: 0.5rem;
}

.eval-summary-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.25rem;
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
  margin: 0.5rem 0 0 0;
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

.eval-check-reason {
  margin: 0.35rem 0 0 1.45rem;
  font-size: 0.8rem;
  color: #5e6c84;
  line-height: 1.4;
}

.eval-check-suggestion {
  margin: 0.25rem 0 0 1.45rem;
  font-size: 0.8rem;
  color: #0d9488;
  font-style: italic;
  line-height: 1.4;
}

.failure-counts-section {
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
