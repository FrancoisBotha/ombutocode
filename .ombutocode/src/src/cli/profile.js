'use strict';

/**
 * Benchmark profiles: `.ombutocode/profiles/<name>.json`.
 *
 *   {
 *     "settings":  { ...headless settings keys... },        in-memory overrides, never persisted
 *     "agents":    { "cooldown_minutes": 0, ... },           applied to every codingagents.yml tool
 *     "scheduler": { "eval_post_merge_cooldown_ms": 0 }      module constants the scheduler exposes
 *   }
 *
 * `_doc` keys are ignored so a profile can document itself.
 */

const fs = require('fs');
const path = require('path');

const { AGENT_OVERRIDE_KEYS } = require('./bootstrap');

const SCHEDULER_OVERRIDE_KEYS = ['eval_post_merge_cooldown_ms'];

function stripDocKeys(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('_')) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Parse a profile object into the override sets `bootProject` understands.
 * Unknown agent/scheduler keys are reported in `ignored` rather than applied.
 */
function normalizeProfile(raw, name = 'profile') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Profile "${name}" must be a JSON object.`);
  }
  const settings = stripDocKeys(raw.settings);
  const agentsRaw = stripDocKeys(raw.agents);
  const schedulerRaw = stripDocKeys(raw.scheduler);
  const ignored = [];

  const agents = {};
  for (const [key, value] of Object.entries(agentsRaw)) {
    if (AGENT_OVERRIDE_KEYS.includes(key)) agents[key] = value;
    else ignored.push(`agents.${key}`);
  }
  const scheduler = {};
  for (const [key, value] of Object.entries(schedulerRaw)) {
    if (SCHEDULER_OVERRIDE_KEYS.includes(key)) scheduler[key] = value;
    else ignored.push(`scheduler.${key}`);
  }

  return { name, settings, agents, scheduler, ignored };
}

/**
 * Load `<profilesDir>/<name>.json`. Throws with a clear message when the
 * file is missing or malformed.
 */
function loadProfile(profilesDir, name) {
  const safeName = path.basename(String(name || '').trim());
  if (!safeName) throw new Error('Profile name is required.');
  const filePath = path.join(profilesDir, safeName.endsWith('.json') ? safeName : `${safeName}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Profile not found: ${filePath}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    throw new Error(`Profile ${filePath} is not valid JSON: ${error.message}`);
  }
  return { ...normalizeProfile(parsed, safeName.replace(/\.json$/i, '')), path: filePath };
}

/** Translate a normalised profile into `bootProject` options. */
function profileToBootOptions(profile) {
  if (!profile) return {};
  const out = {
    settingsOverrides: profile.settings || {},
    agentOverrides: profile.agents || {}
  };
  const cooldown = profile.scheduler?.eval_post_merge_cooldown_ms;
  if (Number.isFinite(cooldown)) out.evalPostMergeCooldownMs = cooldown;
  return out;
}

module.exports = {
  SCHEDULER_OVERRIDE_KEYS,
  normalizeProfile,
  loadProfile,
  profileToBootOptions
};
