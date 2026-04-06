<template>
  <div class="prd-view">
    <div class="prd-header">
      <h2>Product Requirements Document</h2>
    </div>
    <div v-if="loading" class="prd-loading">Loading PRD...</div>
    <div v-else-if="error" class="prd-error">{{ error }}</div>
    <div v-else class="prd-content markdown-body" v-html="renderedContent"></div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { marked } from 'marked';

export default {
  name: 'PrdView',
  setup() {
    const content = ref('');
    const loading = ref(true);
    const error = ref(null);

    const renderedContent = computed(() => {
      if (!content.value) return '';
      return marked(content.value, { breaks: true, gfm: true });
    });

    onMounted(async () => {
      try {
        const result = await window.electron.ipcRenderer.invoke('prd:read');
        content.value = result.content || '';
      } catch (e) {
        error.value = 'Failed to load PRD: ' + (e.message || e);
      } finally {
        loading.value = false;
      }
    });

    return { content, loading, error, renderedContent };
  }
};
</script>

<style scoped>
.prd-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #fff;
}

.prd-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e1e4e8;
}

.prd-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #2c3e50;
}

.prd-loading,
.prd-error {
  padding: 2rem 1.5rem;
  color: #6b778c;
  font-size: 0.9rem;
}

.prd-error {
  color: #e74c3c;
}

.prd-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  font-size: 0.875rem;
  line-height: 1.6;
}

/* Markdown styling (matches FeaturesTable) */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: #2c3e50;
}

.markdown-body :deep(h1) { font-size: 1.25rem; border-bottom: 1px solid #e1e4e8; padding-bottom: 0.3rem; }
.markdown-body :deep(h2) { font-size: 1.1rem; border-bottom: 1px solid #e1e4e8; padding-bottom: 0.2rem; }
.markdown-body :deep(h3) { font-size: 1rem; }
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) { font-size: 0.9rem; }

.markdown-body :deep(p) {
  margin: 0.5rem 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
}

.markdown-body :deep(li) {
  margin: 0.25rem 0;
}

.markdown-body :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85em;
  background-color: #e9ecef;
  padding: 0.15rem 0.35rem;
  border-radius: 3px;
}

.markdown-body :deep(pre) {
  background-color: #2d333b;
  color: #c9d1d9;
  padding: 0.75rem;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0.5rem 0;
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
}

.markdown-body :deep(blockquote) {
  margin: 0.5rem 0;
  padding-left: 1rem;
  border-left: 4px solid #4a90e2;
  color: #6b778c;
}

.markdown-body :deep(a) {
  color: #4a90e2;
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5rem 0;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid #e1e4e8;
  padding: 0.4rem 0.6rem;
  text-align: left;
}

.markdown-body :deep(th) {
  background-color: #f1f2f4;
  font-weight: 600;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid #e1e4e8;
  margin: 1rem 0;
}

.markdown-body :deep(strong) {
  font-weight: 600;
}

.markdown-body :deep(em) {
  font-style: italic;
}
</style>
