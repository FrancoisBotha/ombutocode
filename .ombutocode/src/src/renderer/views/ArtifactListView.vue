<template>
  <div class="artifact-list-view">
    <div class="page-header">
      <div>
        <h1>Artifacts</h1>
        <p class="text-muted">Browse and manage requirement artifacts.</p>
      </div>
      <button class="new-artifact-btn" type="button" @click="openCreateDialog">
        + New Artifact
      </button>
    </div>

    <section class="table-card">
      <div class="filters">
        <label class="filter-field">
          <span>Type</span>
          <select v-model="selectedType">
            <option value="">All</option>
            <option v-for="option in typeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="filter-field">
          <span>Status</span>
          <select v-model="selectedStatus">
            <option value="">All</option>
            <option v-for="option in statusOptions" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </label>

        <label class="filter-field search-field">
          <span>Search</span>
          <input
            v-model.trim="searchTerm"
            type="search"
            placeholder="Filter by title"
          >
        </label>
      </div>

      <div v-if="artifactStore.loading" class="state-message">
        Loading artifacts...
      </div>

      <div v-else-if="artifactStore.artifactList.length === 0" class="state-message">
        No artifacts yet. Create one to get started.
      </div>

      <div v-else-if="sortedArtifacts.length === 0" class="state-message">
        No artifacts match the current filters.
      </div>

      <div v-else class="table-wrap">
        <table class="artifact-table">
          <thead>
            <tr>
              <th
                v-for="column in columns"
                :key="column.key"
                scope="col"
              >
                <button class="sort-button" type="button" @click="toggleSort(column.key)">
                  {{ column.label }}
                  <span class="sort-indicator">{{ sortIndicator(column.key) }}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="artifact in sortedArtifacts"
              :key="artifact.id"
              class="artifact-row"
              tabindex="0"
              @click="openArtifact(artifact.id)"
              @keydown.enter="openArtifact(artifact.id)"
              @keydown.space.prevent="openArtifact(artifact.id)"
            >
              <td>{{ artifact.id || '-' }}</td>
              <td>{{ artifact.title || 'Untitled artifact' }}</td>
              <td>{{ formatType(artifact.type) }}</td>
              <td>
                <span class="status-badge" :class="statusClass(artifact.status)">
                  {{ artifact.status || 'draft' }}
                </span>
              </td>
              <td>{{ artifact.parent || '-' }}</td>
              <td>{{ formatUpdated(artifact.updated || artifact.last_modified) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div
      v-if="isCreateDialogOpen"
      class="modal-overlay"
      role="presentation"
      @click.self="closeCreateDialog"
    >
      <div
        class="create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-artifact-title"
      >
        <div class="dialog-header">
          <div>
            <p class="dialog-eyebrow">Artifact Creation</p>
            <h2 id="create-artifact-title">New Artifact</h2>
          </div>
          <button class="dialog-close" type="button" @click="closeCreateDialog" aria-label="Close dialog">
            ×
          </button>
        </div>

        <div class="dialog-body">
          <label class="dialog-field">
            <span>Type</span>
            <select v-model="createType">
              <option value="">Select a type</option>
              <option v-for="option in typeOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="dialog-field">
            <span>Auto ID</span>
            <input
              :value="nextArtifactId"
              type="text"
              readonly
              placeholder="Select a type first"
            >
          </label>

          <label v-if="selectedTypeRequiresParent" class="dialog-field">
            <span>Parent</span>
            <select v-model="createParentId">
              <option value="">Select a parent</option>
              <template v-if="createType === 'epic'">
                <optgroup
                  v-for="group in groupedParentOptions"
                  :key="group.id"
                  :label="group.label"
                >
                  <option :value="group.id">
                    {{ group.id }}: {{ group.title }}
                  </option>
                </optgroup>
              </template>
              <template v-else>
                <option v-for="option in availableParents" :key="option.id" :value="option.id">
                  {{ option.id }}: {{ option.title }}
                </option>
              </template>
            </select>
          </label>

          <label class="dialog-field">
            <span>Title</span>
            <input
              v-model.trim="createTitle"
              type="text"
              placeholder="Enter artifact title"
            >
          </label>

          <p v-if="createError" class="dialog-error">{{ createError }}</p>
        </div>

        <div class="dialog-actions">
          <button class="dialog-cancel" type="button" @click="closeCreateDialog">Cancel</button>
          <button
            class="dialog-confirm"
            type="button"
            @click="submitCreateDialog"
            :disabled="!canSubmitCreate"
          >
            Create Artifact
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useArtifactStore } from '../stores/artifactStore';

const TYPE_OPTIONS = [
  { value: 'prd', label: 'PRD' },
  { value: 'comp', label: 'Component' },
  { value: 'fr', label: 'Functional Req' },
  { value: 'nfr', label: 'Non-Functional Req' },
  { value: 'epic', label: 'EPIC' },
  { value: 'us', label: 'User Story' },
  { value: 'ac', label: 'Acceptance Criteria' },
];

const STATUS_OPTIONS = ['draft', 'active', 'implemented', 'deferred', 'deprecated'];

const PARENT_TYPES = {
  prd: null,
  comp: 'prd',
  fr: 'prd',
  nfr: 'prd',
  epic: 'comp',
  us: 'epic',
  ac: 'us',
};

const COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: 'Title' },
  { key: 'type', label: 'Type' },
  { key: 'status', label: 'Status' },
  { key: 'parent', label: 'Parent' },
  { key: 'updated', label: 'Updated' },
];

