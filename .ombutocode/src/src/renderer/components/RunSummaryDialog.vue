<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content run-summary-modal">
      <div class="modal-header run-summary-header">
        <div class="run-summary-title-group">
          <span class="mdi mdi-text-box-search-outline run-summary-icon"></span>
          <div>
            <h2>Run Summary: {{ ticket?.id }}</h2>
            <p class="run-summary-subtitle">{{ ticket?.title || 'Untitled' }}</p>
          </div>
        </div>
        <div class="run-summary-header-meta">
          <span class="run-summary-chip" v-if="summary?.agent">{{ summary.agent }}</span>
          <span class="run-summary-chip" v-if="formattedTimestamp">{{ formattedTimestamp }}</span>
          <button class="run-summary-close" @click="$emit('close')" title="Close">
            <span class="mdi mdi-close"></span>
          </button>
        </div>
      </div>

      <div class="modal-body run-summary-body">
        <p v-if="status === 'generating'" class="run-summary-state">
          <span class="mdi mdi-loading mdi-spin"></span>
          Summarising run output…
        </p>

        <p v-else-if="status === 'failed'" class="run-summary-state is-error">
          <span class="mdi mdi-alert-circle-outline"></span>
          {{ summary?.error || 'Summarisation failed.' }}
        </p>

        <p v-else-if="status === 'unavailable'" class="run-summary-state">
          <span class="mdi mdi-information-outline"></span>
          {{ summary?.reason || 'No run output was recorded for this ticket.' }}
        </p>

        <p v-else-if="!sections.length" class="run-summary-state">
          <span class="mdi mdi-information-outline"></span>
          This summary has no sections.
        </p>

        <section
          v-for="section in sections"
          :key="section.phase"
          class="run-summary-section"
        >
          <button class="run-summary-section-header" @click="toggle(section.phase)">
            <span class="mdi" :class="isOpen(section.phase) ? 'mdi-chevron-down' : 'mdi-chevron-right'"></span>
            <span class="run-summary-section-title">{{ section.label || section.phase }}</span>
            <span v-if="section.error" class="run-summary-section-error">failed</span>
          </button>

          <div v-if="isOpen(section.phase)" class="run-summary-section-body">
            <p v-if="section.error" class="run-summary-state is-error">{{ section.error }}</p>

            <!-- The agent's response could not be parsed as JSON; show it verbatim
                 rather than losing it entirely. -->
            <pre v-else-if="section.raw" class="run-summary-raw">{{ section.raw }}</pre>

            <template v-else>
              <p v-if="section.what_changed" class="run-summary-prose">{{ section.what_changed }}</p>

              <div v-for="group in listGroups(section)" :key="group.key" class="run-summary-group">
                <span class="detail-label">{{ group.label }}</span>
                <ul>
                  <li v-for="(item, idx) in group.items" :key="`${group.key}-${idx}`">{{ item }}</li>
                </ul>
              </div>

              <p v-if="isSectionEmpty(section)" class="run-summary-state">
                Nothing notable was reported for this phase.
              </p>
            </template>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, ref } from 'vue';

const LIST_GROUPS = [
  { key: 'files_touched', label: 'Files touched' },
  { key: 'decisions', label: 'Decisions & assumptions' },
  { key: 'problems', label: 'Problems' },
  { key: 'follow_ups', label: 'Follow-ups' }
];

