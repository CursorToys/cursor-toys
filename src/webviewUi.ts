import * as crypto from 'crypto';
import * as vscode from 'vscode';

/** SVG mark icon used across CursorToys webviews (matches Control panel). */
export const CURSORTOYS_MARK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
  '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/>' +
  '<rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>';

const REFRESH_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';

export type UiStylesheet = 'theme' | 'panel';

/**
 * Resource roots for shared CursorToys UI assets under media/ui.
 */
export function getUiResourceRoots(extensionUri: vscode.Uri): vscode.Uri[] {
  return [vscode.Uri.joinPath(extensionUri, 'media', 'ui')];
}

/**
 * Combined resource roots for Control panel (control + shared UI).
 */
export function getControlResourceRoots(extensionUri: vscode.Uri): vscode.Uri[] {
  return [
    vscode.Uri.joinPath(extensionUri, 'media', 'control'),
    vscode.Uri.joinPath(extensionUri, 'media', 'ui'),
  ];
}

/**
 * Generates a cryptographically secure nonce for webview CSP.
 */
export function generateWebviewNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Escapes text for safe HTML insertion.
 */
export function escapeWebviewHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds CSP meta content for script + stylesheet webviews.
 */
export function buildWebviewCsp(
  webview: vscode.Webview,
  nonce: string,
  inlineStyles = true,
  options?: { allowHttpsImages?: boolean }
): string {
  const styleSrc = inlineStyles
    ? `${webview.cspSource} 'unsafe-inline'`
    : webview.cspSource;
  const imgSrc = options?.allowHttpsImages
    ? `${webview.cspSource} data: https:`
    : `${webview.cspSource} data:`;
  return (
    `default-src 'none'; img-src ${imgSrc}; ` +
    `style-src ${styleSrc}; font-src ${webview.cspSource}; ` +
    `script-src 'nonce-${nonce}';`
  );
}

/**
 * Returns link tags for shared UI stylesheets.
 */
export function buildStylesheetLinks(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  sheets: UiStylesheet[] = ['theme', 'panel']
): string {
  return sheets
    .map((sheet) => {
      const file = sheet === 'theme' ? 'theme.css' : 'panel.css';
      const uri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'ui', file));
      return `<link rel="stylesheet" href="${uri}" />`;
    })
    .join('\n  ');
}

export interface PanelHeaderOptions {
  title: string;
  subtitle?: string;
  /** Optional HTML for toolbar buttons (right side). */
  toolbarHtml?: string;
}

/**
 * Builds the standard CursorToys panel header (matches Control panel).
 */
export function buildPanelHeader(options: PanelHeaderOptions): string {
  const subtitle = options.subtitle
    ? `<span>${escapeWebviewHtml(options.subtitle)}</span>`
    : '';
  const toolbar = options.toolbarHtml
    ? `<span class="ct-spacer"></span>${options.toolbarHtml}`
    : '';
  return (
    `<header class="ct-top">` +
    `<div class="ct-hdr">` +
    `<span class="ct-mark">${CURSORTOYS_MARK_SVG}</span>` +
    `<div class="ct-title"><b>${escapeWebviewHtml(options.title)}</b>${subtitle}</div>` +
    toolbar +
    `</div></header>`
  );
}

/**
 * Refresh icon button for panel toolbars.
 */
export function buildRefreshButton(id: string, title = 'Refresh'): string {
  return (
    `<button type="button" class="ct-iconbtn" id="${escapeWebviewHtml(id)}" title="${escapeWebviewHtml(title)}">` +
    REFRESH_ICON_SVG +
    `</button>`
  );
}

export interface WebviewDocumentOptions {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  title: string;
  body: string;
  /** Inline script body (without script tags). */
  scripts?: string;
  nonce?: string;
  /** Additional inline CSS after shared stylesheets. */
  extraStyles?: string;
  extraHead?: string;
  bodyClass?: string;
  stylesheets?: UiStylesheet[];
  /** When false, only external stylesheets are allowed (no unsafe-inline). */
  allowInlineStyles?: boolean;
  /** When true, allows https: images (e.g. release notes from CHANGELOG). */
  allowHttpsImages?: boolean;
}

/**
 * Builds a complete HTML document with shared CursorToys UI styling.
 */
export function buildWebviewDocument(options: WebviewDocumentOptions): string {
  const nonce = options.nonce ?? generateWebviewNonce();
  const stylesheets = options.stylesheets ?? ['theme', 'panel'];
  const bodyClass = options.bodyClass ?? 'ct-panel';
  const csp = buildWebviewCsp(options.webview, nonce, options.allowInlineStyles !== false, {
    allowHttpsImages: options.allowHttpsImages,
  });

  const scriptBlock = options.scripts
    ? `<script nonce="${nonce}">${options.scripts}</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeWebviewHtml(options.title)}</title>
  ${buildStylesheetLinks(options.webview, options.extensionUri, stylesheets)}
  ${options.extraStyles ? `<style>${options.extraStyles}</style>` : ''}
  ${options.extraHead ?? ''}
</head>
<body class="${bodyClass}">
  ${options.body}
  ${scriptBlock}
</body>
</html>`;
}

/**
 * Resolves the CursorToys extension URI (for webviews without ExtensionContext).
 */
export function getExtensionUri(): vscode.Uri | undefined {
  return vscode.extensions.getExtension('godrix.cursor-toys')?.extensionUri;
}

/**
 * Applies shared webview options (localResourceRoots) to a panel webview.
 */
export function configurePanelWebview(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): void {
  webview.options = {
    enableScripts: true,
    localResourceRoots: getUiResourceRoots(extensionUri),
  };
}
