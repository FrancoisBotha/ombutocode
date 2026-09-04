'use strict';

/**
 * docs/ helpers shared by `epic create` and `tickets create`: skill discovery,
 * default context documents, epic path resolution and the epic `Status:`
 * update. The status update mirrors the `epics:updateStatus` IPC handler in
 * main.js (which Node cannot load); keep them in step.
 */

const fs = require('fs');
const path = require('path');

const { readEpics } = require('../main/epicReader');

const FRONTMATTER_PATTERN = /^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/;

function toPosix(p) {
  return String(p || '').split(path.sep).join('/');
}

/** Strip a leading `---` frontmatter block the way the renderer does. */
function stripFrontmatter(content) {
  return String(content || '').replace(FRONTMATTER_PATTERN, '').trim();
}

/** Parse `system: true` (or any key) out of the frontmatter block, if present. */
function readFrontmatter(content) {
  const match = String(content || '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

/**
 * List skill files one folder level deep under docs/Skills/, matching the
 * renderer's collectSkillFiles. Returns [{ name, path, category, system }].
 * @param {string} skillsDir
 * @param {string|null} [category] restrict to one sub-folder
 */
function scanSkillFiles(skillsDir, category = null) {
  let entries;
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const skills = [];
  const pushFile = (dir, entry, cat) => {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) return;
    const filePath = path.join(dir, entry.name);
    let system = false;
    try {
      system = /^true$/i.test(readFrontmatter(fs.readFileSync(filePath, 'utf-8')).system || '');
    } catch {
      // unreadable skill — still listed so a bad file surfaces by name
    }
    skills.push({ name: entry.name, path: filePath, category: cat, system });
  };
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (category && entry.name !== category) continue;
      let children = [];
      try {
        children = fs.readdirSync(path.join(skillsDir, entry.name), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const child of children) pushFile(path.join(skillsDir, entry.name), child, entry.name);
    } else if (!category) {
      pushFile(skillsDir, entry, 'Other');
    }
  }
  return skills.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/** Find a skill by `--skill` value: exact file name, stem, or case-insensitive substring. */
function findSkillByName(skills, wanted) {
  const needle = String(wanted || '').trim().toLowerCase();
  if (!needle) return null;
  const stem = (s) => s.name.replace(/\.md$/i, '').toLowerCase();
  return skills.find((s) => s.name.toLowerCase() === needle)
    || skills.find((s) => stem(s) === needle.replace(/\.md$/i, ''))
    || skills.find((s) => stem(s).includes(needle))
    || null;
}

function readSkillContent(skill) {
  if (!skill?.path) return '';
  try {
    return stripFrontmatter(fs.readFileSync(skill.path, 'utf-8'));
  } catch {
    return '';
  }
}

/**
 * Default context documents the renderer pre-selects when a folder holds
 * exactly one candidate. Returned as docs-relative POSIX paths (or null).
 */
function findDefaultContextDocs(docsDir) {
  const single = (folder, ext) => {
    const dir = path.join(docsDir, folder);
    let files;
    try {
      files = fs.readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(ext))
        .map((e) => e.name);
    } catch {
      return null;
    }
    return files.length === 1 ? toPosix(path.join(folder, files[0])) : null;
  };
  return {
    prd: single('Product Requirements Document', '.md'),
    arch: single('Architecture', '.md'),
    styleGuide: single('Style Guide', '.md'),
    // Only the JSON map is useful context — codemap.html is a rendered view.
    codeMap: single('Code Map', '.json')
  };
}

/**
 * `[{ name, status }]` for the "existing epics" block of the epic prompt.
 * epicReader only recognises a bare `Status:` line, so the bullet/bold forms
 * the shipped epics use are re-read here.
 */
