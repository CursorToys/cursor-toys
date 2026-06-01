const LOG_PREFIX = '[cursorUsage]';

/**
 * Debug log without secrets (message must not contain tokens).
 */
export function logDebug(message: string): void {
  console.log(`${LOG_PREFIX} ${message}`);
}

/**
 * Warning log without secrets.
 */
export function logWarn(message: string): void {
  console.warn(`${LOG_PREFIX} ${message}`);
}
