<template>
  <div class="view-container">
    <header class="skills-header">
      <div>
        <h1>Skills</h1>
        <p class="skills-subtitle">Reusable knowledge documents for AI agents and team reference</p>
      </div>
      <div class="skills-actions">
        <div v-if="showNewInput" class="new-skill-input-wrap">
          <input
            ref="newNameInput"
            v-model="newName"
            class="new-skill-input"
            placeholder="Skill name (e.g. API Design Guidelines)"
            @keyup.enter="createSkill"
            @keyup.escape="showNewInput = false"
          />
          <button class="skills-btn skills-btn-primary" @click="createSkill" :disabled="!newName.trim()">Create</button>
          <button class="skills-btn skills-btn-secondary" @click="showNewInput = false">Cancel</button>
        </div>
        <button v-else class="skills-btn skills-btn-primary" @click="onNewSkill">
          <span class="mdi mdi-plus"></span> New Skill
        </button>
      </div>
    </header>

    <div v-if="loading" class="skills-loading">Loading skills...</div>

    <div v-else-if="skills.length === 0" class="skills-empty">
      <span class="mdi mdi-school-outline"></span>
      <p>No skills yet</p>
      <p class="skills-empty-hint">
        Skills are Markdown documents in <code>docs/Skills/</code> that capture reusable knowledge —
        coding standards, design patterns, architecture decisions, onboarding guides, and more.
      </p>
    </div>

    <div v-else class="skills-list">
      <div
        v-for="skill in skills"
        :key="skill.path"
        class="skill-card"
        @click="openSkill(skill)"
      >
        <span class="mdi skill-icon" :class="skill.isSystem ? 'mdi-shield-check-outline' : 'mdi-file-document-outline'"></span>
        <div class="skill-info">
          <span class="skill-name">{{ skill.displayName }}</span>
          <span class="skill-path">{{ skill.path }}</span>
        </div>
        <span v-if="skill.isSystem" class="skill-system-badge">System</span>
        <button v-else class="skill-delete-btn" @click.stop="deleteSkill(skill)" title="Delete skill">
          <span class="mdi mdi-delete-outline"></span>
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, nextTick } from 'vue';

