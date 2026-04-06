<template>
  <section class="agents-view">
    <header class="agents-header">
      <div class="agents-header-row">
        <div>
          <h2>Coding Tools</h2>
          <p>Configure available coding agents and their execution limits.</p>
        </div>
        <button type="button" class="btn-primary" @click="showAddDialog = true">Add Tool</button>
      </div>
    </header>

    <div v-if="showAddDialog" class="modal-overlay" @click.self="cancelAdd">
      <div class="modal">
        <h3>Add Tool</h3>
        <form class="tool-form" @submit.prevent="submitAdd">
          <div class="tool-grid">
            <label>
              Name
              <input v-model="newTool.name" type="text" required placeholder="Claude" />
            </label>
            <label>
              Command
              <input v-model="newTool.command" type="text" required placeholder="/usr/local/bin/claude" />
            </label>
            <label>
              Max Concurrent
              <input v-model.number="newTool.maxConcurrentRuns" type="number" min="1" required />
            </label>
            <label>
              Cool-down (min)
              <input v-model.number="newTool.cooldownMinutes" type="number" min="0" required />
            </label>
            <label class="enabled-checkbox">
              <input v-model="newTool.enabled" type="checkbox" />
              Enabled
            </label>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn-primary">Add Tool</button>
            <button type="button" class="btn-secondary" @click="cancelAdd">Cancel</button>
          </div>
          <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
        </form>
      </div>
    </div>

    <div class="tool-list" v-if="tools.length > 0">
      <article v-for="tool in tools" :key="tool.id" class="tool-card" :class="{ disabled: !tool.enabled }">
        <form v-if="editingId === tool.id" class="tool-form" @submit.prevent="submitEdit(tool.id)">
          <div class="tool-grid">
            <label>
              Name
              <input v-model="editDraft.name" type="text" required />
            </label>
            <label>
              Command
              <input v-model="editDraft.command" type="text" required />
            </label>
            <label>
              Max Concurrent
              <input v-model.number="editDraft.maxConcurrentRuns" type="number" min="1" required />
            </label>
            <label>
              Cool-down (min)
              <input v-model.number="editDraft.cooldownMinutes" type="number" min="0" required />
            </label>
            <label class="enabled-checkbox">
              <input v-model="editDraft.enabled" type="checkbox" />
              Enabled
            </label>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn-primary">Save</button>
            <button type="button" class="btn-secondary" @click="cancelEdit">Cancel</button>
          </div>
        </form>

        <div v-else class="tool-summary" @dblclick="startEdit(tool)">
          <div class="tool-top-row">
            <div class="tool-main">
              <h3>{{ tool.name }}</h3>
              <p>{{ tool.command }}</p>
            </div>
            <button type="button" class="btn-secondary" @click="toggleExpand(tool.id)">
              {{ isExpanded(tool.id) ? 'Hide Models' : 'Show Models' }}
            </button>
          </div>
          <dl class="tool-meta">
            <div><dt>Concurrent</dt><dd>{{ tool.maxConcurrentRuns }}</dd></div>
            <div><dt>Cool-down</dt><dd>{{ tool.cooldownMinutes }}m</dd></div>
            <div><dt>Enabled</dt><dd>{{ tool.enabled ? 'Yes' : 'No' }}</dd></div>
            <div><dt>Models</dt><dd>{{ tool.models?.length || 0 }}</dd></div>
          </dl>
          <div class="card-actions">
            <button type="button" class="btn-secondary" @click="startEdit(tool)">Edit</button>
            <button type="button" class="btn-secondary" @click="toggleEnabled(tool)">
              {{ tool.enabled ? 'Disable' : 'Enable' }}
            </button>
            <button type="button" class="btn-danger" @click="removeTool(tool)">Delete</button>
          </div>
        </div>

        <section v-if="isExpanded(tool.id)" class="models-section">
          <header class="models-header">
            <h4>Models</h4>
          </header>

          <div v-if="(tool.models || []).length > 0" class="model-list">
            <article
              v-for="model in tool.models"
              :key="model.id"
              class="model-row"
              :class="{ disabled: !model.enabled }"
            >
              <form
                v-if="editingModelToolId === tool.id && editingModelId === model.id"
                class="model-edit-form"
                @submit.prevent="submitModelEdit(tool.id, model.id)"
              >
                <label>
                  Name
                  <input v-model="editModelDraft.name" type="text" required />
                </label>
                <label>
                  Identifier
                  <input v-model="editModelDraft.modelId" type="text" required />
                </label>
                <label>
                  Rate / hr
                  <input v-model.number="editModelDraft.ratePerHour" type="number" min="0" step="0.1" required />
                </label>
                <label class="enabled-checkbox">
                  <input v-model="editModelDraft.enabled" type="checkbox" />
                  Enabled
                </label>
                <div class="form-actions">
                  <button type="submit" class="btn-primary">Save</button>
                  <button type="button" class="btn-secondary" @click="cancelModelEdit">Cancel</button>
                </div>
              </form>

              <template v-else>
                <div class="model-fields">
                  <div><span>Name</span><strong>{{ model.name }}</strong></div>
                  <div><span>Identifier</span><strong>{{ model.modelId }}</strong></div>
                  <div><span>Rate</span><strong>{{ model.ratePerHour }}/hr</strong></div>
                  <div><span>Enabled</span><strong>{{ model.enabled ? 'Yes' : 'No' }}</strong></div>
                </div>
                <div class="card-actions">
                  <button type="button" class="btn-secondary" @click="startModelEdit(tool.id, model)">Edit</button>
                  <button type="button" class="btn-secondary" @click="toggleModelEnabled(tool.id, model)">
                    {{ model.enabled ? 'Disable' : 'Enable' }}
                  </button>
                  <button type="button" class="btn-danger" @click="removeModel(tool, model)">Delete</button>
                </div>
              </template>
            </article>
          </div>

          <p v-else class="empty-state model-empty">No models configured for this tool yet.</p>

          <form class="model-add-form" @submit.prevent="submitAddModel(tool.id)">
            <h5>Add Model</h5>
            <div class="tool-grid model-grid">
              <label>
                Name
                <input v-model="getModelDraft(tool.id).name" type="text" required placeholder="Opus 4.6" />
              </label>
              <label>
                Identifier
                <input
                  v-model="getModelDraft(tool.id).modelId"
                  type="text"
                  required
                  placeholder="claude-opus-4-6"
                />
              </label>
              <label>
                Rate / hr
                <input
                  v-model.number="getModelDraft(tool.id).ratePerHour"
                  type="number"
                  min="0"
                  step="0.1"
                  required
                />
              </label>
              <label class="enabled-checkbox">
                <input v-model="getModelDraft(tool.id).enabled" type="checkbox" />
                Enabled
              </label>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn-primary">Add Model</button>
            </div>
          </form>
        </section>
      </article>
    </div>

    <p v-else class="empty-state">No coding tools configured yet. Click "Add Tool" to get started.</p>


  </section>
