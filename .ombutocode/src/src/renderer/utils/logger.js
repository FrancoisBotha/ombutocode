// Log levels
const LOG_LEVELS = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  TRACE: 5
};

// Default log level
let currentLogLevel = LOG_LEVELS.INFO;

// Logger class
class Logger {
  constructor(prefix = '') {
    this.prefix = prefix ? `[${prefix}]` : '';
  }

  setLevel(level) {
    if (typeof level === 'string') {
      level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
    }
    currentLogLevel = level;
  }

  getLevel() {
    return Object.entries(LOG_LEVELS).find(([_, value]) => value === currentLogLevel)?.[0] || 'UNKNOWN';
  }

  error(...args) {
    if (currentLogLevel >= LOG_LEVELS.ERROR) {
      console.error(this.prefix, ...args);
    }
  }

  warn(...args) {
    if (currentLogLevel >= LOG_LEVELS.WARN) {
      console.warn(this.prefix, ...args);
    }
  }

  info(...args) {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
      console.info(this.prefix, ...args);
    }
  }

  debug(...args) {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      console.debug(this.prefix, ...args);
    }
  }

  trace(...args) {
    if (currentLogLevel >= LOG_LEVELS.TRACE) {
      console.trace(this.prefix, ...args);
    }
  }
}

// Create a default logger instance
const logger = new Logger();

// Export both the default logger and the Logger class
export { Logger, LOG_LEVELS };
export default logger;
