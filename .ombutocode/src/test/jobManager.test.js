'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// sql.js loaded from the project's own dependency
const initSqlJs = require('sql.js');

const jobManager = require('../src/main/jobManager');

let SQL;
let db;

async function setup() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  db = new SQL.Database();
  // Enable foreign key enforcement (off by default in SQLite)
  db.run('PRAGMA foreign_keys = ON');
  jobManager.open(db);
}

function teardown() {
  jobManager.close();
  if (db) {
    db.close();
    db = null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedDefaults() {
  db.run(`
    INSERT INTO default_exclusion_pattern (pattern, category, description, is_active)
    VALUES ('node_modules', 'build', 'Node deps', 1),
           ('.git', 'vcs', 'Git directory', 1),
           ('*.tmp', 'misc', 'Temp files', 0)
  `);
}

function validJobData(overrides = {}) {
  return {
    name: 'My Backup',
    source_path: 'C:\\Users\\me\\docs',
    dropbox_target: '/DropSync/docs',
    interval_minutes: 60,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('jobManager', async () => {
  beforeEach(async () => await setup());
  afterEach(() => teardown());

  // -- open / close ---------------------------------------------------------

  it('throws if open() receives a non-db argument', () => {
    jobManager.close();
    assert.throws(() => jobManager.open(null), /sql\.js Database instance is required/);
    assert.throws(() => jobManager.open({}), /sql\.js Database instance is required/);
  });

  it('throws on CRUD calls before open()', () => {
    jobManager.close();
    assert.throws(() => jobManager.listJobs(), /not initialized/);
  });

  // -- createJob ------------------------------------------------------------

  describe('createJob', () => {
    it('inserts a backup_job row and returns it with an id', () => {
      const job = jobManager.createJob(validJobData());
      assert.ok(job.id);
      assert.equal(job.name, 'My Backup');
      assert.equal(job.source_path, 'C:\\Users\\me\\docs');
      assert.equal(job.interval_minutes, 60);
      assert.equal(job.enabled, true);
      assert.equal(job.strict_checksum, false);
      assert.equal(job.mirror_deletes, false);
    });

    it('seeds exclusion rules from active default_exclusion_pattern rows', () => {
      seedDefaults();
      const job = jobManager.createJob(validJobData());
      const rules = jobManager.listExclusionRulesForJob(job.id);
      const patterns = rules.map((r) => r.pattern).sort();
      // Only active defaults: node_modules and .git (*.tmp is inactive)
      assert.deepEqual(patterns, ['.git', 'node_modules']);
    });

    it('merges caller-supplied patterns with defaults', () => {
      seedDefaults();
      const job = jobManager.createJob(
        validJobData({ exclusion_patterns: ['*.log', 'node_modules'] })
      );
      const rules = jobManager.listExclusionRulesForJob(job.id);
      const patterns = rules.map((r) => r.pattern).sort();
      // node_modules appears only once despite being in both sets
      assert.deepEqual(patterns, ['.git', '*.log', 'node_modules'].sort());
    });

    it('rejects duplicate job names', () => {
      jobManager.createJob(validJobData());
      assert.throws(
        () => jobManager.createJob(validJobData()),
        /already exists/
      );
    });

    it('rejects interval_minutes <= 0', () => {
      assert.throws(
        () => jobManager.createJob(validJobData({ interval_minutes: 0 })),
        /positive number/
      );
      assert.throws(
        () => jobManager.createJob(validJobData({ interval_minutes: -5 })),
        /positive number/
      );
    });

    it('inserts job and rules in a single transaction (rolls back on failure)', () => {
      seedDefaults();
      // First job succeeds
      jobManager.createJob(validJobData());
      // Duplicate name should fail and not leave partial data
      assert.throws(() => jobManager.createJob(validJobData({ name: 'My Backup' })));
      assert.equal(jobManager.listJobs().length, 1);
    });
  });

  // -- listJobs / getJob ----------------------------------------------------

  describe('listJobs / getJob', () => {
    it('returns an empty array when no jobs exist', () => {
      assert.deepEqual(jobManager.listJobs(), []);
    });

    it('lists all jobs ordered by name', () => {
      jobManager.createJob(validJobData({ name: 'Zebra' }));
      jobManager.createJob(validJobData({ name: 'Alpha' }));
      const jobs = jobManager.listJobs();
      assert.equal(jobs.length, 2);
      assert.equal(jobs[0].name, 'Alpha');
      assert.equal(jobs[1].name, 'Zebra');
    });

    it('getJob returns null for non-existent id', () => {
      assert.equal(jobManager.getJob(999), null);
    });

    it('getJob returns the correct job', () => {
      const created = jobManager.createJob(validJobData());
      const fetched = jobManager.getJob(created.id);
      assert.equal(fetched.name, created.name);
    });
  });

  // -- updateJob ------------------------------------------------------------

  describe('updateJob', () => {
    it('updates allowed fields', () => {
      const job = jobManager.createJob(validJobData());
      const updated = jobManager.updateJob(job.id, {
        name: 'Renamed',
        interval_minutes: 120,
        strict_checksum: true,
      });
      assert.equal(updated.name, 'Renamed');
      assert.equal(updated.interval_minutes, 120);
      assert.equal(updated.strict_checksum, true);
    });

    it('returns null for non-existent id', () => {
      assert.equal(jobManager.updateJob(999, { name: 'x' }), null);
    });

    it('rejects duplicate name on update', () => {
      jobManager.createJob(validJobData({ name: 'A' }));
      const b = jobManager.createJob(validJobData({ name: 'B' }));
      assert.throws(
        () => jobManager.updateJob(b.id, { name: 'A' }),
        /already exists/
      );
    });

    it('rejects non-positive interval on update', () => {
      const job = jobManager.createJob(validJobData());
      assert.throws(
        () => jobManager.updateJob(job.id, { interval_minutes: 0 }),
        /positive number/
      );
    });

    it('does not touch last_run_at or next_run_at', () => {
      const job = jobManager.createJob(validJobData());
      // Manually set scheduler-owned fields
      db.run(
        "UPDATE backup_job SET last_run_at = '2026-01-01', next_run_at = '2026-01-02' WHERE id = ?",
        [job.id]
      );
      const updated = jobManager.updateJob(job.id, { name: 'Renamed' });
      assert.equal(updated.last_run_at, '2026-01-01');
      assert.equal(updated.next_run_at, '2026-01-02');
    });
  });

  // -- deleteJob ------------------------------------------------------------

  describe('deleteJob', () => {
    it('removes the job and its exclusion rules', () => {
      seedDefaults();
      const job = jobManager.createJob(validJobData());
      const rulesBefore = jobManager.listExclusionRulesForJob(job.id);
      assert.ok(rulesBefore.length > 0);

      const result = jobManager.deleteJob(job.id);
      assert.equal(result, true);
      assert.equal(jobManager.getJob(job.id), null);
      assert.deepEqual(jobManager.listExclusionRulesForJob(job.id), []);
    });

    it('returns false for non-existent id', () => {
      assert.equal(jobManager.deleteJob(999), false);
    });

    it('runs delete in a transaction', () => {
      const job = jobManager.createJob(validJobData());
      // Verify it deletes cleanly (transaction commit)
      assert.equal(jobManager.deleteJob(job.id), true);
      assert.equal(jobManager.listJobs().length, 0);
    });
  });

  // -- toggleJobEnabled -----------------------------------------------------

  describe('toggleJobEnabled', () => {
    it('flips enabled from true to false', () => {
      const job = jobManager.createJob(validJobData());
      assert.equal(job.enabled, true);
      const toggled = jobManager.toggleJobEnabled(job.id);
      assert.equal(toggled.enabled, false);
    });

    it('flips enabled from false to true', () => {
      const job = jobManager.createJob(validJobData({ enabled: false }));
      assert.equal(job.enabled, false);
      const toggled = jobManager.toggleJobEnabled(job.id);
      assert.equal(toggled.enabled, true);
    });

    it('does not modify other fields', () => {
      const job = jobManager.createJob(validJobData({ strict_checksum: true }));
      const toggled = jobManager.toggleJobEnabled(job.id);
      assert.equal(toggled.strict_checksum, true);
      assert.equal(toggled.name, job.name);
      assert.equal(toggled.interval_minutes, job.interval_minutes);
    });

    it('returns null for non-existent id', () => {
      assert.equal(jobManager.toggleJobEnabled(999), null);
    });
  });

  // -- exclusion rule helpers -----------------------------------------------

  describe('exclusion rule helpers', () => {
    it('listExclusionRulesForJob returns rules for a specific job', () => {
      const job = jobManager.createJob(
        validJobData({ exclusion_patterns: ['*.log', '*.tmp'] })
      );
      const rules = jobManager.listExclusionRulesForJob(job.id);
      assert.equal(rules.length, 2);
    });

    it('replaceExclusionRulesForJob replaces all rules', () => {
      const job = jobManager.createJob(
        validJobData({ exclusion_patterns: ['*.log'] })
      );
      const newRules = jobManager.replaceExclusionRulesForJob(job.id, [
        '*.bak',
        'temp/',
      ]);
      assert.equal(newRules.length, 2);
      const patterns = newRules.map((r) => r.pattern).sort();
      assert.deepEqual(patterns, ['*.bak', 'temp/']);
    });

    it('replaceExclusionRulesForJob deduplicates and skips blanks', () => {
      const job = jobManager.createJob(validJobData());
      const rules = jobManager.replaceExclusionRulesForJob(job.id, [
        '*.log',
        '  ',
        '*.log',
        '',
      ]);
      assert.equal(rules.length, 1);
      assert.equal(rules[0].pattern, '*.log');
    });

    it('replaceExclusionRulesForJob throws for non-existent job', () => {
      assert.throws(
        () => jobManager.replaceExclusionRulesForJob(999, ['*.log']),
        /not found/
      );
    });
  });
});