export default {
  name: 'ArtifactListView',
  setup() {
    const router = useRouter();
    const artifactStore = useArtifactStore();
    const selectedType = ref('');
    const selectedStatus = ref('');
    const searchTerm = ref('');
    const sortKey = ref('updated');
    const sortDirection = ref('desc');
    const isCreateDialogOpen = ref(false);
    const createType = ref('');
    const createParentId = ref('');
    const createTitle = ref('');
    const nextArtifactId = ref('');
    const nextIdLoading = ref(false);
    const createError = ref('');
    let nextIdRequestId = 0;

    const filteredArtifacts = computed(() => {
      return artifactStore.artifactList.filter((artifact) => {
        const matchesType = !selectedType.value || artifact.type === selectedType.value;
        const matchesStatus = !selectedStatus.value || artifact.status === selectedStatus.value;
        const matchesSearch = !searchTerm.value
          || (artifact.title || '').toLowerCase().includes(searchTerm.value.toLowerCase());

        return matchesType && matchesStatus && matchesSearch;
      });
    });

    const sortedArtifacts = computed(() => {
      return [...filteredArtifacts.value].sort((left, right) => {
        const leftValue = getSortValue(left, sortKey.value);
        const rightValue = getSortValue(right, sortKey.value);

        if (leftValue < rightValue) {
          return sortDirection.value === 'asc' ? -1 : 1;
        }

        if (leftValue > rightValue) {
          return sortDirection.value === 'asc' ? 1 : -1;
        }

        return 0;
      });
    });

    const selectedTypeRequiresParent = computed(() => {
      return Boolean(createType.value) && PARENT_TYPES[createType.value] !== null;
    });

    const availableParents = computed(() => {
      const parentType = PARENT_TYPES[createType.value];
      if (!parentType) {
        return [];
      }

      return artifactStore.artifactList
        .filter((artifact) => artifact.type === parentType)
        .sort((left, right) => left.id.localeCompare(right.id));
    });

    const groupedParentOptions = computed(() => {
      if (createType.value !== 'epic') {
        return [];
      }

      return availableParents.value.map((artifact) => ({
        id: artifact.id,
        title: artifact.title || 'Untitled component',
        label: `${artifact.id}: ${artifact.title || 'Untitled component'}`,
      }));
    });

    const canSubmitCreate = computed(() => {
      if (!createType.value || !createTitle.value || !nextArtifactId.value || nextIdLoading.value) {
        return false;
      }

      if (selectedTypeRequiresParent.value && !createParentId.value) {
        return false;
      }

      return !artifactStore.loading;
    });

    function getSortValue(artifact, columnKey) {
      if (columnKey === 'updated') {
        return String(artifact.updated || artifact.last_modified || '').toLowerCase();
      }

      return String(artifact[columnKey] || '').toLowerCase();
    }

    function toggleSort(columnKey) {
      if (sortKey.value === columnKey) {
        sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
        return;
      }

      sortKey.value = columnKey;
      sortDirection.value = columnKey === 'updated' ? 'desc' : 'asc';
    }

    function sortIndicator(columnKey) {
      if (sortKey.value !== columnKey) {
        return '<>';
      }

      return sortDirection.value === 'asc' ? '^' : 'v';
    }

    function formatType(type) {
      const match = TYPE_OPTIONS.find((option) => option.value === type);
      return match ? match.label : (type || '-').toUpperCase();
    }

    function formatUpdated(value) {
      return value || '-';
    }

    function statusClass(status) {
      return `status-${status || 'draft'}`;
    }

    function openArtifact(id) {
      router.push(`/artifact/${id}`);
    }

    function resetCreateDialog() {
      nextIdRequestId += 1;
      createType.value = '';
      createParentId.value = '';
      createTitle.value = '';
      nextArtifactId.value = '';
      nextIdLoading.value = false;
      createError.value = '';
    }

    function openCreateDialog() {
      resetCreateDialog();
      isCreateDialogOpen.value = true;
    }

    function closeCreateDialog() {
      isCreateDialogOpen.value = false;
      resetCreateDialog();
    }

    async function updateNextArtifactId(type) {
      if (!type) {
        nextArtifactId.value = '';
        return;
      }

      const requestId = nextIdRequestId + 1;
      nextIdRequestId = requestId;
      nextIdLoading.value = true;
      createError.value = '';

      try {
        const id = await artifactStore.fetchNextId(type);
        if (requestId !== nextIdRequestId) {
          return;
        }
        nextArtifactId.value = id;
      } catch (error) {
        if (requestId !== nextIdRequestId) {
          return;
        }
        nextArtifactId.value = '';
        createError.value = error.message || 'Failed to load the next artifact ID.';
      } finally {
        if (requestId === nextIdRequestId) {
          nextIdLoading.value = false;
        }
      }
    }

    async function submitCreateDialog() {
      if (!canSubmitCreate.value) {
        return;
      }

      createError.value = '';

      try {
        const created = await artifactStore.create({
          type: createType.value,
          parentId: createParentId.value || null,
          title: createTitle.value,
        });

        closeCreateDialog();
        router.push({
          path: `/artifact/${created.id}`,
          query: { edit: '1' },
        });
      } catch (error) {
        createError.value = error.message || 'Failed to create artifact.';
      }
    }

    onMounted(() => {
      artifactStore.fetchAll();
    });

    async function handleTypeChange(type) {
      createParentId.value = '';
      nextArtifactId.value = '';
      await updateNextArtifactId(type);
    }

    watch(createType, async (value) => {
      await handleTypeChange(value);
    });

    return {
      artifactStore,
      availableParents,
      canSubmitCreate,
      columns: COLUMNS,
      closeCreateDialog,
      createError,
      createParentId,
      createTitle,
      createType,
      selectedType,
      selectedStatus,
      searchTerm,
      sortedArtifacts,
      groupedParentOptions,
      handleTypeChange,
      isCreateDialogOpen,
      nextArtifactId,
      openCreateDialog,
      selectedTypeRequiresParent,
      statusOptions: STATUS_OPTIONS,
      submitCreateDialog,
      typeOptions: TYPE_OPTIONS,
      toggleSort,
      sortIndicator,
      formatType,
      formatUpdated,
      statusClass,
      openArtifact,
    };
  },
};
</script>

