<template>
  <div class="settings-view">
    <div class="settings-header">
      <h1>Settings</h1>
      <div class="settings-tabs">
        <button
          class="settings-tab"
          :class="{ 'is-active': settingsTab === 'general' }"
          @click="settingsTab = 'general'"
        >
          <span class="mdi mdi-cog-outline"></span>
          General
        </button>
        <button
          class="settings-tab"
          :class="{ 'is-active': settingsTab === 'agents' }"
          @click="settingsTab = 'agents'"
        >
          <span class="mdi mdi-robot-outline"></span>
          Coding Agents
        </button>
      </div>
    </div>

    <!-- ===== General Tab ===== -->
    <div v-if="settingsTab === 'general'" class="settings-content">
      <!-- Appearance Section -->
      <section class="settings-section">
        <div class="section-header">
          <span class="section-icon mdi mdi-palette-outline"></span>
          <div class="section-title-group">
            <h2>Appearance</h2>
            <p class="section-description">Customize the look and feel of the app</p>
          </div>
        </div>
        <div class="section-content">
          <div class="setting-item">
            <div class="setting-label">
              <span class="setting-name">Theme</span>
              <span class="setting-hint">Switch between light and dark mode</span>
            </div>
            <div class="setting-control">
              <div class="theme-switcher">
                <button
                  class="theme-btn"
                  :class="{ active: currentTheme === 'light' }"
                  :disabled="loading"
                  @click="updateTheme('light')"
                >
                  <span class="mdi mdi-white-balance-sunny"></span>
                  Light
                </button>
                <button
                  class="theme-btn"
                  :class="{ active: currentTheme === 'dark' }"
                  :disabled="loading"
                  @click="updateTheme('dark')"
                >
                  <span class="mdi mdi-weather-night"></span>
                  Dark
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Project Section -->
      <section class="settings-section">
        <div class="section-header">
          <span class="section-icon mdi mdi-folder-outline"></span>
          <div class="section-title-group">
            <h2>Project</h2>
            <p class="section-description">General project identification</p>
          </div>
        </div>
        <div class="section-content">
          <div class="setting-item">
            <div class="setting-label">
              <span class="setting-name">Project Name</span>
              <span class="setting-hint">Display name for this project</span>
            </div>
            <div class="setting-control">
              <input
                type="text"
                v-model="projectNameInput"
                @change="updateProjectName"
                :disabled="loading"
                placeholder="Enter project name"
                class="project-name-input"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- App Sync Section -->
      <section class="settings-section">
        <div class="section-header">
          <span class="section-icon mdi mdi-sync"></span>
          <div class="section-title-group">
            <h2>App Sync</h2>
            <p class="section-description">Configure how often the app syncs with backlog data</p>
          </div>
        </div>
        <div class="section-content">
          <div class="setting-item">
            <div class="setting-label">
              <span class="setting-name">App Refresh Time (seconds)</span>
              <span class="setting-hint">How often to sync with the backlog database (minimum 1 second)</span>
            </div>
            <div class="setting-control">
              <div class="refresh-interval-control" :class="{ 'is-loading': loading }">
                <input
                  type="number"
                  v-model.number="refreshIntervalInput"
                  @change="updateRefreshInterval"
                  :disabled="loading"
                  min="1"
                  class="refresh-interval-input"
                />
                <span class="refresh-interval-unit">seconds</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Notifications Section -->
      <section class="settings-section">
        <div class="section-header">
          <span class="section-icon mdi mdi-bell-outline"></span>
          <div class="section-title-group">
            <h2>Notifications</h2>
            <p class="section-description">Configure notification sounds and alerts</p>
          </div>
        </div>
        <div class="section-content">
          <div class="setting-item">
            <div class="setting-label">
              <span class="setting-name">Review Column Sound</span>
              <span class="setting-hint">Play a bell sound when tickets move to the Review column</span>
            </div>
            <div class="setting-control">
              <label class="toggle-switch" :class="{ 'is-loading': loading }">
                <input
                  type="checkbox"
                  v-model="reviewSoundEnabled"
                  @change="updateReviewSound"
                  :disabled="loading"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <!-- Database Section -->
      <section class="settings-section">
        <div class="section-header">
          <span class="section-icon mdi mdi-database-outline"></span>
          <div class="section-title-group">
            <h2>Database</h2>
            <p class="section-description">Export or import the ticket database for backup or transfer between machines</p>
          </div>
        </div>
        <div class="section-content">
          <div class="setting-item">
            <div class="setting-label">
              <span class="setting-name">Export Database</span>
              <span class="setting-hint">Save the current ticket database to a file</span>
            </div>
            <div class="setting-control">
              <button
                class="db-action-btn"
                :disabled="dbExporting"
                @click="exportDb"
              >
                <span v-if="dbExporting" class="mdi mdi-loading mdi-spin"></span>
                <span v-else class="mdi mdi-database-export-outline"></span>
                Export
              </button>
            </div>
          </div>
          <div class="setting-item" style="margin-top: 1rem;">
            <div class="setting-label">
              <span class="setting-name">Import Database</span>
              <span class="setting-hint">Replace the current database with an imported file</span>
            </div>
            <div class="setting-control">
              <button
                class="db-action-btn db-action-btn--warning"
                :disabled="dbImporting"
                @click="importDb"
              >
                <span v-if="dbImporting" class="mdi mdi-loading mdi-spin"></span>
                <span v-else class="mdi mdi-database-import-outline"></span>
                Import
              </button>
            </div>
          </div>
          <div v-if="dbMessage" class="feedback-message" :class="dbMessageType" style="margin-top: 1rem;">
            <span class="mdi" :class="dbMessageType === 'success' ? 'mdi-check-circle-outline' : 'mdi-alert-circle-outline'"></span>
            <span>{{ dbMessage }}</span>
          </div>
        </div>
      </section>

      <!-- Evaluation Section -->
      <section class="settings-section">
        <div class="section-header">
          <span class="section-icon mdi mdi-robot-outline"></span>
          <div class="section-title-group">
            <h2>Evaluation</h2>
            <p class="section-description">Configure default EVAL agent selection</p>
          </div>
        </div>
        <div class="section-content">
          <div class="setting-item">
            <div class="setting-label">
              <span class="setting-name">EVAL Agent</span>
              <span class="setting-hint">Select the default coding agent for EVAL-stage work</span>
            </div>
            <div class="setting-control">
              <div class="agent-selector" :class="{ 'is-loading': loading || agentsLoading }">
                <select
                  v-model="selectedAgent"
                  @change="updateEvalAgent"
                  :disabled="loading || agentsLoading || availableAgents.length === 0"
                  class="agent-select"
                >
                  <option value="">-- No agent selected --</option>
                  <option
                    v-for="agent in availableAgents"
                    :key="agent.id"
                    :value="agent.id"
                  >
                    {{ agent.name }}
                  </option>
                </select>
                <span v-if="agentsLoading" class="mdi mdi-loading mdi-spin"></span>
              </div>
            </div>
          </div>

          <!-- EVAL Model Selector -->
          <div class="setting-item" v-if="selectedAgent">
            <div class="setting-label">
              <span class="setting-name">EVAL Model</span>
              <span class="setting-hint">Select the model to use for evaluations (or let the scheduler pick any enabled model)</span>
            </div>
            <div class="setting-control">
              <div class="agent-selector" :class="{ 'is-loading': loading || agentsLoading }">
                <select
                  v-model="selectedEvalModel"
                  @change="updateEvalModel"
                  :disabled="loading || agentsLoading || evalAgentModels.length === 0"
                  class="agent-select"
                >
                  <option value="">-- Any model --</option>
                  <option
                    v-for="model in evalAgentModels"
                    :key="model.id"
                    :value="model.id"
                  >
                    {{ model.name }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <!-- Ad Hoc Ticket Agent Selector -->
          <div class="setting-item">
            <div class="setting-label">
              <span class="setting-name">Ad Hoc Ticket Agent</span>
              <span class="setting-hint">Select the agent for creating ad-hoc tickets from prompts</span>
            </div>
            <div class="setting-control">
              <div class="agent-selector" :class="{ 'is-loading': loading || agentsLoading }">
                <select
                  v-model="selectedAdHocAgent"
                  @change="updateAdHocAgent"
                  :disabled="loading || agentsLoading || availableAgents.length === 0"
                  class="agent-select"
                >
                  <option value="">-- Use EVAL Agent --</option>
                  <option
                    v-for="agent in availableAgents"
                    :key="agent.id"
                    :value="agent.id"
                  >
                    {{ agent.name }}
                  </option>
                </select>
                <span v-if="agentsLoading" class="mdi mdi-loading mdi-spin"></span>
              </div>
            </div>
          </div>

          <!-- Ad Hoc Ticket Model Selector -->
          <div class="setting-item" v-if="effectiveAdHocAgent">
            <div class="setting-label">
              <span class="setting-name">Ad Hoc Ticket Model</span>
              <span class="setting-hint">Select the model to use for ad-hoc ticket creation (or let the agent pick)</span>
            </div>
            <div class="setting-control">
              <div class="agent-selector" :class="{ 'is-loading': loading || agentsLoading }">
                <select
                  v-model="selectedAdHocModel"
                  @change="updateAdHocModel"
                  :disabled="loading || agentsLoading || adHocAgentModels.length === 0"
                  class="agent-select"
                >
                  <option value="">-- Any model --</option>
                  <option
                    v-for="model in adHocAgentModels"
                    :key="model.id"
                    :value="model.id"
                  >
                    {{ model.name }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <!-- Max Eval Retries Setting -->
          <div class="setting-item">
            <div class="setting-label">
              <span class="setting-name">Max Evaluation Retries</span>
              <span class="setting-hint">Maximum times a ticket can fail evaluation before being blocked from automation (0 = unlimited)</span>
            </div>
            <div class="setting-control">
              <div class="refresh-interval-control" :class="{ 'is-loading': loading }">
                <input
                  type="number"
                  v-model.number="maxEvalRetriesInput"
                  @change="updateMaxEvalRetries"
                  :disabled="loading"
                  min="0"
                  class="refresh-interval-input"
                />
                <span class="refresh-interval-unit">retries</span>
              </div>
            </div>
          </div>

          <!-- Empty State Message -->
          <div v-if="!agentsLoading && availableAgents.length === 0" class="empty-state-message">
            <span class="mdi mdi-information-outline"></span>
            <span>No coding agents configured. Add agents in the <strong>Agents/Tools</strong> section.</span>
          </div>

          <!-- Feedback Messages -->
          <div v-if="saveStatus === 'success'" class="feedback-message success">
            <span class="mdi mdi-check-circle-outline"></span>
            <span>Settings saved successfully</span>
          </div>
          <div v-if="saveStatus === 'error'" class="feedback-message error">
            <span class="mdi mdi-alert-circle-outline"></span>
            <span>{{ error || 'Failed to save settings' }}</span>
          </div>
          <div v-if="loading" class="feedback-message info">
            <span class="mdi mdi-loading mdi-spin"></span>
            <span>Saving...</span>
          </div>
        </div>
      </section>

    </div>

    <!-- ===== Coding Agents Tab ===== -->
    <div v-if="settingsTab === 'agents'" class="settings-content">
      <div class="agent-test-list">
        <div v-for="agent in agentTests" :key="agent.id" class="agent-test-card">
          <div class="agent-test-row">
            <div class="agent-test-info">
              <span class="agent-test-name">{{ agent.name }}</span>
              <label class="agent-active-checkbox" :title="agent.enabled ? 'Disable ' + agent.name : 'Enable ' + agent.name">
                <input
                  type="checkbox"
                  :checked="agent.enabled"
                  @change="toggleAgentEnabled(agent)"
                />
                <span class="agent-active-label">Active</span>
              </label>
              <span v-if="agent.detail" class="agent-test-detail-inline">{{ agent.detail }}</span>
            </div>
            <div class="agent-concurrent-inline" title="Max concurrent runs">
              <label class="agent-concurrent-inline-label">Max Concurrent</label>
              <input
                type="number"
                min="1"
                max="10"
                class="agent-concurrent-inline-input"
                :value="getAgentConcurrent(agent.id)"
                @change="setAgentConcurrent(agent.id, $event.target.value)"
              />
            </div>
            <label class="agent-default-radio" :title="'Set ' + agent.name + ' as default agent'">
              <span class="agent-default-label">Default</span>
              <input
                type="radio"
                name="defaultAgent"
                :value="agent.id"
                :checked="defaultAgentId === agent.id"
                @change="setDefaultAgent(agent.id)"
              />
            </label>
            <div class="agent-test-status">
              <span v-if="agent.status === 'idle'" class="agent-badge agent-badge-idle">Not tested</span>
              <span v-else-if="agent.status === 'testing'" class="agent-badge agent-badge-testing">
                <span class="mdi mdi-loading mdi-spin"></span> Testing...
              </span>
              <span v-else-if="agent.status === 'pass'" class="agent-badge agent-badge-pass">
                <span class="mdi mdi-check-circle"></span> Connected
              </span>
              <span v-else-if="agent.status === 'fail'" class="agent-badge agent-badge-fail">
                <span class="mdi mdi-close-circle"></span> Not available
              </span>
            </div>
            <button
              class="agent-test-btn"
              :disabled="agent.status === 'testing'"
              @click="testAgent(agent)"
            >
              Test
            </button>
          </div>
        </div>
      </div>

      <section class="settings-section agent-setup-guide">
        <div class="section-header">
          <span class="section-icon mdi mdi-book-open-outline"></span>
          <div class="section-title-group">
            <h2>Setup Guide</h2>
            <p class="section-description">How to install and configure coding agents</p>
          </div>
        </div>
        <div class="section-content agent-guide-content">
          <p class="agent-guide-intro">
            Ombuto Code launches agent CLI tools as processes — it does not call any API directly.
            Each CLI handles its own authentication. You can use an API key or the CLI's built-in login.
          </p>

          <table class="agent-guide-table">
            <thead>
              <tr><th>Agent</th><th>Install</th><th>Authentication</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Claude</strong></td>
                <td><code>npm install -g @anthropic-ai/claude-code</code></td>
                <td><code>ANTHROPIC_API_KEY</code> or <code>claude login</code></td>
              </tr>
              <tr>
                <td><strong>Codex</strong></td>
                <td><code>npm install -g @openai/codex</code></td>
                <td><code>OPENAI_API_KEY</code> or <code>codex login</code></td>
              </tr>
              <tr>
                <td><strong>Kimi</strong></td>
                <td>Per Kimi docs</td>
                <td>Per Kimi docs</td>
              </tr>
            </tbody>
          </table>

          <h3>Quick Start</h3>
          <ol class="agent-guide-steps">
            <li>Install the CLI tool (see table above)</li>
            <li>Authenticate — set the API key env var or run the CLI's login command</li>
            <li>Click <strong>Test</strong> above to verify connectivity</li>
            <li>Go to <strong>Build > Coding Agents</strong> to enable agents and configure models</li>
            <li>Create a backlog ticket with <code>assignee: claude</code> (or codex/kimi)</li>
            <li>Turn on <strong>Auto</strong> in the sidebar — the scheduler picks up tickets automatically</li>
          </ol>

          <h3>Configuration Files</h3>
          <div class="agent-guide-files">
            <div class="agent-guide-file">
              <code>.ombutocode/codingagents/codingagents.yml</code>
              <span>Agent definitions, models, rate limits</span>
            </div>
            <div class="agent-guide-file">
              <code>.ombutocode/codingagent-templates.json</code>
              <span>Command templates — controls what arguments are passed to each CLI</span>
            </div>
          </div>

          <h3>Adding a Custom Agent</h3>
          <p>
            In <strong>Build > Coding Agents</strong>, click <strong>Add Tool</strong> and provide
            a name, CLI command, max concurrent runs, and cooldown. Then add a template entry in
            <code>codingagent-templates.json</code> following the existing patterns.
          </p>
        </div>
      </section>
    </div>

  </div>
</template>

<script>
import { onMounted, computed, ref, watch } from 'vue';
import { useSettingsStore } from '../stores/settingsStore';
import { useAgentToolsStore } from '../stores/agentToolsStore';
import { useBacklogStore } from '../stores/backlogStore';

export default {
  name: 'SettingsView',
  setup() {
    const settingsStore = useSettingsStore();
    const agentToolsStore = useAgentToolsStore();
    const backlogStore = useBacklogStore();
    const settingsTab = ref('general');

    // Agent connectivity tests
    const agentTests = ref([
      { id: 'claude', name: 'Claude', command: 'claude', versionArg: '--version', status: 'idle', enabled: true, detail: '' },
      { id: 'codex', name: 'Codex', command: 'codex', versionArg: '--version', status: 'idle', enabled: true, detail: '' },
      { id: 'kimi', name: 'Kimi', command: 'kimi', versionArg: '--version', status: 'idle', enabled: true, detail: '' },
    ]);
    const agentTestRunning = ref(false);
    const defaultAgentId = ref('');

    // Load default agent from settings
    watch(() => settingsStore.settings.eval_default_agent, (val) => {
      if (val) defaultAgentId.value = val;
    }, { immediate: true });

    async function toggleAgentEnabled(agent) {
      agent.enabled = !agent.enabled;
      try {
        await window.electron.ipcRenderer.invoke('agents:toggleEnabled', agent.id, agent.enabled);
      } catch (e) {
        console.error('[Settings] Failed to toggle agent:', e);
      }
    }

    async function setDefaultAgent(agentId) {
      defaultAgentId.value = agentId;
      await settingsStore.setEvalDefaultAgent(agentId);
    }

    function getAgentModels(agentId) {
      const tool = agentToolsStore.tools.find(t => t.id === agentId);
      return tool ? tool.models.filter(m => m.enabled) : [];
    }

    function getSelectedModel(agentId) {
      // Use eval_default_model from settings if this is the default agent, otherwise first enabled model
      const tool = agentToolsStore.tools.find(t => t.id === agentId);
      if (!tool) return '';
      const settingsModel = settingsStore.settings.eval_default_model;
      if (settingsModel && tool.models.some(m => m.id === settingsModel)) return settingsModel;
      const first = tool.models.find(m => m.enabled);
      return first ? first.id : '';
    }

    async function setAgentModel(agentId, modelId) {
      if (defaultAgentId.value === agentId) {
        await settingsStore.setEvalDefaultModel(modelId);
      }
    }

    function getAgentConcurrent(agentId) {
      const tool = agentToolsStore.tools.find(t => t.id === agentId);
      return tool ? tool.maxConcurrentRuns : 1;
    }

    async function setAgentConcurrent(agentId, value) {
      const tool = agentToolsStore.tools.find(t => t.id === agentId);
      if (tool) {
        tool.maxConcurrentRuns = Math.max(1, parseInt(value) || 1);
        await agentToolsStore.saveAgents();
      }
    }

    function getAgentCooldown(agentId) {
      const tool = agentToolsStore.tools.find(t => t.id === agentId);
      return tool ? tool.cooldownMinutes : 5;
    }

    async function setAgentCooldown(agentId, value) {
      const tool = agentToolsStore.tools.find(t => t.id === agentId);
      if (tool) {
        tool.cooldownMinutes = Math.max(0, parseInt(value) || 0);
        await agentToolsStore.saveAgents();
      }
    }

    async function testAgent(agent) {
      agent.status = 'testing';
      agent.detail = '';
      try {
        const result = await window.electron.ipcRenderer.invoke('agent:testConnectivity', agent.command, agent.versionArg);
        if (result.success) {
          agent.status = 'pass';
          agent.detail = result.output.trim();
        } else {
          agent.status = 'fail';
          agent.detail = result.error || 'Command not found or not authenticated';
        }
      } catch (e) {
        agent.status = 'fail';
        agent.detail = e.message;
      }
    }

    async function testAllAgents() {
      agentTestRunning.value = true;
      for (const agent of agentTests.value) {
        await testAgent(agent);
      }
      agentTestRunning.value = false;
    }

    // Computed properties from stores
    const projectName = computed(() => settingsStore.projectName);
    const evalDefaultAgent = computed(() => settingsStore.evalDefaultAgent);
    const evalDefaultModel = computed(() => settingsStore.evalDefaultModel);
    const adHocTicketAgent = computed(() => settingsStore.adHocTicketAgent);
    const adHocTicketModel = computed(() => settingsStore.adHocTicketModel);
    const appRefreshInterval = computed(() => settingsStore.appRefreshInterval);
    const enableReviewNotificationSound = computed(() => settingsStore.enableReviewNotificationSound);
    const maxEvalRetries = computed(() => settingsStore.maxEvalRetries);
    const loading = computed(() => settingsStore.loading);
    const error = computed(() => settingsStore.error);
    const saveStatus = computed(() => settingsStore.saveStatus);
    const agentsLoading = computed(() => agentToolsStore.loading);
    const availableAgents = computed(() => agentToolsStore.tools);

    // Local state for theme
    const currentTheme = ref('light');

    // Local state for project name
    const projectNameInput = ref('');

    // Local state for agent selectors
    const selectedAgent = ref('');
    const selectedEvalModel = ref('');
    const selectedAdHocAgent = ref('');
    const selectedAdHocModel = ref('');

    // Local state for refresh interval input
    const refreshIntervalInput = ref(30);

    // Local state for review sound toggle
    const reviewSoundEnabled = ref(true);

    // Local state for max eval retries input
    const maxEvalRetriesInput = ref(2);

    // Database export/import state
    const dbExporting = ref(false);
    const dbImporting = ref(false);
    const dbMessage = ref('');
    const dbMessageType = ref('success');

    // Models available for the currently selected eval agent
    const evalAgentModels = computed(() => {
      if (!selectedAgent.value) return [];
      const agent = availableAgents.value.find(a => a.id === selectedAgent.value);
      return agent?.models?.filter(m => m.enabled) || [];
    });

    // Effective ad-hoc agent (falls back to eval agent)
    const effectiveAdHocAgent = computed(() => {
      return selectedAdHocAgent.value || selectedAgent.value || '';
    });

    // Models available for the effective ad-hoc agent
    const adHocAgentModels = computed(() => {
      if (!effectiveAdHocAgent.value) return [];
      const agent = availableAgents.value.find(a => a.id === effectiveAdHocAgent.value);
      return agent?.models?.filter(m => m.enabled) || [];
    });

    // Sync theme with store value when it loads
    const theme = computed(() => settingsStore.theme);
    watch(theme, (newValue) => {
      currentTheme.value = newValue || 'light';
    }, { immediate: true });

    // Sync projectNameInput with store value when it loads
    watch(projectName, (newValue) => {
      projectNameInput.value = newValue || '';
    }, { immediate: true });

    // Sync selectedAgent with store value when it loads
    watch(evalDefaultAgent, (newValue) => {
      selectedAgent.value = newValue || '';
    }, { immediate: true });

    // Sync selectedEvalModel with store value when it loads
    watch(evalDefaultModel, (newValue) => {
      selectedEvalModel.value = newValue || '';
    }, { immediate: true });

    // Sync selectedAdHocAgent with store value when it loads
    watch(adHocTicketAgent, (newValue) => {
      selectedAdHocAgent.value = newValue || '';
    }, { immediate: true });

    // Sync selectedAdHocModel with store value when it loads
    watch(adHocTicketModel, (newValue) => {
      selectedAdHocModel.value = newValue || '';
    }, { immediate: true });

    // Sync refreshIntervalInput with store value when it loads
    watch(appRefreshInterval, (newValue) => {
      if (newValue && newValue > 0) {
        refreshIntervalInput.value = newValue;
      }
    }, { immediate: true });

    // Sync reviewSoundEnabled with store value when it loads
    watch(enableReviewNotificationSound, (newValue) => {
      reviewSoundEnabled.value = newValue;
    }, { immediate: true });

    // Sync maxEvalRetriesInput with store value when it loads
    watch(maxEvalRetries, (newValue) => {
      if (Number.isFinite(newValue) && newValue >= 0) {
        maxEvalRetriesInput.value = newValue;
      }
    }, { immediate: true });

    // Load settings and agents when component mounts
    onMounted(async () => {
      try {
        await Promise.all([
          settingsStore.loadSettings(),
          agentToolsStore.loadAgents()
        ]);
        // Initialize selectedAgent from loaded settings
        selectedAgent.value = evalDefaultAgent.value || '';
      } catch (err) {
        console.error('[SettingsView] Failed to load settings or agents:', err);
      }

      // Load startup agent connectivity results
      try {
        if (window.electron?.ipcRenderer?.invoke) {
          const results = await window.electron.ipcRenderer.invoke('agent:getStartupResults');
          if (results) {
            for (const agent of agentTests.value) {
              const r = results[agent.id];
              if (r) {
                agent.status = r.status;
                agent.detail = r.detail || '';
                agent.enabled = r.enabled !== false;
              }
            }
          }
        }
      } catch (_) { /* startup results not yet available */ }
    });

    // Update project name setting
    async function updateProjectName() {
      const newValue = projectNameInput.value;

      // Don't save if value hasn't changed
      if (projectName.value === newValue) {
        return;
      }

      try {
        await settingsStore.setProjectName(newValue);

        // Clear success message after 3 seconds
        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 3000);
      } catch (err) {
        console.error('[SettingsView] Failed to save project name setting:', err);

        // Reset to current stored value on error
        projectNameInput.value = projectName.value || '';

        // Clear error message after 5 seconds
        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 5000);
      }
    }

    // Update theme setting
    async function updateTheme(value) {
      if (currentTheme.value === value) return;

      try {
        currentTheme.value = value;
        await settingsStore.setTheme(value);

        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 3000);
      } catch (err) {
        console.error('[SettingsView] Failed to save theme setting:', err);
        currentTheme.value = theme.value || 'light';

        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 5000);
      }
    }

    // Update EVAL default agent setting
    async function updateEvalAgent() {
      const newValue = selectedAgent.value || null;

      // Don't save if value hasn't changed
      if (evalDefaultAgent.value === newValue) {
        return;
      }

      try {
        // Reset model when agent changes
        selectedEvalModel.value = '';
        await settingsStore.saveSettings({
          eval_default_agent: newValue,
          eval_default_model: null
        });

        // Clear success message after 3 seconds
        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 3000);
      } catch (err) {
        console.error('[SettingsView] Failed to save EVAL agent setting:', err);

        // Clear error message after 5 seconds
        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 5000);
      }
    }

    // Update EVAL default model setting
    async function updateEvalModel() {
      const newValue = selectedEvalModel.value || null;

      // Don't save if value hasn't changed
      if (evalDefaultModel.value === newValue) {
        return;
      }

      try {
        await settingsStore.setEvalDefaultModel(newValue);

        // Clear success message after 3 seconds
        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 3000);
      } catch (err) {
        console.error('[SettingsView] Failed to save EVAL model setting:', err);

        // Clear error message after 5 seconds
        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 5000);
      }
    }

    // Update Ad Hoc ticket agent setting
    async function updateAdHocAgent() {
      const newValue = selectedAdHocAgent.value || null;

      // Don't save if value hasn't changed
      if (adHocTicketAgent.value === newValue) {
        return;
      }

      try {
        // Reset model when agent changes
        selectedAdHocModel.value = '';
        await settingsStore.saveSettings({
          ad_hoc_ticket_agent: newValue,
          ad_hoc_ticket_model: null
        });

        // Clear success message after 3 seconds
        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 3000);
      } catch (err) {
        console.error('[SettingsView] Failed to save Ad Hoc agent setting:', err);

        // Clear error message after 5 seconds
        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 5000);
      }
    }

    // Update Ad Hoc ticket model setting
    async function updateAdHocModel() {
      const newValue = selectedAdHocModel.value || null;

      // Don't save if value hasn't changed
      if (adHocTicketModel.value === newValue) {
        return;
      }

      try {
        await settingsStore.setAdHocTicketModel(newValue);

        // Clear success message after 3 seconds
        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 3000);
      } catch (err) {
        console.error('[SettingsView] Failed to save Ad Hoc model setting:', err);

        // Clear error message after 5 seconds
        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 5000);
      }
    }

    // Update app refresh interval setting
    async function updateRefreshInterval() {
      const newValue = refreshIntervalInput.value;
      
      // Validate value is positive integer
      if (!Number.isFinite(newValue) || newValue < 1) {
        // Reset to current stored value
        refreshIntervalInput.value = appRefreshInterval.value || 30;
        return;
      }

      // Don't save if value hasn't changed
      if (appRefreshInterval.value === newValue) {
        return;
      }

      try {
        await settingsStore.setAppRefreshInterval(newValue);
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 3000);
      } catch (err) {
        console.error('[SettingsView] Failed to save refresh interval setting:', err);
        
        // Reset to current stored value on error
        refreshIntervalInput.value = appRefreshInterval.value || 30;
        
        // Clear error message after 5 seconds
        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 5000);
      }
    }

    // Update review notification sound setting
    async function updateReviewSound() {
      const newValue = reviewSoundEnabled.value;

      // Don't save if value hasn't changed
      if (enableReviewNotificationSound.value === newValue) {
        return;
      }

      try {
        await settingsStore.setEnableReviewNotificationSound(newValue);

        // Clear success message after 3 seconds
        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 3000);
      } catch (err) {
        console.error('[SettingsView] Failed to save review sound setting:', err);

        // Reset to current stored value on error
        reviewSoundEnabled.value = enableReviewNotificationSound.value;

        // Clear error message after 5 seconds
        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 5000);
      }
    }

    // Update max eval retries setting
    async function updateMaxEvalRetries() {
      const newValue = maxEvalRetriesInput.value;

      // Validate value is non-negative integer
      if (!Number.isFinite(newValue) || newValue < 0) {
        // Reset to current stored value
        maxEvalRetriesInput.value = maxEvalRetries.value || 2;
        return;
      }

      // Don't save if value hasn't changed
      if (maxEvalRetries.value === newValue) {
        return;
      }

      try {
        await settingsStore.setMaxEvalRetries(newValue);

        // Clear success message after 3 seconds
        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 3000);
      } catch (err) {
        console.error('[SettingsView] Failed to save max eval retries setting:', err);

        // Reset to current stored value on error
        maxEvalRetriesInput.value = maxEvalRetries.value || 2;

        // Clear error message after 5 seconds
        setTimeout(() => {
          settingsStore.clearSaveStatus();
        }, 5000);
      }
    }

    function clearDbMessage() {
      setTimeout(() => { dbMessage.value = ''; }, 5000);
    }

    async function exportDb() {
      dbExporting.value = true;
      dbMessage.value = '';
      try {
        const result = await window.electron.ipcRenderer.invoke('db:export');
        if (result.canceled) {
          // User cancelled — no message needed
        } else if (result.success) {
          dbMessage.value = `Database exported to ${result.filePath}`;
          dbMessageType.value = 'success';
          clearDbMessage();
        } else {
          dbMessage.value = result.error || 'Export failed';
          dbMessageType.value = 'error';
          clearDbMessage();
        }
      } catch (err) {
        dbMessage.value = err.message || 'Export failed';
        dbMessageType.value = 'error';
        clearDbMessage();
      } finally {
        dbExporting.value = false;
      }
    }

    async function importDb() {
      dbImporting.value = true;
      dbMessage.value = '';
      try {
        const result = await window.electron.ipcRenderer.invoke('db:import');
        if (result.canceled) {
          // User cancelled — no message needed
        } else if (result.success) {
          dbMessage.value = 'Database imported successfully — backlog refreshed';
          dbMessageType.value = 'success';
          clearDbMessage();
          await backlogStore.loadBacklog();
        } else {
          dbMessage.value = result.error || 'Import failed';
          dbMessageType.value = 'error';
          clearDbMessage();
        }
      } catch (err) {
        dbMessage.value = err.message || 'Import failed';
        dbMessageType.value = 'error';
        clearDbMessage();
      } finally {
        dbImporting.value = false;
      }
    }

    return {
      currentTheme,
      updateTheme,
      projectNameInput,
      appRefreshInterval,
      loading,
      error,
      saveStatus,
      agentsLoading,
      availableAgents,
      selectedAgent,
      selectedEvalModel,
      evalAgentModels,
      selectedAdHocAgent,
      selectedAdHocModel,
      effectiveAdHocAgent,
      adHocAgentModels,
      refreshIntervalInput,
      reviewSoundEnabled,
      maxEvalRetriesInput,
      updateProjectName,
      updateEvalAgent,
      updateEvalModel,
      updateAdHocAgent,
      updateAdHocModel,
      updateRefreshInterval,
      updateReviewSound,
      updateMaxEvalRetries,
      dbExporting,
      dbImporting,
      dbMessage,
      dbMessageType,
      exportDb,
      importDb,
      settingsTab,
      agentTests,
      agentTestRunning,
      testAgent,
      testAllAgents,
      defaultAgentId,
      setDefaultAgent,
      toggleAgentEnabled,
      getAgentModels,
      getSelectedModel,
      setAgentModel,
      getAgentConcurrent,
      setAgentConcurrent,
      getAgentCooldown,
      setAgentCooldown
    };
  }
};
</script>