export default {
  name: 'SkillsView',
  setup() {
    const skills = ref([]);
    const loading = ref(true);
    const showNewInput = ref(false);
    const newName = ref('');
    const newNameInput = ref(null);

    const SKILLS_DIR = 'Skills';

    const TEMPLATE = `---
system: false
---

# {NAME}

## Overview

_Describe the purpose and scope of this skill._

## Guidelines

-

## Examples

\`\`\`
// Add examples here
\`\`\`

## References

-
`;

    async function loadSkills() {
      loading.value = true;
      try {
        const tree = await window.electron.ipcRenderer.invoke('filetree:scan');
        if (tree && tree.children) {
          const folder = tree.children.find(c => c.name === SKILLS_DIR);
          if (folder && folder.children) {
            const files = folder.children.filter(f => f.type === 'file' && f.name.endsWith('.md'));
            const loaded = [];
            for (const f of files) {
              let isSystem = false;
              try {
                const content = await window.electron.ipcRenderer.invoke('filetree:readFile', f.path);
                // Parse simple frontmatter check for system: true
                const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
                if (fmMatch) {
                  isSystem = /^system:\s*true/m.test(fmMatch[1]);
                }
              } catch (_) {}
              loaded.push({
                name: f.name,
                path: f.path,
                displayName: f.name.replace('.md', '').replace(/_/g, ' '),
                isSystem,
              });
            }
            skills.value = loaded;
          } else {
            skills.value = [];
          }
        }
      } catch (e) {
        console.error('Failed to load skills:', e);
      } finally {
        loading.value = false;
      }
    }

    async function onNewSkill() {
      showNewInput.value = true;
      newName.value = '';
      await nextTick();
      if (newNameInput.value) newNameInput.value.focus();
    }

    async function createSkill() {
      const name = newName.value.trim();
      if (!name) return;
      const safeName = name.replace(/[<>:"/\\|?*]/g, '_');
      const filePath = SKILLS_DIR + '/' + safeName + '.md';
      const content = TEMPLATE.replace('{NAME}', name);
      try {
        await window.electron.ipcRenderer.invoke('filetree:writeFile', filePath, content);
        showNewInput.value = false;
        newName.value = '';
        // Open the new skill in the editor
        if (window.__planNavigate) {
          window.__planNavigate('plan-file-preview', filePath);
        }
        loadSkills();
      } catch (e) {
        console.error('Failed to create skill:', e);
      }
    }

    function openSkill(skill) {
      if (window.__planNavigate) {
        window.__planNavigate('plan-file-preview', skill.path);
      }
    }

    async function deleteSkill(skill) {
      if (!confirm(`Delete "${skill.displayName}"?`)) return;
      try {
        await window.electron.ipcRenderer.invoke('filetree:deleteFile', skill.path);
        skills.value = skills.value.filter(s => s.path !== skill.path);
      } catch (e) {
        console.error('Failed to delete skill:', e);
      }
    }

    onMounted(loadSkills);

    return {
      skills, loading, showNewInput, newName, newNameInput,
      onNewSkill, createSkill, openSkill, deleteSkill,
    };
  },
};
</script>

<style scoped>
.view-container {
  max-width: 100%;
  padding: 2rem;
}

h1 {
  margin: 0 0 0.2rem;
  font-size: 1.35rem;
}

.skills-subtitle {
  margin: 0;
  color: var(--text-muted, #8b929a);
  font-size: 0.88rem;
}

.skills-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.skills-actions {
  flex-shrink: 0;
}

.new-skill-input-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.new-skill-input {
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--border-color, #373d45);
  border-radius: 6px;
  background: var(--card-bg, #21262d);
  color: var(--text-color, #d4d8dd);
  font-size: 0.88rem;
  width: 280px;
  outline: none;
}

.new-skill-input:focus {
  border-color: #6dd4a0;
}

.skills-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.9rem;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.skills-btn-primary {
  background: #6dd4a0;
  color: #0A1220;
}

.skills-btn-primary:hover:not(:disabled) {
  background: #86efac;
}

.skills-btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.skills-btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

.skills-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.12);
}

/* Loading / Empty */
.skills-loading {
  color: var(--text-muted);
  padding: 2rem;
  text-align: center;
}

.skills-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.25);
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

.skills-empty .mdi {
  font-size: 2.5rem;
  margin-bottom: 0.75rem;
  opacity: 0.4;
}

.skills-empty p {
  margin: 0;
  font-size: 0.88rem;
}

.skills-empty-hint {
  margin-top: 0.5rem !important;
  font-size: 0.82rem !important;
  color: rgba(255, 255, 255, 0.18);
  max-width: 420px;
  line-height: 1.5;
}

.skills-empty-hint code {
  background: rgba(255, 255, 255, 0.06);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-size: 0.78rem;
  color: #6dd4a0;
}

/* Skills list */
.skills-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.skill-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: all 0.15s;
}

.skill-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
}

.skill-icon {
  font-size: 1.2rem;
  color: #6dd4a0;
  flex-shrink: 0;
}

.skill-info {
  flex: 1;
  min-width: 0;
}

.skill-name {
  display: block;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-color, #d4d8dd);
}

.skill-path {
  display: block;
  font-size: 0.72rem;
  color: var(--text-muted, #8b929a);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  margin-top: 0.1rem;
}

.skill-system-badge {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.06);
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
  flex-shrink: 0;
}

.skill-delete-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.2);
  cursor: pointer;
  padding: 0.3rem;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.15s;
}

.skill-card:hover .skill-delete-btn {
  opacity: 1;
}

.skill-delete-btn:hover {
  color: #e06060;
  background: rgba(224, 96, 96, 0.1);
}
</style>
