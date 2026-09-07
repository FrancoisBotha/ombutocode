const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { normalizeProfile, loadProfile, profileToBootOptions } = require('../src/cli/profile');
const { applySettingsOverrides, applyAgentOverrides } = require('../src/cli/bootstrap');
const { createHeadlessSettings } = require('../src/main/headlessSettings');
const { createScheduler } = require('../src/main/scheduler');

test('normalizeProfile keeps settings, known agent/scheduler keys, ignores _doc and unknown keys', () => {
  const profile = normalizeProfile({
    _doc: 'ignored',
    settings: { run_summary_enabled: false, app_refresh_interval: 5, _note: 'x' },
    agents: { cooldown_minutes: 0, max_concurrent: 4, colour: 'blue' },
    scheduler: { eval_post_merge_cooldown_ms: 0, tick_ms: 1 }
  }, 'bench');
  assert.deepEqual(profile.settings, { run_summary_enabled: false, app_refresh_interval: 5 });
  assert.deepEqual(profile.agents, { cooldown_minutes: 0, max_concurrent: 4 });
  assert.deepEqual(profile.scheduler, { eval_post_merge_cooldown_ms: 0 });
  assert.deepEqual(profile.ignored, ['agents.colour', 'scheduler.tick_ms']);
  assert.throws(() => normalizeProfile([]), /must be a JSON object/);
});

test('loadProfile reads <dir>/<name>.json and reports missing/invalid files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-profiles-'));
  fs.writeFileSync(path.join(dir, 'fast.json'), JSON.stringify({ settings: { max_eval_retries: 1 }, agents: { rate_limit_cooldown_minutes: 0 } }));
  fs.writeFileSync(path.join(dir, 'broken.json'), '{ nope');
  const loaded = loadProfile(dir, 'fast');
  assert.equal(loaded.name, 'fast');
  assert.deepEqual(loaded.settings, { max_eval_retries: 1 });
  assert.deepEqual(loaded.agents, { rate_limit_cooldown_minutes: 0 });
  assert.equal(loadProfile(dir, 'fast.json').name, 'fast');
  assert.throws(() => loadProfile(dir, 'missing'), /Profile not found/);
  assert.throws(() => loadProfile(dir, 'broken'), /not valid JSON/);
});

test('the shipped benchmark profile zeroes every cooldown and turns run summaries off', () => {
  const profile = loadProfile(path.resolve(__dirname, '..', '..', 'profiles'), 'benchmark');
  assert.equal(profile.settings.run_summary_enabled, false);
  assert.equal(profile.settings.app_refresh_interval, 5);
  // Retries are left to the app default / OMBUTOCODE_MAX_EVAL_RETRIES so an
  // experiment can set them without editing the profile.
  assert.equal(profile.settings.max_eval_retries, undefined);
  assert.equal(profile.settings.retain_run_output, true);
  assert.deepEqual(profile.agents, { cooldown_minutes: 0, rolling_window_hours: 0, rate_limit_cooldown_minutes: 0, max_concurrent: 2 });
  assert.equal(profile.scheduler.eval_post_merge_cooldown_ms, 0);
  assert.deepEqual(profile.ignored, []);
  assert.deepEqual(profileToBootOptions(profile), {
    settingsOverrides: profile.settings,
    agentOverrides: profile.agents,
    evalPostMergeCooldownMs: 0
  });
});

test('settings overrides are read in memory and never persisted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-settings-'));
  const base = createHeadlessSettings(dir);
  base.set('app_refresh_interval', 30);
  const wrapped = applySettingsOverrides(base, { app_refresh_interval: 5, run_summary_enabled: false });
  assert.equal(wrapped.get('app_refresh_interval', 30), 5);
  assert.equal(wrapped.get('run_summary_enabled', true), false);
  assert.equal(wrapped.get('max_eval_retries', 2), 2);
  wrapped.set('theme', 'light');
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'headless-settings.json'), 'utf-8'));
  assert.deepEqual(onDisk, { app_refresh_interval: 30, theme: 'light' });
  assert.equal(applySettingsOverrides(base, {}), base);
});

test('agent overrides patch every tool returned by readAgentsConfig', () => {
  const readAgentsConfig = () => ({
    version: 1,
    tools: [
      { id: 'claude', enabled: true, cooldown_minutes: 5, rolling_window_hours: 5, max_concurrent: 1, models: [] },
      { id: 'codex', enabled: true, cooldown_minutes: 5, rolling_window_hours: 5, max_concurrent: 1, models: [] }
    ]
  });
  const wrapped = applyAgentOverrides(readAgentsConfig, { cooldown_minutes: 0, rolling_window_hours: 0, rate_limit_cooldown_minutes: 0, max_concurrent: 2, colour: 'blue' });
  const config = wrapped();
  for (const tool of config.tools) {
    assert.equal(tool.cooldown_minutes, 0);
    assert.equal(tool.rolling_window_hours, 0);
    assert.equal(tool.rate_limit_cooldown_minutes, 0);
    assert.equal(tool.max_concurrent, 2);
    assert.equal(tool.colour, undefined);
  }
  assert.equal(applyAgentOverrides(readAgentsConfig, {}), readAgentsConfig);
});

test('rate_limit_cooldown_minutes 0 stops the scheduler pausing on a rate-limit without reset time', () => {
  const { parseProviderPauseFromRun } = require('../src/main/scheduler');
  const run = { state: 'failed', stderr: 'Error: rate limit exceeded, try again later' };
  assert.ok(parseProviderPauseFromRun(run, {})?.pauseUntil, 'default config pauses for 60 minutes');
  assert.equal(parseProviderPauseFromRun(run, { rate_limit_cooldown_minutes: 0 }), null);
});

test('the scheduler takes evalPostMergeCooldownMs from its deps (default 15 s, profile 0)', () => {
  const agentRuntime = { runsById: new Map(), activeRunByTicket: new Map(), getRunStatus: () => null };
  const build = (evalPostMergeCooldownMs, events) => createScheduler({
    readBacklogData: () => ({ tickets: [] }),
    writeBacklogData: () => {},
    readAgentsConfig: () => ({ tools: [] }),
    agentRuntime,
    projectRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-sched-')),
    epicsDir: null,
    logEvent: (type, severity, message, opts) => events.push({ type, details: opts?.details }),
    ...(evalPostMergeCooldownMs === undefined ? {} : { evalPostMergeCooldownMs })
  });

  const defaultEvents = [];
  build(undefined, defaultEvents).recordSquashMerge();
  assert.equal(defaultEvents.find((e) => e.type === 'eval.post_merge_cooldown').details.cooldownMs, 15000);

  const zeroEvents = [];
  build(0, zeroEvents).recordSquashMerge();
  assert.equal(zeroEvents.find((e) => e.type === 'eval.post_merge_cooldown').details.cooldownMs, 0);
});