<style scoped>
.settings-view {
  flex: 1;
  padding: 1.5rem 2rem;
  background-color: var(--secondary-color, #f5f7fa);
  overflow-y: auto;
}

.settings-header {
  margin-bottom: 2rem;
  padding-bottom: 0;
  border-bottom: none;
}

.settings-header h1 {
  margin: 0 0 1rem 0;
  font-size: 1.75rem;
  font-weight: 600;
  color: #2c3e50;
}

.settings-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid #e1e4e8;
}

.settings-tab {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 1.25rem;
  border: none;
  background: transparent;
  color: #6b778c;
  font-size: 0.88rem;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.15s;
}

.settings-tab:hover {
  color: #2c3e50;
}

.settings-tab.is-active {
  color: #4a90e2;
  border-bottom-color: #4a90e2;
}

.settings-tab .mdi {
  font-size: 1.05rem;
}

/* Agent connectivity tests */
.agent-test-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.agent-test-card {
  border-radius: 6px;
  background: #f8f9fa;
  border: 1px solid #e1e4e8;
  overflow: hidden;
}

.agent-test-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
}

.agent-active-checkbox {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
  flex-shrink: 0;
  margin-left: 0.75rem;
}

.agent-active-checkbox input[type="checkbox"] {
  width: 14px;
  height: 14px;
  margin: 0;
  cursor: pointer;
  accent-color: #4a90e2;
}