export default {
  name: 'RunSummaryDialog',
  props: {
    ticket: { type: Object, default: null }
  },
  emits: ['close'],
  setup(props) {
    const summary = computed(() => {
      const raw = props.ticket?.run_summary;
      return raw && typeof raw === 'object' ? raw : null;
    });

    const status = computed(() => String(summary.value?.status || 'unavailable'));

    const sections = computed(() => {
      const list = summary.value?.sections;
      return Array.isArray(list) ? list : [];
    });

    // Implementation opens by default — it is what a reviewer reads first.
    const collapsed = ref(new Set());
    const isOpen = (phase) => !collapsed.value.has(phase);
    const toggle = (phase) => {
      const next = new Set(collapsed.value);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      collapsed.value = next;
    };

    const listGroups = (section) => LIST_GROUPS
      .map(group => ({ ...group, items: Array.isArray(section?.[group.key]) ? section[group.key] : [] }))
      .filter(group => group.items.length > 0);

    const isSectionEmpty = (section) => (
      !section?.what_changed && listGroups(section).length === 0
    );

    const formattedTimestamp = computed(() => {
      const timestamp = summary.value?.generated_at;
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

    return {
      summary,
      status,
      sections,
      isOpen,
      toggle,
      listGroups,
      isSectionEmpty,
      formattedTimestamp
    };
  }
};
</script>

<style scoped>
.run-summary-modal {
  max-width: 760px;
  width: 90vw;
  /* height, not max-height: a percentage max-height on a flex-centred child
     leaves the body's height indefinite, so overflow-y never engages and no
     scrollbar appears. A definite height is what makes the chain work. */
  height: 85vh;
  display: flex;
  flex-direction: column;
  /* Keep the body's scrollbar inside the rounded corners. */
  overflow: hidden;
}

.run-summary-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  /* The header must not be squeezed when the body is long. */
  flex-shrink: 0;
}

.run-summary-title-group {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
}

.run-summary-title-group h2 {
  margin: 0;
  font-size: 1.05rem;
}

.run-summary-icon {
  font-size: 1.4rem;
  color: #5e6c84;
}

.run-summary-subtitle {
  margin: 0.15rem 0 0;
  font-size: 0.82rem;
  color: #5e6c84;
}

.run-summary-header-meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.run-summary-chip {
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  background-color: #f1f5f9;
  font-size: 0.7rem;
  font-weight: 600;
  color: #42526e;
  white-space: nowrap;
}

.run-summary-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  color: #5e6c84;
  padding: 0.15rem 0.3rem;
}

.run-summary-body {
  /* flex:1 plus min-height:0 is what actually lets this scroll — without the
     min-height a flex child refuses to shrink below its content and the
     overflow never engages. */
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  /* The shared modal classes only supply colours here, not spacing. */
  padding: 0.75rem 1rem 1rem;
}

/* Children must keep their natural height. As shrinkable flex items they were
   being compressed to fit instead of overflowing, so the body never scrolled —
   and because .run-summary-section is overflow:hidden, each section quietly
   clipped its own text rather than showing a scrollbar anywhere. */
.run-summary-body > * {
  flex-shrink: 0;
}

.run-summary-header { padding: 0.85rem 1rem 0.6rem; }

.run-summary-state {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.85rem;
  color: #5e6c84;
}

.run-summary-state.is-error { color: #b91c1c; }

.run-summary-section {
  border: 1px solid #dbe5f0;
  border-radius: 6px;
  overflow: hidden;
}

.run-summary-section-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.55rem 0.65rem;
  background-color: #f8fafc;
  border: none;
  cursor: pointer;
  text-align: left;
  font-size: 0.85rem;
  font-weight: 600;
  color: inherit;
}

.run-summary-section-title { flex: 1; }

.run-summary-section-error {
  font-size: 0.7rem;
  font-weight: 700;
  color: #b91c1c;
}

.run-summary-section-body {
  padding: 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.run-summary-prose {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.55;
  color: #42526e;
  white-space: pre-wrap;
}

.detail-label {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: #5e6c84;
}

.run-summary-group ul {
  margin: 0.3rem 0 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.run-summary-group li {
  font-size: 0.82rem;
  line-height: 1.45;
  color: #42526e;
  word-break: break-word;
}

.run-summary-raw {
  margin: 0;
  padding: 0.5rem 0.6rem;
  max-height: 320px;
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

[data-theme="dark"] .run-summary-icon,
[data-theme="dark"] .run-summary-subtitle,
[data-theme="dark"] .run-summary-state,
[data-theme="dark"] .detail-label,
[data-theme="dark"] .run-summary-close { color: var(--text-muted); }
[data-theme="dark"] .run-summary-section { border-color: var(--border-color); }
[data-theme="dark"] .run-summary-section-header,
[data-theme="dark"] .run-summary-raw,
[data-theme="dark"] .run-summary-chip {
  background-color: #161a1f;
  border-color: var(--border-color);
}
[data-theme="dark"] .run-summary-prose,
[data-theme="dark"] .run-summary-group li,
[data-theme="dark"] .run-summary-raw,
[data-theme="dark"] .run-summary-chip { color: var(--text-color); }
[data-theme="dark"] .run-summary-state.is-error,
[data-theme="dark"] .run-summary-section-error { color: #e06060; }
</style>
