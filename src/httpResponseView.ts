import * as vscode from 'vscode';
import { HTTP_REQUEST_EDITOR_VIEW_TYPE } from './httpRequestEditorTypes';

export type HttpResponseViewMode = 'inline' | 'panel' | 'editor';
export type HttpResponseLayout = 'left' | 'bottom' | 'right';

/**
 * Whether the visual HTTP editor uses compact request+response layout.
 */
export function isHttpCompactModeEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('cursorToys')
    .get<boolean>('httpRequestEditor.compactMode', true);
}

/**
 * Inline response layout when compact mode is on.
 */
export function getHttpResponseLayout(): HttpResponseLayout {
  const layout = vscode.workspace
    .getConfiguration('cursorToys')
    .get<string>('httpRequestEditor.responseLayout', 'right');
  if (layout === 'bottom') {
    return 'bottom';
  }
  if (layout === 'right' || layout === 'side') {
    return 'right';
  }
  return 'left';
}

/**
 * Resolves where HTTP responses should be shown.
 */
export function resolveHttpResponseView(): HttpResponseViewMode {
  const config = vscode.workspace.getConfiguration('cursorToys');

  if (!isHttpCompactModeEnabled()) {
    const legacy = config.get<string>('httpRequestResponseView', 'panel');
    if (legacy === 'editor' || legacy === 'panel') {
      return legacy;
    }
    return 'panel';
  }

  const editorEnabled = config.get<boolean>('httpRequestEditor.enabled', true);
  return editorEnabled ? 'inline' : 'panel';
}

/**
 * Returns true when the visual HTTP editor tab is open for the request file.
 */
export function isHttpRequestCustomEditorOpen(requestUri: vscode.Uri): boolean {
  const target = requestUri.toString();

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input as { uri?: vscode.Uri; viewType?: string } | undefined;
      if (
        input?.viewType === HTTP_REQUEST_EDITOR_VIEW_TYPE &&
        input.uri?.toString() === target
      ) {
        return true;
      }
    }
  }

  return false;
}