.agent-active-label {
  font-size: 0.72rem;
  color: #9ca3af;
  white-space: nowrap;
}

.agent-default-radio {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  flex-shrink: 0;
  margin-left: 0.5rem;
}

.agent-default-label {
  font-size: 0.72rem;
  color: #9ca3af;
  white-space: nowrap;
}

.agent-default-radio input[type="radio"] {
  width: 14px;
  height: 14px;
  margin: 0;
  cursor: pointer;
  accent-color: #4a90e2;
}

.agent-test-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.agent-test-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: #2c3e50;
  min-width: 60px;
}

.agent-test-cmd code {
  font-size: 0.78rem;
  background: rgba(0, 0, 0, 0.05);
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  color: #6b778c;
}

.agent-test-status {
  min-width: 120px;
}

.agent-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.78rem;
  font-weight: 500;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
}

.agent-badge-idle {
  background: #e9ecef;
  color: #6b778c;
}

.agent-badge-testing {
  background: #e3f2fd;
  color: #1976d2;
}

.agent-badge-pass {
  background: #e8f5e9;
  color: #2e7d32;
}

.agent-badge-fail {
  background: #fde8ea;
  color: #c62828;
}

.agent-test-btn {
  padding: 0.4rem 1rem;
  border: 1px solid #d1d9e0;
  border-radius: 6px;
  background: #fff;
  color: #2c3e50;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.agent-test-btn:hover:not(:disabled) {
  background: #f0f2f5;
  border-color: #c1c7d0;
}

