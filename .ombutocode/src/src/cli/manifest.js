'use strict';

/**
 * `.ombutocode/run-manifest.json` — the machine-readable record of every CLI
 * stage (epic → tickets → run → status). Each command appends one stage
 * record; nothing is ever rewritten, so the file is the audit trail of the
 * whole pipeline for a project.
 *
 * Shape:
 *   { version: 1, stages: [ { stage, command, startedAt, finishedAt, durationMs,
 *                             agent, model, ok, exitCode, tokens, result } ] }
 */

const fs = require('fs');
const path = require('path');

const MANIFEST_VERSION = 1;

function readManifest(manifestPath) {
  try {
    if (!fs.existsSync(manifestPath)) return { version: MANIFEST_VERSION, stages: [] };
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.stages)) {
      return { version: MANIFEST_VERSION, stages: [] };
    }
    return parsed;
  } catch {
    return { version: MANIFEST_VERSION, stages: [] };
  }
}

function writeManifest(manifestPath, manifest) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const tmp = `${manifestPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2), 'utf-8');
  fs.renameSync(tmp, manifestPath);
}

/**
 * Normalise a stage record so every entry has the same keys in the same order.
 */
function buildStageRecord(record = {}) {
  const startedAt = record.startedAt || new Date().toISOString();
  const finishedAt = record.finishedAt || new Date().toISOString();
  const durationMs = Number.isFinite(record.durationMs)
    ? record.durationMs
    : Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  return {
    stage: record.stage,
    command: Array.isArray(record.command) ? record.command : [],
    startedAt,
    finishedAt,
    durationMs,
    agent: record.agent ?? null,
    model: record.model ?? null,
    ok: Boolean(record.ok),
    exitCode: Number.isInteger(record.exitCode) ? record.exitCode : (record.ok ? 0 : 1),
    tokens: record.tokens ?? null,
    result: record.result ?? null
  };
}

/** Append one stage record; returns the record as written. */
function appendManifestStage(manifestPath, record) {
  const manifest = readManifest(manifestPath);
  const entry = buildStageRecord(record);
  manifest.version = MANIFEST_VERSION;
  manifest.stages.push(entry);
  writeManifest(manifestPath, manifest);
  return entry;
}

function lastManifestStage(manifestPath) {
  const manifest = readManifest(manifestPath);
  return manifest.stages.length ? manifest.stages[manifest.stages.length - 1] : null;
}

module.exports = {
  MANIFEST_VERSION,
  readManifest,
  writeManifest,
  buildStageRecord,
  appendManifestStage,
  lastManifestStage
};
