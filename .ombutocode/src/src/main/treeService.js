'use strict';

const artifactDb = require('./artifactDb');

/**
 * TreeService — stateless tree operations over the artifact hierarchy.
 *
 * Hierarchy: PRD -> [COMP, FR, NFR] -> EPIC (under COMP) -> US -> AC
 * Reads from artifactDb on every call (no caching).
 */

const CHILD_TYPES = {
  prd: ['comp', 'fr', 'nfr'],
  comp: ['epic'],
  epic: ['us'],
  us: ['ac'],
};

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function allArtifacts() {
  return artifactDb.listArtifacts();
}

function toNode(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status,
    children: [],
  };
}

function toBreadcrumbEntry(row) {
  return { id: row.id, type: row.type, title: row.title };
}

// -------------------------------------------------------------------------
// buildTree
// -------------------------------------------------------------------------

function buildTree() {
  const rows = allArtifacts();
  const nodeMap = new Map();

  for (const row of rows) {
    nodeMap.set(row.id, { row, node: toNode(row) });
  }

  const roots = [];

  for (const { row, node } of nodeMap.values()) {
    if (row.parent_id && nodeMap.has(row.parent_id)) {
      nodeMap.get(row.parent_id).node.children.push(node);
    } else if (!row.parent_id) {
      roots.push(node);
    }
  }

  return roots;
}

// -------------------------------------------------------------------------
// ancestors
// -------------------------------------------------------------------------

function ancestors(id) {
  const rows = allArtifacts();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const chain = [];
  let current = byId.get(id);

  while (current) {
    chain.push(toBreadcrumbEntry(current));
    current = current.parent_id ? byId.get(current.parent_id) : null;
  }

  return chain;
}

// -------------------------------------------------------------------------
// descendants
// -------------------------------------------------------------------------

function descendants(id) {
  const rows = allArtifacts();
  const childrenOf = new Map();

  for (const row of rows) {
    if (row.parent_id) {
      if (!childrenOf.has(row.parent_id)) {
        childrenOf.set(row.parent_id, []);
      }
      childrenOf.get(row.parent_id).push(row);
    }
  }

  const result = [];
  const stack = [...(childrenOf.get(id) || [])];

  while (stack.length > 0) {
    const row = stack.pop();
    result.push(toBreadcrumbEntry(row));
    const kids = childrenOf.get(row.id);
    if (kids) {
      stack.push(...kids);
    }
  }

  return result;
}

// -------------------------------------------------------------------------
// children
// -------------------------------------------------------------------------

function children(id) {
  const rows = allArtifacts();
  return rows.filter((r) => r.parent_id === id).map(toBreadcrumbEntry);
}

// -------------------------------------------------------------------------
// breadcrumb
// -------------------------------------------------------------------------

function breadcrumb(id) {
  return ancestors(id).reverse();
}

// -------------------------------------------------------------------------
// coverageReport
// -------------------------------------------------------------------------

function coverageReport() {
  const rows = allArtifacts();
  const childParentIds = new Set();

  for (const row of rows) {
    if (row.parent_id) {
      childParentIds.add(row.parent_id);
    }
  }

  const entry = (row) => ({ id: row.id, type: row.type, title: row.title });

  const prdsWithNoComps = [];
  const compsWithNoEpics = [];
  const epicsWithNoStories = [];
  const storiesWithNoACs = [];

  for (const row of rows) {
    const t = row.type;
    if (t === 'prd' && !rows.some((r) => r.parent_id === row.id && r.type === 'comp')) {
      prdsWithNoComps.push(entry(row));
    } else if (t === 'comp' && !rows.some((r) => r.parent_id === row.id && r.type === 'epic')) {
      compsWithNoEpics.push(entry(row));
    } else if (t === 'epic' && !rows.some((r) => r.parent_id === row.id && r.type === 'us')) {
      epicsWithNoStories.push(entry(row));
    } else if (t === 'us' && !rows.some((r) => r.parent_id === row.id && r.type === 'ac')) {
      storiesWithNoACs.push(entry(row));
    }
  }

  return { compsWithNoEpics, epicsWithNoStories, storiesWithNoACs, prdsWithNoComps };
}

// -------------------------------------------------------------------------
// componentSummary
// -------------------------------------------------------------------------

function componentSummary(compId) {
  const rows = allArtifacts();
  const comp = rows.find((r) => r.id === compId);

  if (!comp) {
    throw new Error(`treeService: component "${compId}" not found`);
  }

  const epics = rows.filter((r) => r.parent_id === compId && r.type === 'epic');
  const epicIds = new Set(epics.map((e) => e.id));
  const stories = rows.filter((r) => epicIds.has(r.parent_id) && r.type === 'us');
  const storyIds = new Set(stories.map((s) => s.id));
  const acs = rows.filter((r) => storyIds.has(r.parent_id) && r.type === 'ac');

  function statusCounts(items) {
    const byStatus = {};
    for (const item of items) {
      byStatus[item.status] = (byStatus[item.status] || 0) + 1;
    }
    return { total: items.length, byStatus };
  }

  return {
    compId,
    title: comp.title,
    epics: statusCounts(epics),
    stories: statusCounts(stories),
    acs: statusCounts(acs),
  };
}

// -------------------------------------------------------------------------
// Exports
// -------------------------------------------------------------------------

module.exports = {
  buildTree,
  ancestors,
  descendants,
  children,
  breadcrumb,
  coverageReport,
  componentSummary,
};
