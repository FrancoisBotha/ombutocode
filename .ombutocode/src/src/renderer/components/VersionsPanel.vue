<template>
  <div
    v-if="open"
    class="versions-panel-layer"
    @click.self="$emit('close')"
  >
    <aside class="versions-panel" aria-label="Version history">
      <header class="versions-panel__header">
        <div>
          <p class="versions-panel__eyebrow">Version history</p>
          <h2>Versions</h2>
        </div>
        <button
          class="versions-panel__close"
          type="button"
          aria-label="Close versions panel"
          @click="$emit('close')"
        >
          x
        </button>
      </header>

      <div v-if="loading" class="versions-panel__state">
        <p>Loading versions...</p>
      </div>

      <div v-else-if="!entries.length" class="versions-panel__state">
        <p>No committed versions found.</p>
      </div>

      <ul v-else class="versions-panel__list">
        <li v-for="(entry, index) in entries" :key="entry.hash">
          <button
            v-if="index !== 0"
            class="version-entry"
            type="button"
            :title="entry.message"
            @click="$emit('select-version', entry.hash)"
          >
            <div class="version-entry__topline">
              <strong>{{ formatDate(entry.date) }}</strong>
            </div>
            <p class="version-entry__message">{{ truncateMessage(entry.message) }}</p>
            <p class="version-entry__author">{{ entry.author }}</p>
          </button>

          <div v-else class="version-entry version-entry--current" :title="entry.message">
            <div class="version-entry__topline">
              <strong>{{ formatDate(entry.date) }}</strong>
              <span class="version-entry__badge">Current</span>
            </div>
            <p class="version-entry__message">{{ truncateMessage(entry.message) }}</p>
            <p class="version-entry__author">{{ entry.author }}</p>
          </div>
        </li>
      </ul>
    </aside>
  </div>
</template>

<script>
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export default {
  name: 'VersionsPanel',
  props: {
    entries: {
      type: Array,
      default: () => [],
    },
    loading: {
      type: Boolean,
      default: false,
    },
    open: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['close', 'select-version'],
  methods: {
    formatDate(value) {
      if (!value) {
        return 'Unknown date';
      }

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return value;
      }

      const parts = dateFormatter.formatToParts(parsed);
      const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return `${partMap.month} ${partMap.day}, ${partMap.year} ${partMap.hour}:${partMap.minute} ${partMap.dayPeriod}`;
    },
    truncateMessage(message) {
      if (!message) {
        return 'No commit message';
      }

      return message.length > 80 ? `${message.slice(0, 77)}...` : message;
    },
  },
};
</script>

<style scoped>
.versions-panel-layer {
  align-items: stretch;
  background: rgba(15, 23, 42, 0.28);
  display: flex;
  inset: 0;
  justify-content: flex-end;
  position: fixed;
  z-index: 30;
}

.versions-panel {
  background: var(--card-bg);
  border-left: 1px solid var(--border-color);
  box-shadow: -20px 0 40px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 100%;
  padding: 1rem;
  width: 300px;
}

.versions-panel__header {
  align-items: flex-start;
  display: flex;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.versions-panel__eyebrow {
  color: var(--text-muted);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  margin: 0 0 0.3rem;
  text-transform: uppercase;
}

.versions-panel__header h2 {
  color: var(--text-color);
  font-size: 1.1rem;
  margin: 0;
}

.versions-panel__close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 1.5rem;
  line-height: 1;
  padding: 0;
}

.versions-panel__state {
  color: var(--text-muted);
  padding: 1rem 0.25rem;
}

.versions-panel__state p {
  margin: 0;
}

.versions-panel__list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  overflow-y: auto;
  padding: 0;
}

.version-entry {
  background: #fff;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  color: inherit;
  display: block;
  padding: 0.85rem;
  text-align: left;
  transition: var(--transition);
  width: 100%;
}

button.version-entry {
  cursor: pointer;
}

button.version-entry:hover {
  border-color: var(--primary-color);
  transform: translateX(-2px);
}

.version-entry--current {
  background: rgba(37, 99, 235, 0.08);
  border-color: rgba(37, 99, 235, 0.3);
}

.version-entry__topline {
  align-items: center;
  color: var(--text-color);
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
  margin-bottom: 0.45rem;
}

.version-entry__badge {
  background: rgba(37, 99, 235, 0.14);
  border-radius: 999px;
  color: var(--primary-color);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.18rem 0.55rem;
}

.version-entry__message,
.version-entry__author {
  margin: 0;
}

.version-entry__message {
  color: var(--text-color);
  line-height: 1.45;
}

.version-entry__author {
  color: var(--text-muted);
  font-size: 0.82rem;
  margin-top: 0.45rem;
}
</style>
