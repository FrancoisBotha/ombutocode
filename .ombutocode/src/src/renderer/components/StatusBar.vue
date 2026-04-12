<template>
  <div class="status-bar">
    <span class="status-bar-path">{{ projectPath }}</span>
    <span class="status-bar-git" v-if="gitBranch">
      <span class="mdi mdi-source-branch git-icon"></span>
      <span class="git-branch">{{ gitBranch }}</span>
      <span v-if="gitModified > 0" class="git-badge git-modified" :title="gitModified + ' modified files'">{{ gitModified }}M</span>
      <span v-if="gitUntracked > 0" class="git-badge git-untracked" :title="gitUntracked + ' untracked files'">{{ gitUntracked }}?</span>
      <span v-if="gitAhead > 0" class="git-badge git-ahead" :title="gitAhead + ' commits ahead'">↑{{ gitAhead }}</span>
      <span v-if="gitBehind > 0" class="git-badge git-behind" :title="gitBehind + ' commits behind'">↓{{ gitBehind }}</span>
      <span v-if="gitModified === 0 && gitUntracked === 0 && gitAhead === 0" class="git-clean">✓</span>
    </span>
    <span class="status-bar-project-name">{{ projectName }}</span>
    <span class="status-bar-build" :title="buildTooltip">{{ buildLabel }}</span>
    <span class="status-bar-beta" title="Pre-release build — APIs and features may change without notice">BETA</span>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '../stores/settingsStore';

export default {
  name: 'StatusBar',
  setup() {
    const projectPath = ref('');
    const buildLabel = ref('');
    const buildTooltip = ref('');
    const settingsStore = useSettingsStore();

    const projectName = computed(() => settingsStore.projectName || '');

    // Git status
    const gitBranch = ref('');
    const gitModified = ref(0);
    const gitUntracked = ref(0);
    const gitAhead = ref(0);
    const gitBehind = ref(0);
    let gitPollInterval = null;

    async function loadGitStatus() {
      if (!window.electron?.ipcRenderer?.invoke) return;
      try {
        // Get branch name
        const branch = await window.electron.ipcRenderer.invoke('workspace:gitBranch');
        if (branch) gitBranch.value = branch;

        // Get file status
        const status = await window.electron.ipcRenderer.invoke('workspace:gitStatusCounts');
        if (status) {
          gitModified.value = status.modified || 0;
          gitUntracked.value = status.untracked || 0;
          gitAhead.value = status.ahead || 0;
          gitBehind.value = status.behind || 0;
        }
      } catch (_) {}
    }

    onMounted(async () => {
      if (window.electron?.ipcRenderer?.invoke) {
        try {
          const result = await window.electron.ipcRenderer.invoke('app:getProjectRoot');
          if (result) projectPath.value = result;
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

      await loadGitStatus();
      gitPollInterval = setInterval(loadGitStatus, 15000);
    });

    onUnmounted(() => {
      if (gitPollInterval) clearInterval(gitPollInterval);
    });

    return { projectPath, projectName, buildLabel, buildTooltip, gitBranch, gitModified, gitUntracked, gitAhead, gitBehind };
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
  gap: 0.5rem;
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

.status-bar-git {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
}

.git-icon {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.4);
}

.git-branch {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.6);
}

.git-badge {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 0.62rem;
  font-weight: 600;
  padding: 0 0.3rem;
  border-radius: 3px;
}

.git-modified {
  background: rgba(229, 168, 48, 0.2);
  color: #e5a830;
}

.git-untracked {
  background: rgba(91, 155, 213, 0.2);
  color: #5b9bd5;
}

.git-ahead {
  background: rgba(109, 212, 160, 0.2);
  color: #6dd4a0;
}

.git-behind {
  background: rgba(224, 96, 96, 0.2);
  color: #e06060;
}

.git-clean {
  font-size: 0.68rem;
  color: rgba(109, 212, 160, 0.6);
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

.status-bar-beta {
  margin-left: 0.4rem;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #1a1d22;
  background: #e5a830;
  padding: 0 0.35rem;
  border-radius: 3px;
  cursor: help;
  flex-shrink: 0;
}
</style>