<style scoped>
.artifact-list-view {
  max-width: 1280px;
  animation: fadeIn 0.2s ease-out forwards;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.new-artifact-btn {
  border: 0;
  border-radius: var(--border-radius);
  background: linear-gradient(135deg, #1f8a70, #2a9d8f);
  color: #fff;
  padding: 0.8rem 1.15rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 12px 24px rgba(31, 138, 112, 0.22);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.new-artifact-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 16px 28px rgba(31, 138, 112, 0.28);
}

.page-header h1 {
  margin-bottom: 0.35rem;
  color: var(--text-color);
}

.table-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  box-shadow: var(--box-shadow);
  overflow: hidden;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 1.25rem;
  border-bottom: 1px solid var(--border-color);
  background: var(--secondary-color);
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 180px;
}

.filter-field span {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-muted);
}

.filter-field select,
.filter-field input {
  width: 100%;
  min-height: 40px;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  background: var(--bg-color);
  color: var(--text-color);
}

.search-field {
  flex: 1 1 280px;
}

.state-message {
  padding: 3rem 1.5rem;
  text-align: center;
  color: var(--text-muted);
}

.table-wrap {
  overflow-x: auto;
}

.artifact-table {
  width: 100%;
  border-collapse: collapse;
}

.artifact-table th,
.artifact-table td {
  padding: 0.95rem 1.25rem;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
}

