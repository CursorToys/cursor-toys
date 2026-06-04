/** Shared usage-monitor settings under cursorToys.usageMonitor.* */

export const CONFIG_SECTION = 'usageMonitor';

export const OPENROUTER_CONFIG = 'openRouter';
export const DEEPINFRA_CONFIG = 'deepInfra';

export const SECRET_OPENROUTER_KEY = 'cursorToys.usageMonitor.openRouter.apiKey';
export const SECRET_DEEPINFRA_KEY = 'cursorToys.usageMonitor.deepInfra.apiKey';

export const OPENROUTER_CURSOR_BASE_URL = 'https://openrouter.ai/api/v1';
export const DEEPINFRA_CURSOR_BASE_URL = 'https://api.deepinfra.com/v1';

export const OPENROUTER_CREDITS_URL = 'https://openrouter.ai/api/v1/credits';
export const OPENROUTER_KEYS_URL = 'https://openrouter.ai/keys';
export const DEEPINFRA_KEYS_URL = 'https://deepinfra.com/dash/api_keys';

/** Billing checklist (OpenAPI: GET https://api.deepinfra.com/payment/checklist — no /v1 prefix). */
export const DEEPINFRA_CHECKLIST_URL = 'https://api.deepinfra.com/payment/checklist';
export const DEEPINFRA_BILLING_URL = 'https://deepinfra.com/dash/billing';

export const DEFAULT_REFRESH_INTERVAL_MINUTES = 10;
export const MIN_REFRESH_INTERVAL_MINUTES = 5;

export type UsageProviderId = 'openRouter' | 'deepInfra';
