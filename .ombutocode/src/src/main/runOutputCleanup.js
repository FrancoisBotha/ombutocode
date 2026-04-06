const fs = require('fs');
const path = require('path');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Delete stdout/stderr log files in the run-output directory that are older than 7 days.
 * Skips files belonging to currently active runs.
 *
 * @param {string} runOutputDir - Absolute path to the run-output directory
 * @param {Set<string>} activeFiles - Set of absolute file paths for currently active runs
 * @param {{ log?: Function, warn?: Function }} [logger=console] - Logger for output
 */
function cleanupRunOutput(runOutputDir, activeFiles = new Set(), logger = console) {
  try {
    if (!fs.existsSync(runOutputDir)) return;

    const now = Date.now();
    const cutoff = now - SEVEN_DAYS_MS;
    const files = fs.readdirSync(runOutputDir);
    let removedCount = 0;

    for (const file of files) {
      const filePath = path.join(runOutputDir, file);
      if (activeFiles.has(filePath)) continue;

      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          removedCount++;
        }
      } catch (err) {
        // Skip files that can't be stat'd or removed (e.g. permission issues)
      }
    }

    if (removedCount > 0) {
      (logger.log || logger.info || logger.warn).call(
        logger,
        `[RunOutputCleanup] Removed ${removedCount} log file(s) older than 7 days`
      );
    }
  } catch (error) {
    (logger.warn || logger.log).call(
      logger,
      'Unable to clean up run-output directory:',
      error?.message || error
    );
  }
}

module.exports = { cleanupRunOutput };