.agent-test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.agent-test-actions {
  margin-top: 0.75rem;
}

.agent-test-all-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1.25rem;
  border: none;
  border-radius: 6px;
  background: #4a90e2;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.agent-test-all-btn:hover:not(:disabled) {
  background: #357abd;
}

.agent-test-all-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.agent-test-detail-inline {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.72rem;
  color: #8b929a;
  margin-left: 0.5rem;
}

.agent-concurrent-inline {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
}

.agent-concurrent-inline-label {
  font-size: 0.7rem;
  color: #9ca3af;
  white-space: nowrap;
}

.agent-concurrent-inline-input {
  width: 42px;
  padding: 0.25rem 0.3rem;
  border: 1px solid #d1d9e0;
  border-radius: 4px;
  font-size: 0.8rem;
  background: #fff;
  color: #2c3e50;
  text-align: center;
}

.agent-concurrent-inline-input:focus {
  outline: none;
  border-color: #4a90e2;
}

/* Agent setup guide */
.agent-setup-guide {
  margin-top: 1.5rem;
}

.agent-guide-content {
  font-size: 0.88rem;
  line-height: 1.6;
}

.agent-guide-intro {
  margin: 0 0 1rem;
  color: #6b778c;
}

.agent-guide-table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.75rem 0 1.25rem;
  font-size: 0.84rem;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  overflow: hidden;
}