</template>

<script>
import { computed, onMounted, reactive, ref } from 'vue';
import { useAgentToolsStore } from '@/stores/agentToolsStore';

function createDefaultDraft() {
  return {
    name: '',
    command: '',
    rollingWindowHours: 5,
    maxConcurrentRuns: 1,
    cooldownMinutes: 5,
    enabled: true,
    budgetLimit: 0
  };
}

function createDefaultModelDraft() {
  return {
    name: '',
    modelId: '',
    ratePerHour: 1,

    enabled: true
  };
}

export default {
  name: 'AgentsToolsView',
  setup() {
    const toolsStore = useAgentToolsStore();
    const tools = computed(() => toolsStore.tools);

    const newTool = reactive(createDefaultDraft());
    const editingId = ref('');
    const editDraft = reactive(createDefaultDraft());

    const expandedToolIds = ref([]);
    const modelDrafts = reactive({});
    const editingModelToolId = ref('');
    const editingModelId = ref('');
    const editModelDraft = reactive(createDefaultModelDraft());

    const showAddDialog = ref(false);
    const errorMessage = ref('');

    onMounted(async () => {
      await toolsStore.loadAgents();
    });


    function resetNewTool() {
      Object.assign(newTool, createDefaultDraft());
    }

    function ensureModelDraft(toolId) {
      if (!modelDrafts[toolId]) {
        modelDrafts[toolId] = createDefaultModelDraft();
      }
      return modelDrafts[toolId];
    }

    function getModelDraft(toolId) {
      return ensureModelDraft(toolId);
    }

    function resetModelDraft(toolId) {
      modelDrafts[toolId] = createDefaultModelDraft();
    }

    function submitAdd() {
      errorMessage.value = '';
      try {
        toolsStore.addTool(newTool);
        resetNewTool();
        showAddDialog.value = false;
      } catch (error) {
        errorMessage.value = error?.message || 'Failed to add tool';
      }
    }

    function cancelAdd() {
      showAddDialog.value = false;
      errorMessage.value = '';
      resetNewTool();
    }

    function startEdit(tool) {
      editingId.value = tool.id;
      Object.assign(editDraft, {
        name: tool.name,
        command: tool.command,
        rollingWindowHours: tool.rollingWindowHours,
        maxConcurrentRuns: tool.maxConcurrentRuns,
        cooldownMinutes: tool.cooldownMinutes,
        budgetLimit: tool.budgetLimit || 0,
        enabled: tool.enabled
      });
      errorMessage.value = '';
    }

    function submitEdit(toolId) {
      errorMessage.value = '';
      try {
        toolsStore.updateTool(toolId, editDraft);
        editingId.value = '';
      } catch (error) {
        errorMessage.value = error?.message || 'Failed to update tool';
      }
    }

    function cancelEdit() {
      editingId.value = '';
      errorMessage.value = '';
    }

    function toggleEnabled(tool) {
      toolsStore.toggleToolEnabled(tool.id);
    }

    function removeTool(tool) {
      const confirmed = window.confirm(`Delete coding tool "${tool.name}"?`);
      if (!confirmed) return;
      toolsStore.deleteTool(tool.id);
      expandedToolIds.value = expandedToolIds.value.filter((id) => id !== tool.id);
      if (editingId.value === tool.id) {
        editingId.value = '';
      }
      if (editingModelToolId.value === tool.id) {
        cancelModelEdit();
      }
      delete modelDrafts[tool.id];
    }

    function isExpanded(toolId) {
      return expandedToolIds.value.includes(toolId);
    }

    function toggleExpand(toolId) {
      if (isExpanded(toolId)) {
        expandedToolIds.value = expandedToolIds.value.filter((id) => id !== toolId);
      } else {
        expandedToolIds.value = [...expandedToolIds.value, toolId];
      }
    }

    function submitAddModel(toolId) {
      errorMessage.value = '';
      const modelDraft = ensureModelDraft(toolId);
      try {
        toolsStore.addModel(toolId, modelDraft);
        resetModelDraft(toolId);
        if (!isExpanded(toolId)) {
          toggleExpand(toolId);
        }
      } catch (error) {
        errorMessage.value = error?.message || 'Failed to add model';
      }
    }

    function startModelEdit(toolId, model) {
      editingModelToolId.value = toolId;
      editingModelId.value = model.id;
      Object.assign(editModelDraft, {
        name: model.name,
        modelId: model.modelId,
        ratePerHour: model.ratePerHour,

        enabled: model.enabled
      });
      errorMessage.value = '';
    }

    function submitModelEdit(toolId, modelId) {
      errorMessage.value = '';
      try {
        toolsStore.updateModel(toolId, modelId, editModelDraft);
        cancelModelEdit();
      } catch (error) {
        errorMessage.value = error?.message || 'Failed to update model';
      }
    }

    function cancelModelEdit() {
      editingModelToolId.value = '';
      editingModelId.value = '';
      Object.assign(editModelDraft, createDefaultModelDraft());
    }

    function toggleModelEnabled(toolId, model) {
      toolsStore.toggleModelEnabled(toolId, model.id);
    }

    function removeModel(tool, model) {
      const confirmed = window.confirm(`Delete model "${model.name}" from ${tool.name}?`);
      if (!confirmed) return;
      toolsStore.deleteModel(tool.id, model.id);
      if (editingModelToolId.value === tool.id && editingModelId.value === model.id) {
        cancelModelEdit();
      }
    }

    return {
      tools,
      newTool,
      showAddDialog,
      editingId,
      editDraft,
      errorMessage,
      submitAdd,
      cancelAdd,
      startEdit,
      submitEdit,
      cancelEdit,
      toggleEnabled,
      removeTool,
      isExpanded,
      toggleExpand,
      getModelDraft,
      editingModelToolId,
      editingModelId,
      editModelDraft,
      submitAddModel,
      startModelEdit,
      submitModelEdit,
      cancelModelEdit,
      toggleModelEnabled,
      removeModel,

    };
  }
};
</script>

