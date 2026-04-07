<template>
  <div class="view-container">
    <h1>Settings</h1>
    <p class="text-muted">Configure application settings</p>
    <div class="settings-content">
      <div class="card">
        <h2>Application Settings</h2>
        <div class="form-group">
          <label for="project-name">Project Name</label>
          <input
            id="project-name"
            type="text"
            v-model="localProjectName"
            @change="onProjectNameChange"
            placeholder="Enter project name"
          />
        </div>
        <div class="form-group">
          <label for="theme-select">Theme</label>
          <select id="theme-select" v-model="localTheme" @change="onThemeChange">
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import { useSettingsStore } from '../stores/settingsStore';

export default {
  name: 'SettingsView',
  setup() {
    const settingsStore = useSettingsStore();
    const localProjectName = ref('');
    const localTheme = ref('system');

    onMounted(async () => {
      await settingsStore.loadSettings();
      localProjectName.value = settingsStore.projectName;
      localTheme.value = settingsStore.theme;
    });

    async function onProjectNameChange() {
      await settingsStore.saveProjectName(localProjectName.value);
    }

    async function onThemeChange() {
      await settingsStore.saveTheme(localTheme.value);
    }

    return {
      localProjectName,
      localTheme,
      onProjectNameChange,
      onThemeChange,
    };
  },
};
</script>

<style scoped>
.view-container {
  max-width: 1200px;
}

.view-container h1 {
  margin-bottom: 0.5rem;
  color: var(--text-color);
}

.settings-content {
  margin-top: 2rem;
}

.card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 1.5rem;
  box-shadow: var(--box-shadow);
}

.card h2 {
  margin-bottom: 1rem;
  font-size: 1.25rem;
  color: var(--text-color);
}

.form-group {
  margin-bottom: 1.25rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--text-color);
}

.form-group input,
.form-group select {
  width: 100%;
  max-width: 400px;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  background: var(--bg-color, #fff);
  color: var(--text-color);
  font-size: 0.95rem;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
}
</style>