.agent-guide-table th {
  text-align: left;
  padding: 0.55rem 0.75rem;
  background: #f8f9fa;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b778c;
  border-bottom: 1px solid #e1e4e8;
}

.agent-guide-table td {
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid #f1f2f4;
  color: #2c3e50;
}

.agent-guide-table code {
  font-size: 0.78rem;
  background: rgba(0, 0, 0, 0.04);
  padding: 0.12rem 0.35rem;
  border-radius: 3px;
}

.agent-guide-content h3 {
  font-size: 0.9rem;
  font-weight: 600;
  color: #2c3e50;
  margin: 1.25rem 0 0.5rem;
}

.agent-guide-steps {
  margin: 0;
  padding: 0 0 0 1.25rem;
}

.agent-guide-steps li {
  margin-bottom: 0.4rem;
  color: #5e6c84;
}

.agent-guide-steps code {
  font-size: 0.78rem;
  background: rgba(0, 0, 0, 0.04);
  padding: 0.12rem 0.35rem;
  border-radius: 3px;
}

.agent-guide-files {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.agent-guide-file {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  font-size: 0.82rem;
}

.agent-guide-file code {
  font-size: 0.78rem;
  background: rgba(0, 0, 0, 0.04);
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  flex-shrink: 0;
}

.agent-guide-file span {
  color: #6b778c;
}

.agent-guide-content p {
  margin: 0 0 0.5rem;
  color: #5e6c84;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.settings-section {
  background: white;
  border-radius: 8px;
  border: 1px solid #e1e4e8;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background-color: #fafbfc;
  border-bottom: 1px solid #e1e4e8;
}

.section-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #e1e7ff;
  color: #4a6bdf;
  border-radius: 8px;
  font-size: 1.25rem;
}

