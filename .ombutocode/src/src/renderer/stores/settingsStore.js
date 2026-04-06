import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

function createDefaultSettings() {
  return {
    project_name: '',
    eval_default_agent: null,
    eval_default_model: null,
    ad_hoc_ticket_agent: null,
    ad_hoc_ticket_model: null,
    app_refresh_interval: 30,
    enable_review_notification_sound: true,
    max_eval_retries: 2,
    theme: 'dark'
  };
}

export const useSettingsStore = defineStore('settings', () => {
  // State
  const _settings = ref(createDefaultSettings());
  const _loading = ref(false);
  const _error = ref(null);
  const _saveStatus = ref(null); // 'success' | 'error' | null

  // Getters
  const settings = computed(() => _settings.value);
  const projectName = computed(() => _settings.value.project_name);
  const evalDefaultAgent = computed(() => _settings.value.eval_default_agent);
  const evalDefaultModel = computed(() => _settings.value.eval_default_model);
  const adHocTicketAgent = computed(() => _settings.value.ad_hoc_ticket_agent);
  const adHocTicketModel = computed(() => _settings.value.ad_hoc_ticket_model);
  const appRefreshInterval = computed(() => _settings.value.app_refresh_interval);
  const enableReviewNotificationSound = computed(() => _settings.value.enable_review_notification_sound);
  const maxEvalRetries = computed(() => _settings.value.max_eval_retries);
  const theme = computed(() => _settings.value.theme);
  const loading = computed(() => _loading.value);
  const error = computed(() => _error.value);
  const saveStatus = computed(() => _saveStatus.value);

  /**
   * Normalize settings payload from IPC
   * Ensures all expected fields are present with valid types
   */
  function normalizeSettings(payload) {
    if (!payload || typeof payload !== 'object') {
      return createDefaultSettings();
    }

    return {
      project_name: typeof payload.project_name === 'string' ? payload.project_name : '',
      eval_default_agent: payload.eval_default_agent === null || typeof payload.eval_default_agent === 'string'
        ? payload.eval_default_agent
        : null,
      eval_default_model: payload.eval_default_model === null || typeof payload.eval_default_model === 'string'
        ? payload.eval_default_model
        : null,
      ad_hoc_ticket_agent: payload.ad_hoc_ticket_agent === null || typeof payload.ad_hoc_ticket_agent === 'string'
        ? payload.ad_hoc_ticket_agent
        : null,
      ad_hoc_ticket_model: payload.ad_hoc_ticket_model === null || typeof payload.ad_hoc_ticket_model === 'string'
        ? payload.ad_hoc_ticket_model
        : null,
      app_refresh_interval: Number.isFinite(payload.app_refresh_interval) && payload.app_refresh_interval > 0
        ? payload.app_refresh_interval
        : 30,
      enable_review_notification_sound: typeof payload.enable_review_notification_sound === 'boolean'
        ? payload.enable_review_notification_sound
        : true,
      max_eval_retries: Number.isFinite(payload.max_eval_retries) && payload.max_eval_retries >= 0
        ? payload.max_eval_retries
        : 2,
      theme: payload.theme === 'dark' ? 'dark' : 'light'
    };
  }

  /**
   * Load settings from main process
   */
  async function loadSettings() {
    _loading.value = true;
    _error.value = null;
    _saveStatus.value = null;

    try {
      const result = await window.electron.ipcRenderer.invoke('settings:read');

      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response from settings:read IPC');
      }

      if (result.success === false) {
        const message = result?.error?.message || 'Failed to load settings';
        throw new Error(message);
      }

      _settings.value = normalizeSettings(result.data);
      return _settings.value;
    } catch (err) {
      _error.value = err?.message || 'Failed to load settings';
      console.error('[SettingsStore] Error loading settings:', err);
      throw err;
    } finally {
      _loading.value = false;
    }
  }

  /**
   * Save settings to main process
   * @param {Object} updates - Partial settings object to update
   */
  async function saveSettings(updates) {
    _loading.value = true;
    _error.value = null;
    _saveStatus.value = null;

    try {
      if (!updates || typeof updates !== 'object') {
        throw new Error('Settings updates must be an object');
      }

      const result = await window.electron.ipcRenderer.invoke('settings:write', updates);

      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response from settings:write IPC');
      }

      if (result.success === false) {
        const message = result?.error?.message || 'Failed to save settings';
        throw new Error(message);
      }

      // Update local state with returned settings
      _settings.value = normalizeSettings(result.data);
      _saveStatus.value = 'success';
      return _settings.value;
    } catch (err) {
      _error.value = err?.message || 'Failed to save settings';
      _saveStatus.value = 'error';
      console.error('[SettingsStore] Error saving settings:', err);
      throw err;
    } finally {
      _loading.value = false;
    }
  }

  /**
   * Update project name setting
   * @param {string} value
   */
  async function setProjectName(value) {
    if (typeof value !== 'string') {
      throw new Error('project_name must be a string');
    }
    return saveSettings({ project_name: value });
  }

  /**
   * Update EVAL default agent setting
   * @param {string|null} value
   */
  async function setEvalDefaultAgent(value) {
    if (value !== null && typeof value !== 'string') {
      throw new Error('eval_default_agent must be a string or null');
    }
    return saveSettings({ eval_default_agent: value });
  }

  /**
   * Update EVAL default model setting
   * @param {string|null} value
   */
  async function setEvalDefaultModel(value) {
    if (value !== null && typeof value !== 'string') {
      throw new Error('eval_default_model must be a string or null');
    }
    return saveSettings({ eval_default_model: value });
  }

  /**
   * Update Ad Hoc ticket creation agent setting
   * @param {string|null} value
   */
  async function setAdHocTicketAgent(value) {
    if (value !== null && typeof value !== 'string') {
      throw new Error('ad_hoc_ticket_agent must be a string or null');
    }
    return saveSettings({ ad_hoc_ticket_agent: value });
  }

  /**
   * Update Ad Hoc ticket creation model setting
   * @param {string|null} value
   */
  async function setAdHocTicketModel(value) {
    if (value !== null && typeof value !== 'string') {
      throw new Error('ad_hoc_ticket_model must be a string or null');
    }
    return saveSettings({ ad_hoc_ticket_model: value });
  }

  /**
   * Update app refresh interval setting
   * @param {number} value - refresh interval in seconds (must be > 0)
   */
  async function setAppRefreshInterval(value) {
    const numValue = Number(value);
    if (!Number.isFinite(numValue) || numValue < 1) {
      throw new Error('app_refresh_interval must be a positive integer greater than 0');
    }
    return saveSettings({ app_refresh_interval: Math.floor(numValue) });
  }

  /**
   * Update review notification sound setting
   * @param {boolean} value
   */
  async function setEnableReviewNotificationSound(value) {
    if (typeof value !== 'boolean') {
      throw new Error('enable_review_notification_sound must be a boolean');
    }
    return saveSettings({ enable_review_notification_sound: value });
  }

  /**
   * Update max eval retries setting
   * @param {number} value - maximum number of eval retries (must be >= 0)
   */
  async function setMaxEvalRetries(value) {
    const numValue = Number(value);
    if (!Number.isFinite(numValue) || numValue < 0) {
      throw new Error('max_eval_retries must be a non-negative integer');
    }
    return saveSettings({ max_eval_retries: Math.floor(numValue) });
  }

  /**
   * Update theme setting
   * @param {string} value - 'light' or 'dark'
   */
  async function setTheme(value) {
    if (value !== 'light' && value !== 'dark') {
      throw new Error('theme must be "light" or "dark"');
    }
    return saveSettings({ theme: value });
  }

  /**
   * Clear save status (e.g., after showing success/error message)
   */
  function clearSaveStatus() {
    _saveStatus.value = null;
  }

  /**
   * Reset settings to defaults
   */
  async function resetToDefaults() {
    return saveSettings(createDefaultSettings());
  }

  return {
    // State getters
    settings,
    projectName,
    evalDefaultAgent,
    evalDefaultModel,
    adHocTicketAgent,
    adHocTicketModel,
    appRefreshInterval,
    enableReviewNotificationSound,
    maxEvalRetries,
    theme,
    loading,
    error,
    saveStatus,

    // Actions
    loadSettings,
    saveSettings,
    setProjectName,
    setEvalDefaultAgent,
    setEvalDefaultModel,
    setAdHocTicketAgent,
    setAdHocTicketModel,
    setAppRefreshInterval,
    setEnableReviewNotificationSound,
    setMaxEvalRetries,
    setTheme,
    clearSaveStatus,
    resetToDefaults
  };
});
