/**
 * While the VS Code / Cursor Settings UI is opening (especially with @ext: filters),
 * the workbench may trigger many editor and configuration events. Pause expensive
 * extension reactions for a short window to avoid pegging the extension host.
 */

let pausedUntil = 0;

/** How long to skip heavy extension work after opening extension settings. */
const DEFAULT_PAUSE_MS = 12_000;

/**
 * Pauses expensive extension listeners (CodeLens, decorations, config sync).
 */
export function pauseExtensionForSettingsUi(ms: number = DEFAULT_PAUSE_MS): void {
  pausedUntil = Date.now() + ms;
}

/**
 * Returns true while extension reactions should be skipped.
 */
export function isExtensionPausedForSettingsUi(): boolean {
  return Date.now() < pausedUntil;
}