.section-title-group {
  flex: 1;
}

.section-title-group h2 {
  margin: 0 0 0.25rem 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #2c3e50;
}

.section-description {
  margin: 0;
  font-size: 0.875rem;
  color: #6b778c;
}

.section-content {
  padding: 1.25rem;
}

/* Setting Item Styles */
.setting-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 200px;
}

.setting-name {
  font-weight: 500;
  color: #2c3e50;
  font-size: 0.95rem;
}

.setting-hint {
  color: #6b778c;
  font-size: 0.85rem;
}

.setting-control {
  display: flex;
  align-items: center;
}

/* Refresh Interval Styles */
.refresh-interval-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.refresh-interval-control.is-loading {
  opacity: 0.7;
}

.refresh-interval-input {
  width: 80px;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  color: #2c3e50;
  background-color: #fff;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  text-align: center;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.refresh-interval-input:hover:not(:disabled) {
  border-color: #4a6bdf;
}

.refresh-interval-input:focus {
  outline: none;
  border-color: #4a6bdf;
  box-shadow: 0 0 0 3px rgba(74, 107, 223, 0.1);
}

.refresh-interval-input:disabled {
  background-color: #f0f2f5;
  color: #6b778c;
  cursor: not-allowed;
}

/* Hide number spinner arrows */
.refresh-interval-input::-webkit-outer-spin-button,
.refresh-interval-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.refresh-interval-input[type="number"] {
  -moz-appearance: textfield;
}

