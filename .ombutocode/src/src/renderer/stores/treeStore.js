import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';

import { useArtifactStore } from './artifactStore';

let watcherRegistered = false;

function collectNodeIds(nodes, ids = []) {
  for (const node of nodes) {
    ids.push(node.id);
    if (Array.isArray(node.children) && node.children.length > 0) {
      collectNodeIds(node.children, ids);
    }
  }
  return ids;
}

export const useTreeStore = defineStore('tree', () => {
  const artifactStore = useArtifactStore();

  const treeData = ref([]);
  const expandedNodes = ref(new Set());
  const coverageReport = ref({});
  const componentSummaries = ref(new Map());
  const loading = ref(false);

  // Search/filter state
  const searchQuery = ref('');
  let savedExpandedNodes = null;

  let pendingRequests = 0;

  function beginLoading() {
    pendingRequests += 1;
    loading.value = true;
  }

  function endLoading() {
    pendingRequests = Math.max(0, pendingRequests - 1);
    loading.value = pendingRequests > 0;
  }

  async function fetchTree() {
    beginLoading();
    try {
      const nextTree = await window.electron.ipcRenderer.invoke('tree:build');
      const validIds = new Set(collectNodeIds(nextTree));

      treeData.value = nextTree;
      expandedNodes.value = new Set(
        [...expandedNodes.value].filter((id) => validIds.has(id)),
      );

      return treeData.value;
    } finally {
      endLoading();
    }
  }

  async function fetchCoverage() {
    beginLoading();
    try {
      coverageReport.value = await window.electron.ipcRenderer.invoke('tree:coverage');
      return coverageReport.value;
    } finally {
      endLoading();
    }
  }

  async function fetchComponentSummary(compId) {
    beginLoading();
    try {
      const summary = await window.electron.ipcRenderer.invoke('tree:componentSummary', compId);
      const nextSummaries = new Map(componentSummaries.value);
      nextSummaries.set(compId, summary);
      componentSummaries.value = nextSummaries;
      return summary;
    } finally {
      endLoading();
    }
  }

  async function fetchBreadcrumb(id) {
    beginLoading();
    try {
      return await window.electron.ipcRenderer.invoke('tree:breadcrumb', id);
    } finally {
      endLoading();
    }
  }

  function toggleNode(id) {
    const nextExpanded = new Set(expandedNodes.value);

    if (nextExpanded.has(id)) {
      nextExpanded.delete(id);
    } else {
      nextExpanded.add(id);
    }

    expandedNodes.value = nextExpanded;
  }

  function expandAll() {
    expandedNodes.value = new Set(collectNodeIds(treeData.value));
  }

  function collapseAll() {
    expandedNodes.value = new Set();
  }

  async function refreshDerivedData() {
    componentSummaries.value = new Map();
    await Promise.all([fetchTree(), fetchCoverage()]);
  }

  // Filter tree to only matching nodes + their ancestors
  function filterTree(nodes, query) {
    const q = query.toLowerCase();
    const result = [];

    for (const node of nodes) {
      const children = Array.isArray(node.children) ? node.children : [];
      const selfMatch =
        node.id.toLowerCase().includes(q) ||
        (node.title && node.title.toLowerCase().includes(q));
      const filteredChildren = filterTree(children, query);

      if (selfMatch || filteredChildren.length > 0) {
        result.push({
          ...node,
          children: selfMatch ? children : filteredChildren,
        });
      }
    }

    return result;
  }

  // Collect IDs of nodes that are ancestors of matching nodes
  function collectFilterAncestors(nodes, query) {
    const q = query.toLowerCase();
    const ancestors = new Set();

    function visit(node) {
      const children = Array.isArray(node.children) ? node.children : [];
      let hasMatchingDescendant = false;

      for (const child of children) {
        if (visit(child)) {
          hasMatchingDescendant = true;
        }
      }

      const selfMatch =
        node.id.toLowerCase().includes(q) ||
        (node.title && node.title.toLowerCase().includes(q));

      if (selfMatch || hasMatchingDescendant) {
        if (hasMatchingDescendant) {
          ancestors.add(node.id);
        }
        return true;
      }
      return false;
    }

    for (const node of nodes) {
      visit(node);
    }
    return ancestors;
  }

  const filteredTreeData = computed(() => {
    const q = searchQuery.value.trim();
    if (!q) return treeData.value;
    return filterTree(treeData.value, q);
  });

  const filterExpandedNodes = computed(() => {
    const q = searchQuery.value.trim();
    if (!q) return null;
    return collectFilterAncestors(treeData.value, q);
  });

  function setSearchQuery(query) {
    const wasEmpty = !searchQuery.value.trim();
    const willBeEmpty = !query.trim();

    if (wasEmpty && !willBeEmpty) {
      // Entering filter mode — save current expanded state
      savedExpandedNodes = new Set(expandedNodes.value);
    } else if (!wasEmpty && willBeEmpty) {
      // Leaving filter mode — restore saved state
      if (savedExpandedNodes) {
        expandedNodes.value = new Set(savedExpandedNodes);
        savedExpandedNodes = null;
      }
    }

    searchQuery.value = query;
  }

  function clearSearch() {
    setSearchQuery('');
  }

  const flattenedVisibleNodes = computed(() => {
    const visible = [];
    const isFiltering = !!searchQuery.value.trim();
    const effectiveExpanded = isFiltering ? filterExpandedNodes.value : expandedNodes.value;
    const sourceTree = filteredTreeData.value;

    function visit(nodes, depth = 0, parentId = null) {
      for (const node of nodes) {
        const children = Array.isArray(node.children) ? node.children : [];
        const isExpanded = effectiveExpanded ? effectiveExpanded.has(node.id) : false;

        visible.push({
          ...node,
          depth,
          level: depth,
          parentId,
          hasChildren: children.length > 0,
          isExpanded,
        });

        if (children.length > 0 && isExpanded) {
          visit(children, depth + 1, node.id);
        }
      }
    }

    visit(sourceTree);
    return visible;
  });

  watch(
    () => artifactStore.artifactList,
    () => {
      refreshDerivedData();
    },
    { deep: true },
  );

  if (!watcherRegistered) {
    watcherRegistered = true;
    window.electron.ipcRenderer.on('watcher:fileChanged', () => {
      refreshDerivedData();
    });
  }

  return {
    treeData,
    expandedNodes,
    coverageReport,
    componentSummaries,
    loading,
    searchQuery,
    flattenedVisibleNodes,
    fetchTree,
    fetchCoverage,
    fetchComponentSummary,
    toggleNode,
    expandAll,
    collapseAll,
    fetchBreadcrumb,
    setSearchQuery,
    clearSearch,
  };
});
