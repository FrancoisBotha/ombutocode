'use strict';

const fs = require('fs');
const path = require('path');

// DOCS_DIR is set by init() from main.js which knows PROJECT_ROOT
let DOCS_DIR = null;

function init(projectRoot) {
  DOCS_DIR = path.join(projectRoot, 'docs');
}

/**
 * FileTreeService — filesystem operations over the docs/ directory.
 * Provides scan, readFile, and writeFile for the renderer process.
 */

/**
 * Recursively scan a directory and return a tree of folders and .md files.
 * Excludes the .archive/ directory and non-.md files.
 */
function scanDir(dirPath, relativeTo) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const folders = [];
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (entry.name === '.archive') continue;
      const children = scanDir(fullPath, relativeTo);
      folders.push({
        name: entry.name,
        path: relPath,
        type: 'folder',
        children,
      });
    } else if (entry.isFile() && /\.(md|mmd|ddl|txt|png|jpg|jpeg|gif|bmp|webp|svg)$/i.test(entry.name)) {
      files.push({
        name: entry.name,
        path: relPath,
        type: 'file',
      });
    }
  }

  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return [...folders, ...files];
}

/**
 * Scan the docs/ directory and return a tree structure.
 * @returns {{ name: string, path: string, type: "folder", children: Array }}
 */
function scan() {
  if (!fs.existsSync(DOCS_DIR)) {
    return { name: 'docs', path: '', type: 'folder', children: [] };
  }
  const children = scanDir(DOCS_DIR, DOCS_DIR);
  return { name: 'docs', path: '', type: 'folder', children };
}

/**
 * Read a .md file relative to docs/ and return its raw content.
 * @param {string} relativePath - path relative to docs/
 * @returns {string} raw Markdown content
 */
function readFile(relativePath) {
  const resolved = path.resolve(DOCS_DIR, relativePath);
  if (!resolved.startsWith(DOCS_DIR)) {
    throw new Error('Path is outside docs/ directory');
  }
  return fs.readFileSync(resolved, 'utf-8');
}

/**
 * Write content to a .md file relative to docs/.
 * @param {string} relativePath - path relative to docs/
 * @param {string} content - file content to write
 * @returns {{ success: true }}
 */
function writeFile(relativePath, content) {
  const resolved = path.resolve(DOCS_DIR, relativePath);
  if (!resolved.startsWith(DOCS_DIR)) {
    throw new Error('Path is outside docs/ directory');
  }
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(resolved, content, 'utf-8');
  return { success: true };
}

/**
 * Delete a file relative to docs/.
 * @param {string} relativePath
 * @returns {{ success: true }}
 */
function deleteFile(relativePath) {
  const resolved = path.resolve(DOCS_DIR, relativePath);
  if (!resolved.startsWith(DOCS_DIR)) {
    throw new Error('Path is outside docs/ directory');
  }
  if (!fs.existsSync(resolved)) {
    throw new Error('File not found');
  }
  fs.unlinkSync(resolved);
  return { success: true };
}

/**
 * Create a subfolder within docs/.
 */
function createFolder(relativePath) {
  const resolved = path.resolve(DOCS_DIR, relativePath);
  if (!resolved.startsWith(DOCS_DIR)) {
    throw new Error('Path is outside docs/ directory');
  }
  if (fs.existsSync(resolved)) {
    throw new Error('Folder already exists');
  }
  fs.mkdirSync(resolved, { recursive: true });
  return { success: true };
}

/**
 * Delete a folder within docs/ recursively — removes the folder and
 * everything inside it (subfolders and files). The renderer-side
 * confirmation dialog is responsible for warning the user, and the
 * folder tree UI refuses to call this for top-level docs/ categories
 * (depth === 0).
 *
 * Extra guard: refuses to operate on the docs/ root itself, even if
 * a caller passes an empty path.
 */
