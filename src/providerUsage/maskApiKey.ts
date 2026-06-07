/**
 * Masks an API key for display, keeping prefix and suffix visible.
 */
export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return '••••••••';
  }
  return `${trimmed.slice(0, 4)}${'•'.repeat(Math.min(trimmed.length - 8, 12))}${trimmed.slice(-4)}`;
}