<style scoped>
.agents-view {
  flex: 1;
  overflow: auto;
  padding: 1.5rem;
  background: linear-gradient(180deg, #f7f9fc 0%, #edf2f7 100%);
}

.agents-header h2 {
  font-size: 1.35rem;
  color: #172b4d;
}

.agents-header p {
  margin-top: 0.2rem;
  color: #5e6c84;
}

.tool-list {
  display: grid;
  gap: 0.9rem;
  margin-top: 0.9rem;
}

.tool-card {
  border: 1px solid #dfe1e6;
  border-radius: 8px;
  background: #fff;
  padding: 1rem;
}

.tool-card.disabled {
  opacity: 0.75;
}

.tool-form {
  display: grid;
  gap: 0.75rem;
}

.agents-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  width: 90%;
  max-width: 560px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.modal h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1.1rem;
  color: #172b4d;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 0.75rem;
}

.tool-grid label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.82rem;
  color: #42526e;
}

.tool-grid input[type='text'],
.tool-grid input[type='number'] {
  border: 1px solid #d0d7de;
  border-radius: 6px;
  padding: 0.5rem 0.55rem;
  font-size: 0.9rem;
}

.enabled-checkbox {
  align-content: center;
}

.enabled-checkbox input {
  margin-right: 0.4rem;
}

