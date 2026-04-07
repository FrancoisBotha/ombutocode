'use strict';

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
// marked v5+ is ESM-only; rendering happens in the renderer process, not here
const artifactDb = require('./artifactDb');
const ombutocodeDb = require('./ombutocodeDb');
const { DOCS_DIR, PROJECT_ROOT } = require('./planCoreUtilities');

const TYPE_DEFINITIONS = {
  prd: { prefix: 'PRD', directory: 'prd', parentType: null },
  comp: { prefix: 'COMP', directory: 'comp', parentType: 'prd' },
  fr: { prefix: 'FR', directory: 'fr', parentType: 'prd' },
  nfr: { prefix: 'NFR', directory: 'nfr', parentType: 'prd' },
  epic: { prefix: 'EPIC', directory: 'epic', parentType: 'comp' },
  us: { prefix: 'US', directory: 'us', parentType: 'epic' },
  ac: { prefix: 'AC', directory: 'ac', parentType: 'us' },
};

const BODY_TEMPLATES = {
  prd: '## Overview\n\n## Goals\n\n## Non-Goals\n',
  comp: '## Responsibility\n\n## Interfaces\n\n## Notes\n',
  fr: '## Requirement\n\n## Rationale\n\n## Notes\n',
  nfr: '## Requirement\n\n## Constraints\n\n## Notes\n',
  epic: '## Outcome\n\n## Scope\n\n## Notes\n',
  us: '## Description\n\n## Notes\n',
  ac: '## Acceptance Criteria\n\n- [ ] \n\n## Notes\n',
};

const NON_FRONTMATTER_FIELDS = new Set([
  'body',
  'rawBody',
  'renderedBody',
  'file_path',
  'last_modified',
  'parentId',
  'data',
]);

function normalizeType(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (!TYPE_DEFINITIONS[normalized]) {
    throw new Error(`artifactService: unsupported artifact type "${type}"`);
  }

  return normalized;
}

function toRelativeProjectPath(filePath) {
  return path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');
}

function resolveArtifactPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
}

function getTypeDefinition(type) {
  return TYPE_DEFINITIONS[normalizeType(type)];
}

function currentDateString() {
  return new Date().toISOString().slice(0, 10);
}

function parseRowData(row) {
  if (!row?.data) {
    return {};
  }

  if (typeof row.data === 'object') {
    return row.data;
  }

  try {
    return JSON.parse(row.data);
  } catch (_error) {
    return {};
  }
}

