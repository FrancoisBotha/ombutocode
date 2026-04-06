'use strict';

const fs = require('fs');
const path = require('path');

/**
 * One-time migration from pre-restructure docs/ layout to .ombutocode/ layout.
 * Detects whether migration is needed by checking if docs/planning/backlog.yml
 * exists but .ombutocode/planning/backlog.yml does not.
 *
 * Moves (not copies) files to avoid duplication. Skips files that don't exist.
 *
 * @param {string} projectRoot - The target project root directory
 * @returns {{ migrated: boolean, moved: string[], skipped: string[] }}
 */
function migrateToOmbutocodeStructure(projectRoot) {
  const ombutocodeDir = path.join(projectRoot, '.ombutocode');
  const oldBacklog = path.join(projectRoot, 'docs', 'planning', 'backlog.yml');
  const newBacklog = path.join(ombutocodeDir, 'planning', 'backlog.yml');

  // Only migrate if old layout exists and new layout doesn't
  if (!fs.existsSync(oldBacklog) || fs.existsSync(newBacklog)) {
    return { migrated: false, moved: [], skipped: [] };
  }

  const moved = [];
  const skipped = [];

  function moveFile(src, dst) {
    if (!fs.existsSync(src)) {
      skipped.push(src);
      return;
    }
    const dstDir = path.dirname(dst);
    if (!fs.existsSync(dstDir)) {
      fs.mkdirSync(dstDir, { recursive: true });
    }
    fs.renameSync(src, dst);
    moved.push(`${src} → ${dst}`);
  }

  // Planning files
  moveFile(
    path.join(projectRoot, 'docs', 'planning', 'backlog.yml'),
    path.join(ombutocodeDir, 'planning', 'backlog.yml')
  );
  moveFile(
    path.join(projectRoot, 'docs', 'planning', 'archive.db'),
    path.join(ombutocodeDir, 'planning', 'archive.db')
  );
  moveFile(
    path.join(projectRoot, 'docs', 'planning', 'archive.yml'),
    path.join(ombutocodeDir, 'planning', 'archive.yml')
  );
  moveFile(
    path.join(projectRoot, 'docs', 'planning', 'archive.yml.migrated'),
    path.join(ombutocodeDir, 'planning', 'archive.yml.migrated')
  );

  // Data files
  moveFile(
    path.join(projectRoot, 'docs', 'planning', 'requests.db'),
    path.join(ombutocodeDir, 'data', 'requests.db')
  );
  moveFile(
    path.join(projectRoot, 'docs', 'data', 'ombutocode.db'),
    path.join(ombutocodeDir, 'data', 'ombutocode.db')
  );

  // Feature specs
  const featuresDir = path.join(projectRoot, 'docs', 'features');
  if (fs.existsSync(featuresDir)) {
    const featuresDst = path.join(ombutocodeDir, 'features');
    if (!fs.existsSync(featuresDst)) {
      fs.mkdirSync(featuresDst, { recursive: true });
    }
    for (const file of fs.readdirSync(featuresDir)) {
      const src = path.join(featuresDir, file);
      if (fs.statSync(src).isFile()) {
        moveFile(src, path.join(featuresDst, file));
      }
    }
  }

  // Templates
  const templatesDir = path.join(projectRoot, 'docs', 'templates');
  if (fs.existsSync(templatesDir)) {
    const templatesDst = path.join(ombutocodeDir, 'templates');
    if (!fs.existsSync(templatesDst)) {
      fs.mkdirSync(templatesDst, { recursive: true });
    }
    for (const file of fs.readdirSync(templatesDir)) {
      const src = path.join(templatesDir, file);
      if (fs.statSync(src).isFile()) {
        moveFile(src, path.join(templatesDst, file));
      }
    }
  }

  return { migrated: true, moved, skipped };
}

module.exports = { migrateToOmbutocodeStructure };
