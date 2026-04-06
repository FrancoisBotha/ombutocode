import { createApp } from 'vue';
import logger, { LOG_LEVELS } from '@/utils/logger';

// Set log level based on environment
const logLevel = import.meta.env.DEV ? 'DEBUG' : 'INFO';
logger.setLevel(logLevel);

const LoggerPlugin = {
  install(app) {
    // Make logger available globally
    app.config.globalProperties.$log = logger;
    
    // Also provide it for Composition API
    app.provide('logger', logger);
    
    // Log app initialization
    logger.info('Logger plugin initialized with level:', logger.getLevel());
  }
};

export default LoggerPlugin;
