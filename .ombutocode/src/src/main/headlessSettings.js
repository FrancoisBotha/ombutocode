'use strict';

const fs = require('fs');
const path = require('path');

/**
 * File-based settings store that matches electron-store's get/set/delete API.
 * Stores settings in .ombutocode/data/headless-settings.json.
 *
 * Supports environment variable overrides:
 *   OMBUTOCODE_EVAL_DEFAULT_AGENT  -> eval_default_agent
 *   OMBUTOCODE_REFRESH_INTERVAL    -> app_refresh_interval
 *   OMBUTOCODE_MAX_EVAL_RETRIES    -> max_eval_retries
 */

const DEFAULTS = {
  project_name: '',
  eval_default_agent: null,
  eval_default_model: null,
  ad_hoc_ticket_agent: null,
  ad_hoc_ticket_model: null,
  app_refresh_interval: 30,
  enable_review_notification_sound: true,
  max_eval_retries: 2,
  theme: 'light'
};

const ENV_OVERRIDES = {
  OMBUTOCODE_EVAL_DEFAULT_AGENT: 'eval_default_agent',
  OMBUTOCODE_REFRESH_INTERVAL: 'app_refresh_interval',
  OMBUTOCODE_MAX_EVAL_RETRIES: 'max_eval_retries'
};

/**
 * Create a headless settings store.
 * @param {string} ombutocodeDir - Path to the .ombutocode directory
 * @returns {{ get: Function, set: Function, delete: Function }}
 */
function createHeadlessSettings(ombutocodeDir) {
  const settingsPath = path.join(ombutocodeDir, 'data', 'headless-settings.json');
  let data = {};

  // Load existing settings from disk
  try {
    if (fs.existsSync(settingsPath)) {
      data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
  } catch (err) {
    console.warn('[HeadlessSettings] Failed to load settings, using defaults:', err.message);
    data = {};
  }

  function persist() {
    try {
      const dir = path.dirname(settingsPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[HeadlessSettings] Failed to persist settings:', err.message);
    }
  }

  function get(key, defaultValue) {
    // Check environment variable overrides first
    for (const [envKey, settingKey] of Object.entries(ENV_OVERRIDES)) {
      if (settingKey === key && process.env[envKey] !== undefined) {
        const envVal = process.env[envKey];
        // Coerce numeric values
        if (key === 'app_refresh_interval' || key === 'max_eval_retries') {
          const num = Number(envVal);
          return Number.isFinite(num) ? num : (defaultValue !== undefined ? defaultValue : DEFAULTS[key]);
        }
        return envVal;
      }
    }

    if (key in data) {
      return data[key];
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    return DEFAULTS[key] !== undefined ? DEFAULTS[key] : undefined;
  }

  function set(key, value) {
    data[key] = value;
    persist();
  }

  function del(key) {
    delete data[key];
    persist();
  }

  return { get, set, delete: del };
}

module.exports = { createHeadlessSettings };
