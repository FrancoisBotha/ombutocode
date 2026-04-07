'use strict';

const path = require('path');
const chokidar = require('chokidar');
const matter = require('gray-matter');
const fs = require('fs');
const { BrowserWindow } = require('electron');
const artifactDb = require('./artifactDb');
const ombutocodeDb = require('./ombutocodeDb');
const { DOCS_DIR, PROJECT_ROOT } = require('./planCoreUtilities');

let watcher = null;
const DEBOUNCE_MS = 300;
const pendingEvents = new Map();

function toRelativeProjectPath(filePath) {
  return path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');
}

function findArtifactByFilePath(relativePath) {
  const artifacts = artifactDb.listArtifacts();
  return artifacts.find((a) => a.file_path === relativePath) || null;
}

function sendToRenderer(artifactId, eventType) {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('watcher:fileChanged', { id: artifactId, eventType });
    }
  }
}

function handleAddOrChange(filePath) {
  try {
    const source = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(source);
    const frontmatter = parsed.data;

    if (!frontmatter.id) {
      return;
    }

    const relativePath = toRelativeProjectPath(filePath);
    const row = {
      id: frontmatter.id,
      type: frontmatter.type || null,
      title: frontmatter.title || '',
      status: frontmatter.status || 'draft',
      parent_id: frontmatter.parent || null,
      file_path: relativePath,
      data: JSON.stringify(frontmatter),
      last_modified: frontmatter.updated || new Date().toISOString().slice(0, 10),
    };

    const existing = artifactDb.getArtifact(frontmatter.id);
    if (existing) {
      artifactDb.updateArtifact(frontmatter.id, row);
    } else {
      artifactDb.insertArtifact(row);
    }
    ombutocodeDb.saveDb();

    sendToRenderer(frontmatter.id, existing ? 'change' : 'add');
  } catch (_error) {
    // File may be temporarily unreadable during writes; ignore
  }
}

function handleUnlink(filePath) {
  const relativePath = toRelativeProjectPath(filePath);
  const artifact = findArtifactByFilePath(relativePath);

  if (artifact) {
    artifactDb.deleteArtifact(artifact.id);
    ombutocodeDb.saveDb();
    sendToRenderer(artifact.id, 'unlink');
  }
}

function debounce(filePath, eventType) {
  if (pendingEvents.has(filePath)) {
    clearTimeout(pendingEvents.get(filePath));
  }

  pendingEvents.set(
    filePath,
    setTimeout(() => {
      pendingEvents.delete(filePath);
      if (eventType === 'unlink') {
        handleUnlink(filePath);
      } else {
        handleAddOrChange(filePath);
      }
    }, DEBOUNCE_MS)
  );
}

function start() {
  if (watcher) {
    return;
  }

  watcher = chokidar.watch(DOCS_DIR, {
    ignored: [
      path.join(DOCS_DIR, '.archive', '**'),
      path.join(DOCS_DIR, '.archive'),
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 50,
    },
  });

  // Only process docs files (md, mmd, images)
  const WATCHED_EXTS = new Set(['.md', '.mmd', '.ddl', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg']);
  const isMd = (filePath) => WATCHED_EXTS.has(path.extname(filePath).toLowerCase());
  const isArchive = (filePath) => {
    const rel = path.relative(DOCS_DIR, filePath);
    return rel.startsWith('.archive') || rel.startsWith(`.archive${path.sep}`);
  };

  watcher
    .on('add', (filePath) => {
      if (isMd(filePath) && !isArchive(filePath)) debounce(filePath, 'add');
    })
    .on('change', (filePath) => {
      if (isMd(filePath) && !isArchive(filePath)) debounce(filePath, 'change');
    })
    .on('unlink', (filePath) => {
      if (isMd(filePath) && !isArchive(filePath)) debounce(filePath, 'unlink');
    });
}

function stop() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  // Clear any pending debounced events
  for (const timer of pendingEvents.values()) {
    clearTimeout(timer);
  }
  pendingEvents.clear();
}

module.exports = { start, stop };
