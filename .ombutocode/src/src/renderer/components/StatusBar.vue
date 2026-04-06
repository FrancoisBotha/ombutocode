<template>
  <div class="status-bar">
    <span class="status-bar-path">{{ projectPath }}</span>
    <span class="status-bar-project-name">{{ projectName }}</span>
    <span class="status-bar-build" :title="buildTooltip">{{ buildLabel }}</span>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { useSettingsStore } from '../stores/settingsStore';

export default {
  name: 'StatusBar',
  setup() {
    const projectPath = ref('');
    const buildLabel = ref('');
    const buildTooltip = ref('');
    const settingsStore = useSettingsStore();

    const projectName = computed(() => settingsStore.projectName || '');

    onMounted(async () => {
      if (window.electron?.ipcRenderer?.invoke) {
        try {
          const result = await window.electron.ipcRenderer.invoke('app:getProjectRoot');
          if (result) {
            projectPath.value = result;
          }
        } catch (err) {
          console.error('Failed to get project root:', err);
        }
        try {
          const info = await window.electron.ipcRenderer.invoke('app:getBuildInfo');
          if (info) {
            buildLabel.value = `v${info.version} (${info.hash})`;
            buildTooltip.value = `Ombuto Code v${info.version} build ${info.hash}`;
          }
        } catch (err) {
          console.error('Failed to get build info:', err);
        }
      }
    });

    return { projectPath, projectName, buildLabel, buildTooltip };
  }
};
</script>

<style scoped>
.status-bar {
  height: 24px;
  display: flex;
  align-items: center;
  padding: 0 0.75rem;
  background-color: #f4f5f7;
  border-top: 1px solid #e1e4e8;
  flex-shrink: 0;
}

.status-bar-path {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.7rem;
  color: #6a737d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.status-bar-project-name {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.7rem;
  font-weight: 500;
  color: #2c3e50;
  white-space: nowrap;
  pointer-events: none;
}

.status-bar-build {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.65rem;
  color: #959da5;
  white-space: nowrap;
  cursor: default;
}
</style>
