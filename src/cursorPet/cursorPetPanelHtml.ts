import * as vscode from 'vscode';
import { buildStylesheetLinks, generateWebviewNonce } from '../webviewUi';
import type { CursorPetViewModel } from './types';

export interface CursorPetPanelState {
  viewModel: CursorPetViewModel;
  bridgeInstalled: boolean;
  debugMode: boolean;
  lowVitalsThreshold: number;
  layout?: 'panel' | 'sidebar';
}

export interface CursorPetPanelUiContext {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
}

/**
 * Builds HTML for the Cursor Pet webview panel.
 */
export function buildCursorPetPanelHtml(
  state: CursorPetPanelState,
  ui: CursorPetPanelUiContext
): string {
  const nonce = generateWebviewNonce();
  const stateJson = JSON.stringify(state).replace(/</g, '\\u003c');
  const stylesheetLinks = buildStylesheetLinks(ui.webview, ui.extensionUri);
  const scriptUri = ui.webview.asWebviewUri(
    vscode.Uri.joinPath(ui.extensionUri, 'media', 'cursor-pet', 'main.js')
  );
  const styleUri = ui.webview.asWebviewUri(
    vscode.Uri.joinPath(ui.extensionUri, 'media', 'cursor-pet', 'main.css')
  );
  const csp = `default-src 'none'; style-src ${ui.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  const layout = state.layout === 'sidebar' ? 'sidebar' : 'panel';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cursor Pet</title>
  ${stylesheetLinks}
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body class="ct-panel cursor-pet-body cursor-pet-${layout}">
  <div class="pet-shell">
    <header class="pet-header">
      <h1>Cursor Pet</h1>
      <p class="pet-subtitle">Care for your companion by using Cursor.</p>
    </header>
    <canvas id="pet-canvas" width="320" height="240" aria-label="Cursor Pet scene"></canvas>
    <p class="pet-hint hidden" id="pet-picker-hint">Arrow keys: browse eggs · Enter: select</p>
    <section class="pet-backpack collapsed" id="pet-backpack" aria-label="Pet backpack and feeding guide">
      <button type="button" class="pet-backpack-toggle" id="backpack-toggle" aria-expanded="false" aria-controls="backpack-panel">
        <span class="pet-backpack-title-row">
          <span class="pet-backpack-icon" aria-hidden="true">🎒</span>
          <span class="pet-backpack-title">BACKPACK</span>
        </span>
        <span class="pet-backpack-chevron" aria-hidden="true">▸</span>
      </button>
      <div class="pet-backpack-panel" id="backpack-panel">
        <p class="pet-backpack-tip" id="backpack-tip"></p>
        <ul class="pet-inventory" id="pet-inventory"></ul>
        <p class="pet-backpack-hooks" id="backpack-hooks-status"></p>
        <div class="pet-backpack-actions" id="backpack-actions">
          <button type="button" class="pet-pixel-btn" data-action="installHooks">HOOKS</button>
          <button type="button" class="pet-pixel-btn" data-action="feedHelp">GUIDE</button>
        </div>
      </div>
    </section>
  </div>
  <script nonce="${nonce}">
    window.__CURSOR_PET_STATE__ = ${stateJson};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
