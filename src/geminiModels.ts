/** Gemini models exposed in settings (keep in sync with package.json enum). */
export const GEMINI_MODEL_OPTIONS = [
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (recommended)' },
  { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (legacy)' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (legacy)' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (legacy)' },
] as const;

export const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';

export function isKnownGeminiModel(model: string): boolean {
  return GEMINI_MODEL_OPTIONS.some((option) => option.id === model);
}
