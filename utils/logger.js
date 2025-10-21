// utils/logger.js
export const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  connected: (msg) => console.log(`\x1b[32m[CONNECTED]\x1b[0m ${new Date().toISOString()} - ${msg}`),
  ready: (msg) => console.log(`\x1b[36m${msg}\x1b[0m`)
};