function deleteFolder(relativePath) {
  const resolved = path.resolve(DOCS_DIR, relativePath);
  if (!resolved.startsWith(DOCS_DIR)) {
    throw new Error('Path is outside docs/ directory');
  }
  if (resolved === DOCS_DIR) {
    throw new Error('Refusing to delete the docs/ root');
  }
  if (!fs.existsSync(resolved)) {
    throw new Error('Folder not found');
  }
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error('Path is not a folder');
  }
  fs.rmSync(resolved, { recursive: true, force: false });
  return { success: true };
}

/**
 * Rename (move) a file within docs/.
 * @param {string} oldRelPath
 * @param {string} newRelPath
 * @returns {{ success: true }}
 */
function renameFile(oldRelPath, newRelPath) {
  const oldResolved = path.resolve(DOCS_DIR, oldRelPath);
  const newResolved = path.resolve(DOCS_DIR, newRelPath);
  if (!oldResolved.startsWith(DOCS_DIR) || !newResolved.startsWith(DOCS_DIR)) {
    throw new Error('Path is outside docs/ directory');
  }
  if (!fs.existsSync(oldResolved)) {
    throw new Error('File not found');
  }
  const dir = path.dirname(newResolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.renameSync(oldResolved, newResolved);
  return { success: true };
}

/**
 * Scan the Mockups subdirectory for image files.
 * @returns {Array<{ name: string, path: string }>}
 */
function scanMockups() {
  const mockupsDir = path.join(DOCS_DIR, 'Mockups');
  if (!fs.existsSync(mockupsDir)) return [];
  const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
  const entries = fs.readdirSync(mockupsDir, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && IMAGE_EXTS.includes(path.extname(e.name).toLowerCase()))
    .map(e => ({ name: e.name, path: 'Mockups/' + e.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Read an image file from docs/ and return it as a base64 data URL.
 * @param {string} relativePath - path relative to docs/
 * @returns {string} data URL
 */
function readImageAsDataUrl(relativePath) {
  const resolved = path.resolve(DOCS_DIR, relativePath);
  if (!resolved.startsWith(DOCS_DIR)) {
    throw new Error('Path is outside docs/ directory');
  }
  const ext = path.extname(resolved).toLowerCase();
  const mimeMap = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  };
  const mime = mimeMap[ext] || 'application/octet-stream';
  const data = fs.readFileSync(resolved).toString('base64');
  return `data:${mime};base64,${data}`;
}

/**
 * Scan the Use Case Diagrams subdirectory for .mmd files.
 * @returns {Array<{ name: string, path: string }>}
 */
function scanUseCaseDiagrams() {
  const dir = path.join(DOCS_DIR, 'Use Case Diagrams');
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.mmd'))
    .map(e => ({ name: e.name, path: 'Use Case Diagrams/' + e.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Scan the Use Cases subdirectory for .md files.
 */
function scanUseCases() {
  const dir = path.join(DOCS_DIR, 'Use Cases');
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.md'))
    .map(e => ({ name: e.name, path: 'Use Cases/' + e.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Return a flat list of all docs files for artifact linking.
 */
function scanAllFiles() {
  if (!fs.existsSync(DOCS_DIR)) return [];
  const results = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === '.archive') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); }
      else if (e.isFile() && /\.(md|mmd)$/i.test(e.name)) {
        results.push({
          name: e.name,
          path: path.relative(DOCS_DIR, full).replace(/\\/g, '/'),
        });
      }
    }
  }
  walk(DOCS_DIR);
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Scan the Class Diagrams subdirectory for .mmd files.
 */
function scanClassDiagrams() {
  const dir = path.join(DOCS_DIR, 'Class Diagrams');
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.mmd'))
    .map(e => ({ name: e.name, path: 'Class Diagrams/' + e.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { init, scan, readFile, writeFile, deleteFile, createFolder, deleteFolder, renameFile, scanMockups, readImageAsDataUrl, scanUseCaseDiagrams, scanUseCases, scanAllFiles, scanClassDiagrams };