.refresh-interval-unit {
  color: #6b778c;
  font-size: 0.9rem;
}

/* Project Name Input */
.project-name-input {
  width: 280px;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  color: #2c3e50;
  background-color: #fff;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.project-name-input:hover:not(:disabled) {
  border-color: #4a6bdf;
}

.project-name-input:focus {
  outline: none;
  border-color: #4a6bdf;
  box-shadow: 0 0 0 3px rgba(74, 107, 223, 0.1);
}

.project-name-input:disabled {
  background-color: #f0f2f5;
  color: #6b778c;
  cursor: not-allowed;
}

/* Agent Selector Styles */
.agent-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.agent-selector.is-loading {
  opacity: 0.7;
}

.agent-select {
  min-width: 200px;
  padding: 0.5rem 2rem 0.5rem 0.75rem;
  font-size: 0.9rem;
  color: #2c3e50;
  background-color: #fff;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b778c' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.agent-select:hover:not(:disabled) {
  border-color: #4a6bdf;
}

.agent-select:focus {
  outline: none;
  border-color: #4a6bdf;
  box-shadow: 0 0 0 3px rgba(74, 107, 223, 0.1);
}

.agent-select:disabled {
  background-color: #f0f2f5;
  color: #6b778c;
  cursor: not-allowed;
}

/* Empty State Message */
.empty-state-message {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background-color: #fff8e6;
  border: 1px solid #ffd699;
  border-radius: 6px;
  color: #8a6d3b;
  font-size: 0.9rem;
}

.empty-state-message .mdi {
  font-size: 1.1rem;
  color: #f0ad4e;
}

/* Feedback Message Styles */
.feedback-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  font-size: 0.9rem;
  animation: fadeIn 0.2s ease;
}

.feedback-message.success {
  background-color: #e8f5e9;
  color: #2e7d32;
}

.feedback-message.error {
  background-color: #ffebee;
  color: #c62828;
}

.feedback-message.info {
  background-color: #e3f2fd;
  color: #1565c0;
}

.feedback-message .mdi {
  font-size: 1.1rem;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Spin animation for loading */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.mdi-spin {
  animation: spin 1s linear infinite;
}

/* Toggle Switch Styles */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 24px;
  cursor: pointer;
}

.toggle-switch.is-loading {
  opacity: 0.7;
  cursor: not-allowed;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #c1c7d0;
  transition: background-color 0.2s ease;
  border-radius: 24px;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: transform 0.2s ease;
  border-radius: 50%;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: #4a6bdf;
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(24px);
}

.toggle-switch input:disabled + .toggle-slider {
  background-color: #e1e4e8;
  cursor: not-allowed;
}