.artifact-table td:nth-child(2) {
  min-width: 260px;
  white-space: normal;
}

.sort-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-color);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.sort-indicator {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.artifact-row {
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.artifact-row:hover,
.artifact-row:focus-visible {
  background: rgba(74, 144, 226, 0.08);
  outline: none;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 92px;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: capitalize;
}

.status-draft {
  background: rgba(107, 119, 140, 0.16);
  color: #5c6677;
}

.status-active {
  background: rgba(46, 204, 113, 0.16);
  color: #1f8a4d;
}

.status-implemented {
  background: rgba(74, 144, 226, 0.16);
  color: #2b6cb0;
}

.status-deferred {
  background: rgba(243, 156, 18, 0.18);
  color: #a86400;
}

.status-deprecated {
  background: rgba(231, 76, 60, 0.16);
  color: #b83227;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(12, 23, 34, 0.58);
  backdrop-filter: blur(6px);
}

.create-dialog {
  width: min(100%, 540px);
  background: linear-gradient(180deg, rgba(247, 249, 252, 0.98), rgba(255, 255, 255, 0.98));
  border: 1px solid rgba(31, 138, 112, 0.16);
  border-radius: 20px;
  box-shadow: 0 28px 60px rgba(12, 23, 34, 0.28);
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.5rem 1rem;
  background: linear-gradient(135deg, rgba(31, 138, 112, 0.12), rgba(244, 162, 97, 0.1));
}

.dialog-eyebrow {
  margin: 0 0 0.25rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #1f8a70;
}

.dialog-header h2 {
  margin: 0;
  color: #163a33;
}

.dialog-close {
  border: 0;
  background: transparent;
  color: #40635d;
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;
}

.dialog-body {
  display: grid;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
}

.dialog-field {
  display: grid;
  gap: 0.45rem;
}

.dialog-field span {
  font-size: 0.85rem;
  font-weight: 700;
  color: #48635f;
}

.dialog-field select,
.dialog-field input {
  width: 100%;
  min-height: 44px;
  border: 1px solid rgba(72, 99, 95, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
  color: #163a33;
  padding: 0.7rem 0.9rem;
}

.dialog-field input[readonly] {
  color: #57716d;
  background: rgba(239, 244, 243, 0.92);
}

.dialog-error {
  margin: 0;
  padding: 0.75rem 0.85rem;
  border-radius: 12px;
  background: rgba(231, 76, 60, 0.12);
  color: #b83227;
  font-size: 0.875rem;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 0 1.5rem 1.5rem;
}

.dialog-cancel,
.dialog-confirm {
  min-width: 130px;
  border-radius: 999px;
  padding: 0.8rem 1rem;
  font-weight: 600;
  cursor: pointer;
}

.dialog-cancel {
  border: 1px solid rgba(72, 99, 95, 0.2);
  background: #fff;
  color: #48635f;
}

.dialog-confirm {
  border: 0;
  background: linear-gradient(135deg, #1f8a70, #2a9d8f);
  color: #fff;
  box-shadow: 0 14px 24px rgba(31, 138, 112, 0.22);
}

.dialog-confirm:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  box-shadow: none;
}

@media (max-width: 720px) {
  .artifact-list-view {
    max-width: 100%;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .filters {
    padding: 1rem;
  }

  .artifact-table th,
  .artifact-table td {
    padding: 0.8rem 1rem;
  }

  .modal-overlay {
    padding: 1rem;
  }

  .dialog-actions {
    flex-direction: column-reverse;
  }

  .dialog-cancel,
  .dialog-confirm {
    width: 100%;
  }
}
</style>
