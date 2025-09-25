/**
 * Centralized logging utility with log levels for filtering
 * Usage: logger.info('[V2-BROADCAST] Message', data)
 *        logger.debug('[V2-BROADCAST] Message', data)
 *        logger.warn('[V2-BROADCAST] Message', data)
 *        logger.error('[V2-BROADCAST] Message', data)
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Set minimum log level (can be configured per environment)
const MIN_LOG_LEVEL = LOG_LEVELS.DEBUG; // Show all logs in development

export const logger = {
  debug(message, data = null) {
    if (MIN_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
      if (data) {
        console.log(`[DEBUG] ${message}`, data);
      } else {
        console.log(`[DEBUG] ${message}`);
      }
    }
  },

  info(message, data = null) {
    if (MIN_LOG_LEVEL <= LOG_LEVELS.INFO) {
      if (data) {
        console.log(`[INFO] ${message}`, data);
      } else {
        console.log(`[INFO] ${message}`);
      }
    }
  },

  warn(message, data = null) {
    if (MIN_LOG_LEVEL <= LOG_LEVELS.WARN) {
      if (data) {
        console.warn(`[WARN] ${message}`, data);
      } else {
        console.warn(`[WARN] ${message}`);
      }
    }
  },

  error(message, data = null) {
    if (MIN_LOG_LEVEL <= LOG_LEVELS.ERROR) {
      if (data) {
        console.error(`[ERROR] ${message}`, data);
      } else {
        console.error(`[ERROR] ${message}`);
      }
    }
  }
};

// Export log levels for configuration
export { LOG_LEVELS };