.toggle-switch input:focus + .toggle-slider {
  box-shadow: 0 0 0 3px rgba(74, 107, 223, 0.2);
}

/* Database Action Buttons */
.db-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: #fff;
  background-color: #4a6bdf;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease, box-shadow 0.2s ease;
}

.db-action-btn:hover:not(:disabled) {
  background-color: #3a57c0;
}

.db-action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.db-action-btn--warning {
  background-color: #e67e22;
}

.db-action-btn--warning:hover:not(:disabled) {
  background-color: #cf6d17;
}

/* Theme Switcher */
.theme-switcher {
  display: flex;
  gap: 0;
  border: 1px solid var(--border-color, #d0d7de);
  border-radius: 8px;
  overflow: hidden;
}

.theme-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease;
  background-color: transparent;
  color: var(--text-muted, #6b778c);
}

.theme-btn:first-child {
  border-right: 1px solid var(--border-color, #d0d7de);
}

.theme-btn:hover:not(:disabled):not(.active) {
  background-color: var(--secondary-color, #f5f7fa);
}

.theme-btn.active {
  background-color: #4a6bdf;
  color: #fff;
}

.theme-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.theme-btn .mdi {
  font-size: 1rem;
}

/* About section */
.about-card {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 1.25rem;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.about-logo-img {
  width: 56px;
  height: 56px;
}

.about-name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #2c3e50;
}

.about-tagline {
  margin: 0.15rem 0 0;
  font-size: 0.82rem;
  color: #6b778c;
}

.about-version {
  margin: 0.5rem 0 0;
  font-size: 0.78rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #8b929a;
}

.about-copyright {
  margin: 0.2rem 0 0;
  font-size: 0.72rem;
  color: #a0a8b4;
}
</style>

<style>
/* Dark theme overrides for settings view (unscoped so they can target data-theme on root) */
[data-theme="dark"] .settings-view {
  background-color: var(--secondary-color);
}

[data-theme="dark"] .settings-section {
  background: var(--card-bg);
  border-color: var(--border-color);
}

[data-theme="dark"] .settings-tabs {
  border-bottom-color: var(--border-color);
}

[data-theme="dark"] .settings-tab {
  color: var(--text-muted);
}

[data-theme="dark"] .settings-tab:hover {
  color: var(--text-color);
}

[data-theme="dark"] .settings-tab.is-active {
  color: #5b9bd5;
  border-bottom-color: #5b9bd5;
}

[data-theme="dark"] .agent-concurrent-inline-input {
  background: #161a1f;
  border-color: var(--border-color);
  color: var(--text-color);
}

[data-theme="dark"] .agent-test-card {
  background: #161a1f;
  border-color: var(--border-color);
}

[data-theme="dark"] .agent-test-name {
  color: var(--text-color);
}

[data-theme="dark"] .agent-test-cmd code {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-muted);
}

[data-theme="dark"] .agent-badge-idle {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-muted);
}

[data-theme="dark"] .agent-badge-testing {
  background: rgba(91, 155, 213, 0.15);
  color: #7bb8e8;
}

[data-theme="dark"] .agent-badge-pass {
  background: rgba(60, 199, 122, 0.15);
  color: #5dd99a;
}

[data-theme="dark"] .agent-badge-fail {
  background: rgba(224, 96, 96, 0.15);
  color: #e06060;
}

[data-theme="dark"] .agent-test-btn {
  background: #2d333b;
  border-color: var(--border-color);
  color: var(--text-color);
}

[data-theme="dark"] .agent-test-btn:hover:not(:disabled) {
  background: #373d45;
}

[data-theme="dark"] .agent-guide-intro,
[data-theme="dark"] .agent-guide-content p,
[data-theme="dark"] .agent-guide-steps li,
[data-theme="dark"] .agent-guide-file span {
  color: var(--text-muted);
}

[data-theme="dark"] .agent-guide-content h3 {
  color: var(--text-color);
}

[data-theme="dark"] .agent-guide-table {
  border-color: var(--border-color);
}

[data-theme="dark"] .agent-guide-table th {
  background: #1a1e24;
  color: var(--text-muted);
  border-bottom-color: var(--border-color);
}

[data-theme="dark"] .agent-guide-table td {
  color: var(--text-color);
  border-bottom-color: var(--border-color);
}

[data-theme="dark"] .agent-guide-table code,
[data-theme="dark"] .agent-guide-steps code,
[data-theme="dark"] .agent-guide-file code {
  background: rgba(255, 255, 255, 0.06);
  color: #6dd4a0;
}

[data-theme="dark"] .settings-header h1,
[data-theme="dark"] .section-title-group h2,
[data-theme="dark"] .setting-name {
  color: var(--text-color);
}

[data-theme="dark"] .settings-subtitle,
[data-theme="dark"] .section-description,
[data-theme="dark"] .setting-hint,
[data-theme="dark"] .refresh-interval-unit {
  color: var(--text-muted);
}

[data-theme="dark"] .section-header {
  background-color: #1a1e24;
  border-bottom-color: var(--border-color);
}

[data-theme="dark"] .section-icon {
  background-color: #1e2a3a;
  color: #5b9bd5;
}

[data-theme="dark"] .refresh-interval-input,
[data-theme="dark"] .project-name-input,
[data-theme="dark"] .agent-select {
  color: var(--text-color);
  background-color: #161a1f;
  border-color: var(--border-color);
}

[data-theme="dark"] .refresh-interval-input:disabled,
[data-theme="dark"] .project-name-input:disabled,
[data-theme="dark"] .agent-select:disabled {
  background-color: #1a1e24;
  color: var(--text-muted);
}

[data-theme="dark"] .toggle-slider {
  background-color: #484e57;
}

[data-theme="dark"] .toggle-switch input:disabled + .toggle-slider {
  background-color: #2d333b;
}

[data-theme="dark"] .empty-state-message {
  background-color: #332a10;
  border-color: #4a3d1a;
  color: #e5a830;
}

[data-theme="dark"] .feedback-message.success {
  background-color: #1a2e1a;
  color: #3cc77a;
}

[data-theme="dark"] .feedback-message.error {
  background-color: #2e1a1a;
  color: #e06060;
}

[data-theme="dark"] .feedback-message.info {
  background-color: #1a2230;
  color: #5b9bd5;
}
</style>