.form-actions {
  display: flex;
  gap: 0.5rem;
}

.tool-summary {
  display: grid;
  gap: 0.75rem;
}

.tool-top-row {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 0.75rem;
}

.tool-main h3 {
  font-size: 1.05rem;
  color: #172b4d;
}

.tool-main p {
  margin-top: 0.25rem;
  color: #6b778c;
  word-break: break-word;
}

.tool-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 0.5rem;
}

.tool-meta div {
  background: #f7f9fc;
  border: 1px solid #ebecf0;
  border-radius: 6px;
  padding: 0.5rem;
}

.tool-meta dt {
  font-size: 0.72rem;
  color: #6b778c;
}

.tool-meta dd {
  margin-top: 0.2rem;
  font-weight: 600;
  color: #172b4d;
}

.models-section {
  margin-top: 0.9rem;
  border-top: 1px solid #ebecf0;
  padding-top: 0.9rem;
  display: grid;
  gap: 0.75rem;
}

.models-header h4 {
  font-size: 0.95rem;
  color: #172b4d;
}

.model-list {
  display: grid;
  gap: 0.6rem;
}

.model-row {
  border: 1px solid #ebecf0;
  border-radius: 6px;
  background: #fafbfc;
  padding: 0.7rem;
  display: grid;
  gap: 0.6rem;
}

.model-row.disabled {
  opacity: 0.7;
}

.model-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.5rem;
}

.model-fields div {
  display: grid;
  gap: 0.15rem;
}

.model-fields span {
  font-size: 0.72rem;
  color: #6b778c;
}

.model-fields strong {
  color: #172b4d;
  font-weight: 600;
}

.model-edit-form {
  display: grid;
  gap: 0.6rem;
}

.model-edit-form label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.82rem;
  color: #42526e;
}

.model-edit-form input[type='text'],
.model-edit-form input[type='number'] {
  border: 1px solid #d0d7de;
  border-radius: 6px;
  padding: 0.45rem 0.55rem;
  font-size: 0.88rem;
}

.model-add-form {
  border: 1px dashed #c7d1dc;
  border-radius: 6px;
  padding: 0.8rem;
  background: #fff;
}

.model-add-form h5 {
  font-size: 0.85rem;
  color: #172b4d;
  margin-bottom: 0.55rem;
}

.model-grid {
  margin-bottom: 0.55rem;
}

.model-empty {
  margin-top: 0;
}

.card-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn-primary,
.btn-secondary,
.btn-danger {
  border: none;
  border-radius: 6px;
  padding: 0.45rem 0.8rem;
  font-size: 0.82rem;
  cursor: pointer;
}

.btn-primary {
  background: #0c66e4;
  color: #fff;
}

.btn-secondary {
  background: #dfe1e6;
  color: #172b4d;
}

.btn-danger {
  background: #c9372c;
  color: #fff;
}

.error-message {
  color: #c9372c;
  font-size: 0.82rem;
}

.empty-state {
  margin-top: 1rem;
  color: #5e6c84;
}

@media (max-width: 860px) {
  .agents-view {
    padding: 1rem;
  }
}


</style>