function normalizeParentId(parentId) {
  if (parentId === undefined || parentId === null) {
    return null;
  }

  const normalized = String(parentId).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeTags(tags) {
  if (tags === undefined) {
    return [];
  }

  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof tags === 'string') {
    return tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeFrontmatter(frontmatter = {}, fallback = {}) {
  const sourceType = frontmatter.type ?? fallback.type;
  const normalizedType = sourceType ? normalizeType(sourceType) : null;

  return {
    ...fallback,
    ...frontmatter,
    type: normalizedType,
    title: String(frontmatter.title ?? fallback.title ?? '').trim(),
    status: frontmatter.status ?? fallback.status ?? 'draft',
    parent: normalizeParentId(frontmatter.parent ?? fallback.parent ?? fallback.parent_id),
    tags: normalizeTags(frontmatter.tags ?? fallback.tags),
    created: frontmatter.created ?? fallback.created ?? currentDateString(),
    updated: frontmatter.updated ?? fallback.updated ?? currentDateString(),
  };
}

function frontmatterFromArtifact(artifact = {}) {
  const frontmatter = {};

  for (const [key, value] of Object.entries(artifact)) {
    if (NON_FRONTMATTER_FIELDS.has(key) || value === undefined) {
      continue;
    }

    if (key === 'parent_id') {
      frontmatter.parent = normalizeParentId(value);
      continue;
    }

    frontmatter[key] = value;
  }

  return normalizeFrontmatter(frontmatter);
}

function toStoredFrontmatter(frontmatter) {
  const normalized = normalizeFrontmatter(frontmatter);
  const stored = { ...normalized };

  if (!stored.parent) {
    delete stored.parent;
  }

  if (stored.parent_id !== undefined) {
    delete stored.parent_id;
  }

  return stored;
}

function buildArtifactResponse(row, frontmatter = {}) {
  const parentId = frontmatter.parent ?? row?.parent_id ?? null;

  return {
    ...frontmatter,
    id: frontmatter.id ?? row?.id ?? null,
    type: frontmatter.type ?? row?.type ?? null,
    title: frontmatter.title ?? row?.title ?? '',
    status: frontmatter.status ?? row?.status ?? 'draft',
    parent: parentId,
    parent_id: parentId,
    file_path: row?.file_path ?? null,
    last_modified: row?.last_modified ?? frontmatter.updated ?? null,
  };
}

function validateHierarchyRules(type, parentId) {
  const normalizedType = normalizeType(type);
  const normalizedParentId = normalizeParentId(parentId);
  const { parentType } = TYPE_DEFINITIONS[normalizedType];

  if (parentType === null) {
    if (normalizedParentId) {
      throw new Error('artifactService: PRD artifacts cannot have a parent');
    }

    return true;
  }

  if (!normalizedParentId) {
    throw new Error(`artifactService: ${TYPE_DEFINITIONS[normalizedType].prefix} artifacts require a parent`);
  }

  const parentArtifact = artifactDb.getArtifact(normalizedParentId);
  if (!parentArtifact) {
    throw new Error(`artifactService: parent artifact "${normalizedParentId}" not found`);
  }

  if (parentArtifact.type !== parentType) {
    const expectedPrefix = TYPE_DEFINITIONS[parentType].prefix;
    throw new Error(
      `artifactService: ${TYPE_DEFINITIONS[normalizedType].prefix} parent must be ${expectedPrefix}`
    );
  }

  return true;
}

function indexArtifact(frontmatter, absoluteFilePath) {
  const normalizedFrontmatter = toStoredFrontmatter(frontmatter);
  const row = {
    id: normalizedFrontmatter.id,
    type: normalizedFrontmatter.type,
    title: normalizedFrontmatter.title ?? '',
    status: normalizedFrontmatter.status ?? 'draft',
    parent_id: normalizeParentId(normalizedFrontmatter.parent),
    file_path: toRelativeProjectPath(absoluteFilePath),
    data: JSON.stringify(normalizedFrontmatter),
    last_modified: normalizedFrontmatter.updated ?? currentDateString(),
  };

  const existing = artifactDb.getArtifact(normalizedFrontmatter.id);
  const indexed = existing
    ? artifactDb.updateArtifact(normalizedFrontmatter.id, row)
    : artifactDb.insertArtifact(row);

  ombutocodeDb.saveDb();
  return buildArtifactResponse(indexed, normalizedFrontmatter);
}

function getIndexedFrontmatter(row) {
  if (!row) {
    return {};
  }

  const rowData = parseRowData(row);

  return normalizeFrontmatter(rowData, {
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status,
    parent: row.parent_id,
    created: rowData.created,
    updated: rowData.updated,
    tags: rowData.tags,
    priority: rowData.priority,
  });
}

function readArtifactFromFile(filePath, indexedRow = null) {
  const absoluteFilePath = resolveArtifactPath(filePath);
  const source = fs.readFileSync(absoluteFilePath, 'utf8');
  const parsed = matter(source);
  const frontmatter = normalizeFrontmatter(parsed.data, getIndexedFrontmatter(indexedRow));
  const row = indexedRow ?? artifactDb.getArtifact(frontmatter.id);
  const artifact = buildArtifactResponse(
    row ?? {
      id: frontmatter.id,
      type: frontmatter.type,
      title: frontmatter.title,
      status: frontmatter.status,
      parent_id: frontmatter.parent,
      file_path: toRelativeProjectPath(absoluteFilePath),
      last_modified: frontmatter.updated ?? currentDateString(),
    },
    frontmatter
  );

  return {
    ...artifact,
    rawBody: parsed.content,
    body: parsed.content,
    renderedBody: parsed.content,
  };
}

function ensureTypeDirectory(type) {
  const definition = getTypeDefinition(type);
  const directory = path.join(DOCS_DIR, definition.directory);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function list(filters = {}) {
  const normalizedFilters = { ...filters };

  if (Object.prototype.hasOwnProperty.call(normalizedFilters, 'type') && normalizedFilters.type) {
    normalizedFilters.type = normalizeType(normalizedFilters.type);
  }

  if (Object.prototype.hasOwnProperty.call(normalizedFilters, 'parent')) {
    normalizedFilters.parent = normalizeParentId(normalizedFilters.parent);
  }

  const artifacts = artifactDb
    .listArtifacts(normalizedFilters)
    .map((row) => buildArtifactResponse(row, parseRowData(row)));

  if (Object.prototype.hasOwnProperty.call(normalizedFilters, 'parent')) {
    return artifacts.filter((artifact) => normalizeParentId(artifact.parent) === normalizedFilters.parent);
  }

  return artifacts;
}

function get(id) {
  const row = artifactDb.getArtifact(id);
  if (!row) {
    throw new Error(`artifactService: artifact "${id}" not found`);
  }

  return readArtifactFromFile(row.file_path, row);
}

function nextId(type) {
  const definition = getTypeDefinition(type);
  return artifactDb.getNextId(definition.prefix);
}

function create(type, parentId, data = {}) {
  const normalizedType = normalizeType(type);
  const normalizedParentId = normalizeParentId(parentId);
  validateHierarchyRules(normalizedType, normalizedParentId);

  const id = nextId(normalizedType);
  const definition = getTypeDefinition(normalizedType);
  const now = currentDateString();
  const frontmatter = toStoredFrontmatter({
    ...frontmatterFromArtifact(data),
    id,
    type: normalizedType,
    parent: normalizedParentId,
    created: data.created ?? now,
    updated: data.updated ?? now,
    title: data.title,
    status: data.status,
    tags: data.tags,
    priority: data.priority,
  });

  const body = data.body ?? BODY_TEMPLATES[normalizedType] ?? '';
  const directory = ensureTypeDirectory(normalizedType);
  const absoluteFilePath = path.join(directory, `${id}.md`);
  const document = matter.stringify(body, frontmatter);

  fs.writeFileSync(absoluteFilePath, document, 'utf8');
  artifactDb.incrementCounter(definition.prefix);
  indexArtifact(frontmatter, absoluteFilePath);

  return get(id);
}

function update(id, data = {}) {
  const existing = get(id);
  const nextType = Object.prototype.hasOwnProperty.call(data, 'type')
    ? normalizeType(data.type)
    : existing.type;

  if (nextType !== existing.type) {
    throw new Error('artifactService: changing artifact type is not supported');
  }

  const nextParent = Object.prototype.hasOwnProperty.call(data, 'parent')
    ? normalizeParentId(data.parent)
    : Object.prototype.hasOwnProperty.call(data, 'parentId')
      ? normalizeParentId(data.parentId)
      : normalizeParentId(existing.parent);

  validateHierarchyRules(existing.type, nextParent);

  const frontmatter = toStoredFrontmatter({
    ...frontmatterFromArtifact(existing),
    ...frontmatterFromArtifact(data),
    id: existing.id,
    type: existing.type,
    title: Object.prototype.hasOwnProperty.call(data, 'title') ? data.title : existing.title,
    status: Object.prototype.hasOwnProperty.call(data, 'status') ? data.status : existing.status,
    parent: nextParent,
    tags: Object.prototype.hasOwnProperty.call(data, 'tags') ? data.tags : existing.tags,
    created: data.created ?? existing.created,
    updated: data.updated ?? currentDateString(),
    priority: Object.prototype.hasOwnProperty.call(data, 'priority') ? data.priority : existing.priority,
  });

  const body = Object.prototype.hasOwnProperty.call(data, 'body') ? data.body : existing.rawBody;
  const absoluteFilePath = resolveArtifactPath(existing.file_path);
  const document = matter.stringify(body, frontmatter);

  fs.writeFileSync(absoluteFilePath, document, 'utf8');
  indexArtifact(frontmatter, absoluteFilePath);

  return get(id);
}

function archive(id) {
  const artifact = get(id);
  const children = artifactDb.listArtifacts().filter((candidate) => candidate.parent_id === id);
  const sourcePath = resolveArtifactPath(artifact.file_path);
  const archiveDirectory = path.join(DOCS_DIR, '.archive', artifact.type);
  const destinationPath = path.join(archiveDirectory, `${artifact.id}.md`);

  fs.mkdirSync(archiveDirectory, { recursive: true });
  fs.renameSync(sourcePath, destinationPath);
  artifactDb.deleteArtifact(id);
  ombutocodeDb.saveDb();

  return {
    archived: true,
    id,
    warning: children.length > 0 ? `Artifact ${id} has ${children.length} child artifact(s)` : null,
  };
}

function rebuildIndex() {
  const db = ombutocodeDb.getDb();
  if (!db) {
    throw new Error('artifactService: database is not initialized');
  }

  db.run('DELETE FROM artifacts');
  db.run('DELETE FROM counters');

  const indexedArtifacts = [];

  for (const definition of Object.values(TYPE_DEFINITIONS)) {
    const directory = path.join(DOCS_DIR, definition.directory);
    if (!fs.existsSync(directory)) {
      continue;
    }

    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.md') {
        continue;
      }

      const absoluteFilePath = path.join(directory, entry.name);
      const parsed = matter(fs.readFileSync(absoluteFilePath, 'utf8'));

      // Skip files without an id in frontmatter (plain Markdown docs, not artifacts)
      if (!parsed.data.id) {
        continue;
      }

      const frontmatter = toStoredFrontmatter({
        ...parsed.data,
        type: parsed.data.type ?? definition.directory,
      });

      const indexed = artifactDb.insertArtifact({
        id: frontmatter.id,
        type: frontmatter.type,
        title: frontmatter.title ?? '',
        status: frontmatter.status ?? 'draft',
        parent_id: frontmatter.parent,
        file_path: toRelativeProjectPath(absoluteFilePath),
        data: JSON.stringify(frontmatter),
        last_modified: frontmatter.updated ?? currentDateString(),
      });

      indexedArtifacts.push(buildArtifactResponse(indexed, frontmatter));
    }
  }

  artifactDb.rebuildCounters(indexedArtifacts);
  ombutocodeDb.saveDb();
  return indexedArtifacts;
}

module.exports = {
  list,
  get,
  create,
  update,
  archive,
  nextId,
  rebuildIndex,
  validate: validateHierarchyRules,
  validateHierarchyRules,
};
