<template>
  <div class="view-container">
    <div class="view-header">
      <div>
        <h1>Use Cases</h1>
        <p class="text-muted">Individual use case documents in docs/Use Cases/</p>
      </div>
      <div v-if="!showNewInput">
        <button class="new-btn" @click="showNewInput = true">
          <span class="mdi mdi-plus"></span> New Use Case
        </button>
      </div>
      <div v-else class="new-input-row">
        <input
          :ref="el => { if (el) newInputEl = el }"
          v-model="newName"
          class="name-input"
          placeholder="Use case name"
          @keyup.enter="onCreate"
          @keyup.escape="showNewInput = false"
        />
        <button class="new-btn" @click="onCreate" :disabled="!newName.trim()">Create</button>
        <button class="cancel-btn" @click="showNewInput = false">Cancel</button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading use cases...</div>
    <div v-else-if="useCases.length === 0" class="empty">
      No use cases yet. Click "New Use Case" to create one.
    </div>

    <div v-else class="list">
      <div v-for="uc in useCases" :key="uc.path" class="card" @click="openUseCase(uc)">
        <span class="mdi mdi-text-box-outline card-icon"></span>
        <div class="card-info">
          <span class="card-name">{{ uc.name.replace('.md', '') }}</span>
          <span class="card-path">{{ uc.path }}</span>
        </div>
        <div class="card-actions" @click.stop>
          <button class="icon-btn delete-icon" title="Delete" @click="deleteUseCase(uc)">
            <span class="mdi mdi-delete"></span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, nextTick, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const TEMPLATE = `# Use Case: [Name]

## 1. Overview
- **Use Case ID:** UC-[XXX]
- **Name:** [Name]
- **Primary Actor:** [User / System initiating the use case]
- **Secondary Actors:** [Other systems / users involved]
- **Description:** [1–2 sentence summary of what this achieves]
- **Level:** [User goal / Sub-function]
- **Scope:** [System / application boundary]

---

## 2. Preconditions
- [What must be true before this starts]

---

## 3. Trigger
- [What initiates the use case]

---

## 4. Main Success Scenario (Basic Flow)
1. Actor performs action
2. System validates input
3. System processes request
4. System returns result

---

## 5. Alternate Flows (Extensions)

### 5.1 [Condition]
- [Steps]

---

## 6. Postconditions
- **Success:**
  - [What is true after success]

- **Failure:**
  - [What is true after failure]

---

## 7. Business Rules
- [Constraints, policies, calculations]

---

## 8. Includes (<<include>>)
- [Referenced use cases that always occur]

---

## 9. Extensions (<<extend>>)
- [Optional/conditional use cases]

---

## 10. Non-Functional Requirements
- **Performance:** [e.g. <2s response time]
- **Security:** [e.g. RBAC enforced]
- **Availability:** [e.g. 99.9% uptime]

---

## 11. Notes / Assumptions
- [Anything not captured above]

## 12. Functional Requirements
_Link FRs to this use case using the "Link FR" button below._

## 13. Related Artifacts
`;

export default {
  name: 'UseCasesListView',
  setup() {
    const router = useRouter();
    const useCases = ref([]);
    const loading = ref(true);
    const showNewInput = ref(false);
    const newName = ref('');
    let newInputEl = null;

    async function loadUseCases() {
      try {
        useCases.value = await window.electron.ipcRenderer.invoke('filetree:scanUseCases');
      } catch (e) {
        console.error('Failed to load use cases:', e);
      } finally {
        loading.value = false;
      }
    }

    function nextId() {
      let max = 0;
      for (const uc of useCases.value) {
        const m = uc.name.match(/UC-(\d+)/);
        if (m) {
          const n = parseInt(m[1]);
          if (n > max) max = n;
        }
      }
      return String(max + 1).padStart(3, '0');
    }

    async function onCreate() {
      if (!newName.value.trim()) return;
      const name = newName.value.trim();
      const id = nextId();
      const safeName = name.replace(/[<>:"/\\|?*]/g, '_');
      const fileName = `UC-${id}_${safeName}.md`;
      const filePath = 'Use Cases/' + fileName;

      const content = TEMPLATE
        .replace(/\[XXX\]/g, id)
        .replace(/\[Name\]/g, name);

      try {
        await window.electron.ipcRenderer.invoke('filetree:writeFile', filePath, content);
        showNewInput.value = false;
        newName.value = '';
        if (window.__planNavigate) {
          window.__planNavigate('plan-use-case-editor', filePath);
        } else {
          router.push('/use-case/' + encodeURIComponent(filePath));
        }
      } catch (e) {
        console.error('Failed to create use case:', e);
      }
    }

    function openUseCase(uc) {
      if (window.__planNavigate) {
        window.__planNavigate('plan-use-case-editor', uc.path);
      } else {
        router.push('/use-case/' + encodeURIComponent(uc.path));
      }
    }

    async function deleteUseCase(uc) {
      try {
        await window.electron.ipcRenderer.invoke('filetree:deleteFile', uc.path);
        useCases.value = useCases.value.filter(x => x.path !== uc.path);
      } catch (e) {
        console.error('Failed to delete use case:', e);
      }
    }

    onMounted(() => {
      loadUseCases();
    });

    return {
      useCases, loading, showNewInput, newName,
      get newInputEl() { return newInputEl; },
      set newInputEl(v) { newInputEl = v; },
      onCreate, openUseCase, deleteUseCase,
    };
  },
};
</script>

<style scoped>
.view-container { max-width: 1200px; padding: 1rem; }
.view-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
.view-header h1 { margin: 0 0 0.25rem; color: var(--text-color); }
.new-btn { display: flex; align-items: center; gap: 0.35rem; background: var(--primary-color); border: none; border-radius: var(--border-radius); color: #fff; cursor: pointer; font-size: 0.9rem; padding: 0.55rem 1.2rem; white-space: nowrap; transition: var(--transition); }
.new-btn:hover { background: var(--primary-hover); }
.new-input-row { display: flex; align-items: center; gap: 0.5rem; }
.name-input { padding: 0.4rem 0.6rem; border: 1px solid var(--border-color); border-radius: var(--border-radius); background: var(--card-bg); color: var(--text-color); font-size: 0.9rem; outline: none; }
.name-input:focus { border-color: var(--primary-color); }
.cancel-btn { background: transparent; border: 1px solid var(--border-color); border-radius: var(--border-radius); color: var(--text-color); cursor: pointer; font-size: 0.9rem; padding: 0.5rem 0.9rem; transition: var(--transition); }
.cancel-btn:hover { border-color: var(--text-muted); }
.loading, .empty { color: var(--text-muted); margin-top: 1rem; }

.list { display: flex; flex-direction: column; gap: 0.5rem; }
.card { display: flex; align-items: center; gap: 0.6rem; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 0.7rem 0.9rem; cursor: pointer; box-shadow: var(--box-shadow); transition: transform 0.15s ease, box-shadow 0.15s ease; }
.card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); }
.card-icon { font-size: 1.3rem; color: var(--primary-color); flex-shrink: 0; }
.card-info { flex: 1; min-width: 0; }
.card-name { display: block; font-size: 0.9rem; color: var(--text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-path { display: block; font-size: 0.7rem; color: var(--text-muted); }
.card-actions { flex-shrink: 0; }
.icon-btn { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: none; border: none; border-radius: 3px; color: var(--text-muted); cursor: pointer; transition: var(--transition); }
.icon-btn:hover { color: var(--text-color); background: rgba(255, 255, 255, 0.08); }
.delete-icon:hover { color: #ef4444; }
</style>
