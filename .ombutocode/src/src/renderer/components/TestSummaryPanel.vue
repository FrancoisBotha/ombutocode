<template>
  <div class="test-summary-row" v-if="summary">
    <div class="test-summary-header">
      <span class="detail-label">Test Summary:</span>
      <span class="test-verdict-badge" :class="verdict === 'PASS' ? 'is-pass' : 'is-fail'">
        {{ verdict }}
      </span>
    </div>

    <p v-if="summary.timestamp" class="test-summary-timestamp">
      {{ formattedTimestamp }}
    </p>

    <ul v-if="checks.length" class="test-checklist">
      <li v-for="(check, idx) in checks" :key="`${check.check_name || 'check'}-${idx}`" class="test-check-item">
        <div class="test-check-main">
          <span class="mdi" :class="iconClass(check)"></span>
          <span class="test-check-name">{{ label(check) }}</span>
          <span class="test-check-result" :class="isFail(check) ? 'is-fail' : 'is-pass'">
            {{ result(check) }}
          </span>
        </div>
        <p v-if="check.details" class="test-check-details">{{ check.details }}</p>
      </li>
    </ul>

    <p v-else-if="!summary.raw_excerpt" class="test-summary-empty">
      No per-check details available.
    </p>

    <!-- The agent produced no parseable checks; show the tail of its output so
         the failure is still explainable without digging through Notes. -->
    <div v-if="!checks.length && summary.raw_excerpt" class="test-raw-excerpt">
      <span class="detail-label">Agent output (tail):</span>
      <pre>{{ summary.raw_excerpt }}</pre>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue';

// The test phase reports these three checks; anything else is shown verbatim.
const CHECK_LABELS = {
  UNIT_TESTS: 'Unit Tests',
  LINT_CHECK: 'Lint',
  TYPE_CHECK: 'Type Check'
};

export default {
  name: 'TestSummaryPanel',
  props: {
    ticket: { type: Object, default: null }
  },
  setup(props) {
    const summary = computed(() => {
      const raw = props.ticket?.test_summary;
      if (!raw || typeof raw !== 'object') return null;
      const verdict = String(raw.verdict || '').toUpperCase();
      if (verdict !== 'PASS' && verdict !== 'FAIL') return null;
      return raw;
    });

    const verdict = computed(() => String(summary.value?.verdict || '').toUpperCase());

    const checks = computed(() => {
      const list = summary.value?.checks;
      return Array.isArray(list) ? list : [];
    });

    const formattedTimestamp = computed(() => {
      const timestamp = summary.value?.timestamp;
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
    });

    const result = (check) => String(check?.result || '').toUpperCase();
    const isFail = (check) => result(check) === 'FAIL';
    const label = (check) => CHECK_LABELS[check?.check_name] || check?.check_name || 'Check';
    const iconClass = (check) => (
      isFail(check) ? 'mdi-close-circle test-check-icon-fail' : 'mdi-check-circle test-check-icon-pass'
    );

    return { summary, verdict, checks, formattedTimestamp, result, isFail, label, iconClass };
  }
};
</script>

<style scoped>
.test-summary-row {
  border-top: 1px solid #eaedf0;
  padding-top: 0.75rem;
}

.test-summary-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.15rem;
}

.detail-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #5e6c84;
}

.test-verdict-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.test-verdict-badge.is-pass { background-color: #dcfce7; color: #166534; }
.test-verdict-badge.is-fail { background-color: #fde8ea; color: #7f1d1d; }

.test-summary-timestamp {
  margin: 0.1rem 0 0.35rem 0;
  font-size: 0.78rem;
  color: #5e6c84;
}

.test-summary-empty {
  margin: 0;
  font-size: 0.82rem;
  color: #5e6c84;
}

.test-checklist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.test-check-item {
  background-color: #f8fafc;
  border: 1px solid #dbe5f0;
  border-radius: 6px;
  padding: 0.55rem 0.65rem;
}

.test-check-main {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
}

.test-check-main .mdi { font-size: 1rem; }
.test-check-icon-pass { color: #16a34a; }
.test-check-icon-fail { color: #dc2626; }

.test-check-name { font-weight: 600; }

.test-check-result {
  margin-left: auto;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.test-check-result.is-pass { color: #166534; }
.test-check-result.is-fail { color: #b91c1c; }

.test-check-details {
  margin: 0.3rem 0 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: #42526e;
  white-space: pre-wrap;
  word-break: break-word;
}

.test-raw-excerpt { margin-top: 0.35rem; }

.test-raw-excerpt pre {
  margin: 0.25rem 0 0;
  padding: 0.5rem 0.6rem;
  max-height: 200px;
  overflow: auto;
  background-color: #f8fafc;
  border: 1px solid #dbe5f0;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.74rem;
  line-height: 1.5;
  color: #42526e;
  white-space: pre-wrap;
  word-break: break-word;
}

[data-theme="dark"] .test-summary-row { border-top-color: var(--border-color); }
[data-theme="dark"] .detail-label,
[data-theme="dark"] .test-summary-timestamp,
[data-theme="dark"] .test-summary-empty { color: var(--text-muted); }
[data-theme="dark"] .test-check-item,
[data-theme="dark"] .test-raw-excerpt pre {
  background-color: #161a1f;
  border-color: var(--border-color);
}
[data-theme="dark"] .test-check-details,
[data-theme="dark"] .test-raw-excerpt pre { color: var(--text-color); }
[data-theme="dark"] .test-verdict-badge.is-pass { background-color: rgba(60, 199, 122, 0.15); color: #5dd99a; }
[data-theme="dark"] .test-verdict-badge.is-fail { background-color: rgba(224, 96, 96, 0.15); color: #e06060; }
[data-theme="dark"] .test-check-result.is-pass { color: #5dd99a; }
[data-theme="dark"] .test-check-result.is-fail { color: #e06060; }
</style>
