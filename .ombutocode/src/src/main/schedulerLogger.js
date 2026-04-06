'use strict';

const logsDb = require('./logsDb');

/**
 * Create a logSchedulerEvent function that inserts into the logs database.
 * Wrapped in try/catch so logging never crashes the scheduler.
 *
 * @returns {Function} logSchedulerEvent(eventType, severity, message, opts?)
 */
function createSchedulerLogger() {
  /**
   * @param {string} eventType - Event type constant (e.g. 'scheduler.started')
   * @param {string} severity - 'debug' | 'info' | 'warn' | 'error'
   * @param {string} message - Human-readable message
   * @param {Object} [opts] - Optional fields
   * @param {string} [opts.ticketId]
   * @param {string} [opts.runId]
   * @param {string} [opts.agentName]
   * @param {Object|string} [opts.details]
   */
  function logSchedulerEvent(eventType, severity, message, opts = {}) {
    try {
      logsDb.insertLog({
        timestamp: new Date().toISOString(),
        event_type: eventType,
        severity,
        ticket_id: opts.ticketId || null,
        run_id: opts.runId || null,
        agent_name: opts.agentName || null,
        message,
        details: opts.details || null
      });
    } catch (err) {
      // Never let logging crash the caller
      console.error('[SchedulerLogger] Failed to write log:', err?.message || err);
    }
  }

  return logSchedulerEvent;
}

module.exports = { createSchedulerLogger };
