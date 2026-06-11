/**
 * MCP security: confirm gate, secret redaction, rate limiting.
 */

const SECRET_KEY_PATTERN = /(?:^|_)(KEY|TOKEN|SECRET|PASSWORD)(?:$|_)/i;

const DESTRUCTIVE_TOOL_SUFFIXES = [
  '_delete',
  '_clear',
  '_uninstall',
  '_remove',
] as const;

const RATE_LIMITED_TOOLS = new Set([
  'cursortoys_execute',
  'http_run',
  'http_run_assertions',
  'http_run_tests_file',
  'http_run_tests_folder',
  'http_run_tests_all',
  'refine_text',
  'refine_and_send_to_chat',
  'process_with_prompt',
]);

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_WINDOW = 30;

/**
 * Returns true when the tool name represents a destructive operation.
 */
export function isDestructiveTool(toolName: string): boolean {
  return DESTRUCTIVE_TOOL_SUFFIXES.some((suffix) => toolName.endsWith(suffix));
}

/**
 * Validates confirm gate for destructive tools.
 */
export function requireConfirmForDestructive(
  toolName: string,
  args: Record<string, unknown> | undefined,
  allowDestructiveWithoutConfirm: boolean
): void {
  if (allowDestructiveWithoutConfirm || !isDestructiveTool(toolName)) {
    return;
  }
  if (args?.confirm === true) {
    return;
  }
  throw new Error(
    `Destructive tool "${toolName}" requires confirm: true. Pass { "confirm": true } to proceed.`
  );
}

/**
 * Returns true when an environment variable name should be redacted.
 */
export function isSecretEnvKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

/**
 * Redacts secret values in a string-keyed record.
 */
export function redactSecrets(
  record: Record<string, string>,
  redactedValue = '[REDACTED]'
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = isSecretEnvKey(key) ? redactedValue : value;
  }
  return result;
}

/**
 * Redacts secrets in nested objects (shallow).
 */
export function redactSecretsDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecretsDeep);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'string' && isSecretEnvKey(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactSecretsDeep(val);
      }
    }
    return out;
  }
  return value;
}

/**
 * Enforces per-tool rate limits. Throws when exceeded.
 */
export function checkRateLimit(toolName: string): void {
  if (!RATE_LIMITED_TOOLS.has(toolName)) {
    return;
  }
  const now = Date.now();
  const entry = rateLimitMap.get(toolName);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(toolName, { count: 1, windowStart: now });
    return;
  }
  if (entry.count >= RATE_LIMIT_MAX_PER_WINDOW) {
    throw new Error(`Rate limit exceeded for "${toolName}". Try again later.`);
  }
  entry.count += 1;
}

/**
 * Resets rate limit state (for tests).
 */
export function resetRateLimitsForTests(): void {
  rateLimitMap.clear();
}

/**
 * Truncates sensitive clipboard/history preview text.
 */
export function truncatePreview(text: string, maxLength = 200): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}