function listExistingEpics(epicsDir) {
  return readEpics(epicsDir)
    .map((e) => {
      let status = e.status;
      if (!status) {
        try { status = readEpicStatus(path.join(epicsDir, e.fileName)).toUpperCase(); } catch { status = ''; }
      }
      return { name: e.fileName, status: status || 'NEW' };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Set of `epic_*.md` / any `.md` file names currently in docs/Epics. */
function snapshotEpicFiles(epicsDir) {
  try {
    return new Set(
      fs.readdirSync(epicsDir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
        .map((e) => e.name)
    );
  } catch {
    return new Set();
  }
}

/**
 * Accept `docs/Epics/x.md`, `Epics/x.md`, `x.md` or an absolute path and
 * return `{ fileName, docsRelative: 'Epics/x.md', epicRef: 'docs/Epics/x.md', absolute }`.
 * Throws if the file does not exist.
 */
function resolveEpicPath(projectRoot, input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Epic path is required.');
  const epicsDir = path.join(projectRoot, 'docs', 'Epics');
  let fileName;
  if (path.isAbsolute(raw)) {
    fileName = path.basename(raw);
  } else {
    fileName = path.basename(raw.replace(/^docs[\\/]/i, '').replace(/^Epics[\\/]/i, ''));
  }
  if (!fileName.toLowerCase().endsWith('.md')) fileName = `${fileName}.md`;
  const absolute = path.isAbsolute(raw) ? raw : path.join(epicsDir, fileName);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Epic file not found: ${absolute}`);
  }
  return {
    fileName,
    stem: fileName.replace(/\.md$/i, ''),
    docsRelative: `Epics/${fileName}`,
    epicRef: `docs/Epics/${fileName}`,
    absolute
  };
}

/**
 * Read the `Status:` value of an epic file. Handles `Status: X`,
 * `**Status:** X` and `- **Status:** X`.
 */
function readEpicStatus(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const line = content.split(/\r?\n/).find((l) => /^\s*(?:-\s*)?\*{0,2}Status:/i.test(l));
  if (!line) return '';
  const match = line.match(/Status:\*{0,2}\s*(.*)$/i);
  return match ? match[1].replace(/\*\*/g, '').trim() : '';
}

/**
 * Rewrite the epic's `Status:` line (and bump `Last Updated:`), inserting
 * both when absent — the same rules as main.js `epics:updateStatus`, plus
 * support for the `- **Status:** X` bullet form the shipped epics use.
 */
function updateEpicStatus(filePath, status, { today = new Date().toISOString().split('T')[0] } = {}) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  let statusUpdated = false;
  let lastUpdatedSet = false;

  for (let i = 0; i < lines.length; i += 1) {
    const statusMatch = lines[i].match(/^(\s*(?:-\s*)?\*{0,2}Status:\*{0,2}\s*)(.*)$/i);
    if (statusMatch && !statusUpdated) {
      lines[i] = `${statusMatch[1]}${status}`;
      statusUpdated = true;
      continue;
    }
    const updatedMatch = lines[i].match(/^(\s*(?:-\s*)?\*{0,2}Last Updated:\*{0,2}\s*)(.*)$/i);
    if (updatedMatch && !lastUpdatedSet) {
      lines[i] = `${updatedMatch[1]}${today}`;
      lastUpdatedSet = true;
    }
  }

  if (!statusUpdated) {
    const titleIndex = lines.findIndex((line) => line.startsWith('# '));
    const insertAt = titleIndex >= 0 ? titleIndex + 1 : 0;
    lines.splice(insertAt, 0, `Status: ${status}`);
  }
  if (!lastUpdatedSet) {
    // After `Created:` when present, otherwise directly below the Status line.
    const createdIndex = lines.findIndex((line) => /^\s*(?:-\s*)?\*{0,2}Created:/i.test(line));
    const statusIndex = lines.findIndex((line) => /^\s*(?:-\s*)?\*{0,2}Status:/i.test(line));
    const anchor = createdIndex >= 0 ? createdIndex : statusIndex;
    const insertAt = anchor >= 0 ? anchor + 1 : 1;
    // Mirror the neighbouring line's style (`- **Created:** x` vs `Created: x`).
    const bullet = anchor >= 0 && /^\s*-\s*\*\*/.test(lines[anchor]);
    lines.splice(insertAt, 0, bullet ? `- **Last Updated:** ${today}` : `Last Updated: ${today}`);
  }

  fs.writeFileSync(filePath, lines.join(eol), 'utf-8');
  return { statusUpdated, lastUpdatedSet };
}

module.exports = {
  toPosix,
  stripFrontmatter,
  readFrontmatter,
  scanSkillFiles,
  findSkillByName,
  readSkillContent,
  findDefaultContextDocs,
  listExistingEpics,
  snapshotEpicFiles,
  resolveEpicPath,
  readEpicStatus,
  updateEpicStatus
};
