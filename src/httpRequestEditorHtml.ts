import * as vscode from 'vscode';
import { buildStylesheetLinks } from './webviewUi';

export interface HttpRequestEditorUiContext {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
}

/**
 * Builds the HTTP request editor webview HTML (tabbed Postman-style layout).
 */
export function buildHttpRequestEditorHtml(
  initJson: string,
  ui?: HttpRequestEditorUiContext
): string {
  const safeJson = initJson
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  const stylesheetLinks = ui ? buildStylesheetLinks(ui.webview, ui.extensionUri) : '';
  const styleCsp = ui ? `${ui.webview.cspSource} 'unsafe-inline'` : `'unsafe-inline'`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${styleCsp}; script-src 'unsafe-inline';" />
  ${stylesheetLinks}
  <style>
    * { box-sizing: border-box; }
    html, body {
      height: 100%;
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 0;
      line-height: 1.45;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .page {
      flex: 1;
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: none;
      margin: 0;
      padding: 12px 14px 16px;
      min-height: 0;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--ct-hair, rgba(128,128,128,0.25));
      flex-shrink: 0;
    }
    .toolbar .file { flex: 1; min-width: 140px; font-weight: 600; font-size: 12px; }
    .toolbar .sub { font-size: 10px; font-family: var(--ct-mono, monospace); color: var(--ct-mute2, inherit); font-weight: normal; display: block; margin-top: 2px; }
    button {
      appearance: none;
      font-family: var(--vscode-font-family);
      font-size: 12px;
      padding: 7px 14px;
      border-radius: 7px;
      border: 1px solid var(--ct-hair, rgba(128,128,128,0.25));
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
    }
    button:hover { border-color: var(--ct-accent-dim, #6366f133); background: var(--ct-accent-soft, rgba(99,102,241,0.09)); color: var(--ct-accent, #6366f1); }
    button.primary, button.send-btn { background: var(--ct-accent, #6366f1); border-color: var(--ct-accent, #6366f1); color: #fff; font-weight: 600; }
    button.primary:hover, button.send-btn:hover { filter: brightness(1.08); color: #fff; }
    button.send-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; }
    button.secondary, button.ghost { background: transparent; color: var(--ct-mute, inherit); }
    button.danger { background: color-mix(in srgb, #e0706b 15%, transparent); border-color: color-mix(in srgb, #e0706b 35%, transparent); color: #e0706b; }
    label.field-label { display: block; font-family: var(--ct-mono, monospace); font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ct-mute2, inherit); margin-bottom: 4px; }
    select, input, textarea {
      width: 100%;
      font: inherit;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--ct-hair, var(--vscode-input-border));
      border-radius: 8px;
      padding: 7px 10px;
    }
    textarea {
      resize: vertical;
      min-height: 100px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.92em;
    }
    .row { display: flex; gap: 8px; margin-bottom: 10px; align-items: flex-end; }
    .method { width: 108px; flex-shrink: 0; }
    .url { flex: 1; }
    .dirty { font-size: 0.8em; color: var(--vscode-editorWarning-foreground, #cca700); }
    .hint { font-size: 0.78em; opacity: 0.72; margin: 8px 0 0; }

    .env-pane-summary {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      padding: 10px 12px;
      margin-bottom: 14px;
      border-radius: 7px;
      border: 1px solid var(--ct-hair, rgba(128,128,128,0.25));
      background: var(--ct-accent-soft, rgba(99,102,241,0.06));
    }
    .env-pane-label {
      font-size: 10px;
      font-family: var(--ct-mono, monospace);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ct-mute2, inherit);
    }
    .env-pane-effective {
      font-size: 13px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }
    .env-pane-effective.empty {
      font-weight: 500;
      color: var(--ct-mute, inherit);
    }
    .env-pane-meta {
      flex-basis: 100%;
      font-size: 0.82em;
      color: var(--ct-mute, inherit);
      line-height: 1.4;
    }
    .env-pane-meta[hidden] { display: none; }
    .env-pane-section {
      margin-bottom: 18px;
    }
    .env-pane-section .subheading {
      font-size: 10px;
      font-family: var(--ct-mono, monospace);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ct-mute2, inherit);
      margin: 0 0 8px;
    }
    .env-source-tag[hidden] { display: none; }
    .env-source-tag {
      font-size: 0.72em;
      padding: 2px 8px;
      border-radius: 4px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .workspace-card {
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
      border-radius: 8px;
      overflow: hidden;
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(128,128,128,0.06));
      flex: 1;
      min-height: 560px;
      display: flex;
      flex-direction: column;
    }
    .detail-body {
      flex: 1;
      min-height: 480px;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .detail-pane {
      display: none;
      flex: 1;
      min-height: 460px;
      padding: 14px 16px 18px;
      overflow-y: auto;
      flex-direction: column;
    }
    .detail-pane.active {
      display: flex;
    }
    #pane-request .row,
    #pane-request .hint,
    #pane-request > .field-label {
      flex-shrink: 0;
    }
    #pane-request #body {
      flex: 1;
      min-height: 400px;
      resize: none;
    }

    .request-tabs {
      display: flex;
      flex-wrap: nowrap;
      gap: 6px;
      overflow-x: auto;
      padding: 10px 12px 4px;
      flex-shrink: 0;
      scrollbar-width: thin;
    }
    .request-tabs[hidden] { display: none; }
    .request-tab {
      appearance: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      border: 1px solid var(--ct-hair, rgba(128,128,128,0.25));
      border-radius: 7px;
      background: transparent;
      color: var(--ct-mute, var(--vscode-descriptionForeground, inherit));
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: 12px;
      white-space: nowrap;
      flex-shrink: 0;
      transition: border-color 0.14s ease, color 0.14s ease, background 0.14s ease;
    }
    .request-tab:hover {
      color: var(--vscode-foreground);
      border-color: var(--ct-mute2, rgba(128,128,128,0.45));
      background: var(--ct-accent-soft, rgba(99,102,241,0.06));
    }
    .request-tab.active {
      color: var(--ct-accent, #6366f1);
      border-color: var(--ct-accent, #6366f1);
      background: var(--ct-accent-soft, rgba(99,102,241,0.09));
      font-weight: 600;
    }

    .detail-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px 12px 12px;
      flex-shrink: 0;
    }
    .detail-tab {
      appearance: none;
      padding: 7px 14px;
      border: 1px solid var(--ct-hair, rgba(128,128,128,0.25));
      border-radius: 7px;
      background: transparent;
      color: var(--ct-mute, var(--vscode-descriptionForeground, inherit));
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: 12px;
      letter-spacing: 0.02em;
      transition: border-color 0.14s ease, color 0.14s ease, background 0.14s ease;
    }
    .detail-tab:hover {
      color: var(--vscode-foreground);
      border-color: var(--ct-mute2, rgba(128,128,128,0.45));
      background: var(--ct-accent-soft, rgba(99,102,241,0.06));
    }
    .detail-tab.active {
      color: var(--ct-accent, #6366f1);
      border-color: var(--ct-accent, #6366f1);
      background: var(--ct-accent-soft, rgba(99,102,241,0.09));
      font-weight: 600;
    }
    .detail-tab.detail-tab-icon {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .detail-tab-ic {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }
    .detail-tab-ic svg {
      width: 14px;
      height: 14px;
    }
    .detail-tab .badge {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 0.75em;
      font-weight: 600;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .method-pill {
      font-size: 0.68em;
      font-weight: 700;
      padding: 2px 5px;
      border-radius: 3px;
    }
    .method-get { background: #2ea04333; color: #3fb950; }
    .method-post { background: #1f6feb33; color: #58a6ff; }
    .method-put { background: #d2992233; color: #e3b341; }
    .method-delete { background: #f8514933; color: #f85149; }
    .method-other { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }

    .url-field {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .url-input-wrap {
      position: relative;
      width: 100%;
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      background: var(--vscode-input-background);
    }
    .url-input-wrap:focus-within {
      border-color: var(--vscode-focusBorder, #007fd4);
      outline: 1px solid var(--vscode-focusBorder, #007fd4);
      outline-offset: -1px;
    }
    .url-input-wrap .url-backdrop,
    .url-input-wrap .url-input {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-font-size, 13px);
      line-height: 20px;
      padding: 6px 8px;
      margin: 0;
      border: none;
      border-radius: 0;
      width: 100%;
      min-height: 32px;
      box-sizing: border-box;
      white-space: pre;
      overflow: hidden;
    }
    .url-input-wrap .url-backdrop {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      color: var(--vscode-input-foreground);
      background: transparent;
      z-index: 0;
    }
    .url-input-wrap .url-input {
      position: relative;
      display: block;
      background: transparent;
      color: transparent;
      -webkit-text-fill-color: transparent;
      caret-color: var(--vscode-foreground);
      z-index: 1;
    }
    .url-input-wrap .url-input::selection {
      background: var(--vscode-editor-selectionBackground, rgba(58, 120, 180, 0.45));
      color: var(--vscode-editor-foreground);
      -webkit-text-fill-color: var(--vscode-editor-foreground);
    }
    .url-input-wrap .url-input::placeholder {
      color: var(--vscode-input-placeholderForeground, rgba(255,255,255,0.45));
      -webkit-text-fill-color: var(--vscode-input-placeholderForeground, rgba(255,255,255,0.45));
      opacity: 1;
    }
    .url-input-wrap .var-file { color: #58a6ff; font-weight: 600; }
    .url-input-wrap .var-env { color: #3fb950; font-weight: 600; }
    .url-input-wrap .var-helper { color: #d2a8ff; font-weight: 600; }
    .url-input-wrap .var-missing { color: #f85149; font-weight: 600; text-decoration: underline wavy #f85149; }
    .url-var-tooltip {
      position: fixed;
      z-index: 10000;
      max-width: 420px;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.45;
      font-family: var(--vscode-editor-font-family, monospace);
      background: var(--vscode-editorHoverWidget-background, #252526);
      color: var(--vscode-editorHoverWidget-foreground, #ccc);
      border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
      pointer-events: none;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .url-var-tooltip[hidden] { display: none; }

    .ac-dropdown {
      position: fixed;
      z-index: 1000;
      min-width: 260px;
      max-width: 420px;
      max-height: 220px;
      overflow-y: auto;
      border: 1px solid var(--vscode-panel-border, #444);
      border-radius: 6px;
      background: var(--vscode-dropdown-background, var(--vscode-editor-background));
      box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    }
    .ac-dropdown[hidden] { display: none; }
    .ac-item {
      display: block;
      width: 100%;
      text-align: left;
      padding: 6px 10px;
      border: none;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
    }
    .ac-item:hover, .ac-item.active { background: var(--vscode-list-hoverBackground); }
    .ac-item .ac-label { font-family: var(--vscode-editor-font-family, monospace); font-weight: 600; }
    .ac-item .ac-desc { font-size: 0.78em; opacity: 0.75; margin-top: 2px; }
    .ac-kind { font-size: 0.68em; text-transform: uppercase; opacity: 0.6; margin-right: 6px; }
    .ac-kind-file { color: #58a6ff; }
    .ac-kind-env { color: #3fb950; }
    .ac-kind-helper { color: #d2a8ff; }

    .env-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 10px; }
    .env-pill-wrap { display: inline-flex; align-items: center; gap: 2px; }
    .env-pill {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.82em;
      border: 1px solid var(--vscode-panel-border, #555);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
    }
    .env-pill:hover { background: var(--vscode-list-hoverBackground); }
    .env-pill.active {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-weight: 600;
      box-shadow: 0 0 0 1px var(--vscode-focusBorder);
    }
    .env-pill.effective:not(.active) {
      border-color: var(--vscode-textLink-foreground);
      color: var(--vscode-textLink-foreground);
    }
    .env-open-btn { padding: 2px 6px; font-size: 0.75em; line-height: 1; }
    .collapsible-section { margin-bottom: 10px; }
    .collapse-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      text-align: left;
      padding: 6px 8px;
      border: none;
      border-radius: 4px;
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(128,128,128,0.08));
      color: inherit;
      cursor: pointer;
      font: inherit;
      font-size: 0.82em;
      font-weight: 600;
    }
    .collapse-toggle:hover { background: var(--vscode-list-hoverBackground); }
    .collapse-chevron {
      display: inline-block;
      width: 1em;
      font-size: 0.7em;
      opacity: 0.8;
      transition: transform 0.15s ease;
    }
    .collapsible-section:not(.collapsed) .collapse-chevron { transform: rotate(90deg); }
    .collapse-body { padding: 8px 4px 4px; }
    .collapse-body[hidden] { display: none; }
    .local-var-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      margin-bottom: 6px;
    }
    .local-var-row input { flex: 1; min-width: 80px; max-width: 200px; font-size: 0.88em; }
    .local-var-row .local-var-key { max-width: 140px; }
    .assert-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .assert-actions .full { flex: 1; min-width: 120px; }
    .var-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.8em;
      font-family: var(--vscode-editor-font-family, monospace);
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-panel-border, transparent);
    }
    .var-tag .remove {
      cursor: pointer;
      opacity: 0.6;
      border: none;
      background: none;
      color: inherit;
      padding: 0 2px;
    }
    .var-key { color: var(--vscode-symbolIcon-variableForeground, #9cdcfe); }
    .subheading { font-size: 0.78em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.6; margin: 14px 0 8px; }
    .headers-table { width: 100%; border-collapse: collapse; }
    .headers-table td { padding: 4px; vertical-align: top; }
    .section-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .inline-form { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .inline-form input { flex: 1; min-width: 90px; }
    .assert-form {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 14px;
      padding: 12px;
      border-radius: 6px;
      border: 1px dashed var(--vscode-panel-border, #444);
    }
    .assert-form .full { grid-column: 1 / -1; }
    .assert-list { margin: 0; padding: 0; list-style: none; }
    .assert-item {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding: 8px 10px;
      border-radius: 6px;
      margin-bottom: 6px;
      background: var(--vscode-textCodeBlock-background);
      border-left: 3px solid var(--vscode-textLink-foreground);
      font-size: 0.88em;
    }
    .assert-item-body { flex: 1; }
    .assert-expr { font-family: var(--vscode-editor-font-family, monospace); font-size: 0.9em; opacity: 0.9; }
    .empty-state { font-size: 0.85em; opacity: 0.65; font-style: italic; }
    .editor-split { display: flex; gap: 10px; min-height: 0; flex: 1; }
    .editor-split.layout-bottom { flex-direction: column; }
    .editor-split.layout-left,
    .editor-split.layout-right { flex-direction: row; align-items: stretch; }
    .editor-split.layout-left { flex-direction: row-reverse; }
    .editor-split.layout-left .workspace-card,
    .editor-split.layout-right .workspace-card { flex: 1 1 52%; min-width: 0; }
    .editor-split.layout-left .response-card,
    .editor-split.layout-right .response-card {
      flex: 1 1 48%;
      min-width: 0;
      max-height: none;
    }
    .workspace-card { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    .workspace-card .detail-body { flex: 1; min-height: 160px; overflow: auto; }
    .response-card {
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 8px;
      overflow: hidden;
      min-height: 160px;
      max-height: 42vh;
      display: flex;
      flex-direction: column;
      background: var(--vscode-editor-background);
    }
    .response-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      padding: 8px 10px;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      background: var(--vscode-sideBar-background);
    }
    .response-status {
      font-size: 0.82em;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--vscode-panel-border, #444);
    }
    .response-status.ok { color: #3fb950; border-color: #3fb95055; }
    .response-status.warn { color: #d29922; border-color: #d2992255; }
    .response-status.err { color: #f85149; border-color: #f8514955; }
    .response-tabs { display: flex; gap: 4px; padding: 6px 8px 0; border-bottom: 1px solid var(--vscode-panel-border, #333); }
    .response-tab {
      border: none;
      background: transparent;
      color: inherit;
      opacity: 0.7;
      padding: 6px 10px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      font: inherit;
      font-size: 0.85em;
    }
    .response-tab.active { opacity: 1; border-bottom-color: var(--vscode-textLink-foreground); }
    .response-body { flex: 1; min-height: 0; overflow: auto; padding: 10px; }
    .response-pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85em;
      line-height: 1.45;
    }
    .response-headers { width: 100%; border-collapse: collapse; font-size: 0.85em; }
    .response-headers td { padding: 4px 6px; vertical-align: top; border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a); }
    .response-assert { padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a); font-size: 0.85em; }
    .response-assert.pass { color: #3fb950; }
    .response-assert.fail { color: #f85149; }
  </style>
</head>
<body class="ct-panel-fill">
  <div class="page">
    <div class="toolbar">
      <div class="file">
        <span id="fileName">HTTP Request</span>
        <span class="sub" id="filePath"></span>
      </div>
      <span class="dirty" id="dirtyLabel" hidden>Unsaved</span>
      <button type="button" class="secondary" id="newRequestBtn">New request</button>
      <button type="button" class="secondary" id="openTextBtn">Open as text</button>
      <button type="button" id="saveBtn">Save</button>
      <button type="button" id="copyCurlBtn">Copy cURL</button>
      <button type="button" class="send-btn" id="sendBtn">
        Send
        <svg class="send-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M1.5 1.5L14.5 8L1.5 14.5V9.5L10.5 8L1.5 6.5V1.5Z"/></svg>
      </button>
    </div>

    <div class="editor-split layout-left" id="editorSplit">
    <div class="workspace-card">
      <div class="request-tabs" id="requestTabs"></div>
      <div class="detail-tabs" role="tablist">
        <button type="button" class="detail-tab active" data-detail="request">Request</button>
        <button type="button" class="detail-tab" data-detail="headers">Headers</button>
        <button type="button" class="detail-tab" data-detail="tests">Tests <span class="badge" id="testsBadge" hidden>0</span></button>
        <button type="button" class="detail-tab detail-tab-icon" data-detail="environment">
          <span class="detail-tab-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.8 7.8 0 0 0 .1-3l1.7-1.3-1.8-3.1-2 .8a7.6 7.6 0 0 0-2.6-1.5l-.3-2.1H8.5l-.3 2.1c-1 .3-1.8.8-2.6 1.5l-2-.8L1.8 9.2l1.7 1.3a7.8 7.8 0 0 0 0 3l-1.7 1.3 1.8 3.1 2-.8c.8.7 1.6 1.2 2.6 1.5l.3 2.1h3.6l.3-2.1c1-.3 1.8-.8 2.6-1.5l2 .8 1.8-3.1z"/></svg></span>
          Env
        </button>
      </div>
      <div class="detail-body">
        <div class="detail-pane active" id="pane-request" data-detail="request">
          <div class="row">
            <div class="method">
              <label class="field-label" for="method">Method</label>
              <select id="method">
                <option>GET</option><option>POST</option><option>PUT</option>
                <option>PATCH</option><option>DELETE</option><option>HEAD</option><option>OPTIONS</option>
              </select>
            </div>
            <div class="url-field">
              <label class="field-label" for="url">URL — paste cURL or type {{variables}}</label>
              <div class="url-input-wrap">
                <div class="url-backdrop" id="urlBackdrop" aria-hidden="true"></div>
                <input type="text" id="url" class="url-input" placeholder="https://api.example.com or paste a cURL command" autocomplete="off" spellcheck="false" />
              </div>
            </div>
          </div>
          <p class="hint"><span style="color:#58a6ff">■</span> # @var &nbsp; <span style="color:#3fb950">■</span> .env &nbsp; <span style="color:#d2a8ff">■</span> helper &nbsp; <span style="color:#f85149">■</span> missing — paste cURL in URL to import like Postman</p>
          <label class="field-label">Body</label>
          <textarea id="body" class="var-ac-input" placeholder="JSON, form data, etc." autocomplete="off" spellcheck="false"></textarea>
        </div>

        <div class="detail-pane" id="pane-headers" data-detail="headers">
          <label class="field-label">Request headers</label>
          <table class="headers-table"><tbody id="headersBody"></tbody></table>
          <div class="section-actions">
            <button type="button" class="secondary" id="addHeaderBtn">Add header</button>
            <button type="button" class="secondary" id="removeHeaderBtn">Remove last</button>
          </div>
        </div>

        <div class="detail-pane" id="pane-environment" data-detail="environment">
          <div class="env-pane-summary">
            <span class="env-pane-label">Active</span>
            <span class="env-pane-effective" id="envBannerEffective">—</span>
            <span class="env-source-tag" id="envBannerSource">workspace</span>
            <span class="env-pane-meta" id="envBannerMeta" hidden></span>
          </div>
          <div class="env-pane-section">
            <p class="subheading">Workspace / file (.env at project root)</p>
            <div class="env-row">
              <span id="projectEnvPills"></span>
              <button type="button" class="ghost icon-btn" id="selectEnvBtn" title="Pick environment">⋯</button>
              <button type="button" class="ghost icon-btn" id="createEnvBtn" title="Create .env file">+ env</button>
            </div>
            <div class="env-row" id="fileEnvRow" hidden>
              <span style="font-size:0.85em;opacity:0.8;">File # @env:</span>
              <span id="fileEnvBadge"></span>
            </div>
            <div class="env-row" id="blockEnvRow" hidden>
              <span style="font-size:0.85em;opacity:0.8;">Block # @env:</span>
              <span id="blockEnvBadge"></span>
            </div>
            <p class="subheading" style="margin-top:12px;">Keys from active .env</p>
            <div class="env-row" id="envVarTags"></div>
          </div>
          <div class="env-pane-section">
            <p class="subheading">Local variables (# @var)</p>
            <div id="fileVarTags"></div>
            <div class="inline-form">
              <input type="text" id="newVarKey" placeholder="KEY" />
              <input type="text" id="newVarVal" placeholder="value" />
              <button type="button" class="secondary" id="addVarBtn">Add # @var</button>
            </div>
          </div>
        </div>

        <div class="detail-pane" id="pane-tests" data-detail="tests">
          <div class="assert-form">
            <input type="text" id="assertDesc" class="full" placeholder="Description (optional)" list="assertDescHints" />
            <input type="text" id="assertExpr" placeholder="Expression e.g. res.status" list="assertExpressions" />
            <input type="text" id="assertOp" placeholder="Operator e.g. equals" list="assertOperators" />
            <input type="text" id="assertExpected" class="full" placeholder="Expected value (optional for isEmpty, isDefined, …)" />
            <div class="assert-actions full">
              <button type="button" class="primary" id="addAssertBtn">Add test</button>
              <button type="button" class="secondary" id="cancelAssertBtn" hidden>Cancel</button>
            </div>
          </div>
          <datalist id="assertOperators"></datalist>
          <datalist id="assertExpressions"></datalist>
          <datalist id="assertDescHints">
            <option value="Status should be 200"></option>
            <option value="Response body is valid"></option>
          </datalist>
          <ul class="assert-list" id="assertionList"></ul>
          <p class="hint">Operators with autocomplete: equals, contains, isNotEmpty, gte, …</p>
        </div>
      </div>
    </div>

    <div class="response-card" id="responseCard">
      <div class="response-toolbar">
        <strong style="font-size:0.85em;opacity:0.85;">Response</strong>
        <span class="response-status" id="responseStatusBadge">—</span>
        <span id="responseMeta" style="font-size:0.8em;opacity:0.7;"></span>
        <span style="flex:1"></span>
        <button type="button" class="secondary" id="sendResponseChatBtn" disabled>Send to chat</button>
        <button type="button" class="secondary" id="resendResponseBtn" disabled>Send again</button>
      </div>
      <div class="response-tabs" role="tablist">
        <button type="button" class="response-tab active" data-response-tab="body">Body</button>
        <button type="button" class="response-tab" data-response-tab="headers">Headers</button>
        <button type="button" class="response-tab" data-response-tab="raw">Raw</button>
        <button type="button" class="response-tab" data-response-tab="assertions">Assertions</button>
      </div>
      <div class="response-body" id="responseBody">
        <p class="empty-state" id="responseEmpty">Send a request to see the response here.</p>
        <pre class="response-pre" id="responseBodyPre" hidden></pre>
        <table class="response-headers" id="responseHeadersTable" hidden></table>
        <pre class="response-pre" id="responseRawPre" hidden></pre>
        <div id="responseAssertions" hidden></div>
      </div>
    </div>
    </div>
  </div>

  <div class="ac-dropdown" id="acDropdown" hidden role="listbox"></div>
  <div class="url-var-tooltip" id="urlVarTooltip" hidden role="tooltip"></div>

  <script>
    const vscode = acquireVsCodeApi();
    const INIT = ${safeJson};
    const OPS_NO_VALUE = new Set(['isNull','isNotNull','isEmpty','isNotEmpty','isDefined','isUndefined','isTruthy','isFalsy','isNumber','isString','isBoolean','isArray','isJson']);

    let state = {
      blocks: INIT.blocks || [],
      activeBlockIndex: INIT.activeBlockIndex || 0,
      detailTab: 'request',
      form: INIT.form || { method: 'GET', url: '', headers: [], body: '' },
      autoSave: !!INIT.autoSave,
      dirty: false,
      suppressChange: false,
      projectEnvs: INIT.projectEnvs || [],
      activeProjectEnv: INIT.activeProjectEnv || '',
      envVariables: INIT.envVariables || [],
      fileVariables: INIT.fileVariables || [],
      assertions: INIT.assertions || [],
      resolvedPreview: INIT.resolvedPreview || { effectiveEnv: '', envSource: 'workspace', resolvedUrl: '', bindings: [] },
      globalFileEnv: INIT.globalFileEnv,
      blockEnv: INIT.blockEnv,
      helperSuggestions: INIT.helperSuggestions || [],
      editingAssertionIndex: -1,
      responsesByBlock: {},
      responseTab: 'body',
      compactMode: INIT.compactMode !== false,
      responseLayout: INIT.responseLayout === 'bottom' ? 'bottom' : INIT.responseLayout === 'right' ? 'right' : 'left',
    };

    const els = {
      fileName: document.getElementById('fileName'),
      filePath: document.getElementById('filePath'),
      dirtyLabel: document.getElementById('dirtyLabel'),
      envBannerEffective: document.getElementById('envBannerEffective'),
      envBannerSource: document.getElementById('envBannerSource'),
      envBannerMeta: document.getElementById('envBannerMeta'),
      requestTabs: document.getElementById('requestTabs'),
      testsBadge: document.getElementById('testsBadge'),
      urlBackdrop: document.getElementById('urlBackdrop'),
      urlVarTooltip: document.getElementById('urlVarTooltip'),
      acDropdown: document.getElementById('acDropdown'),
      projectEnvPills: document.getElementById('projectEnvPills'),
      fileEnvRow: document.getElementById('fileEnvRow'),
      fileEnvBadge: document.getElementById('fileEnvBadge'),
      blockEnvRow: document.getElementById('blockEnvRow'),
      blockEnvBadge: document.getElementById('blockEnvBadge'),
      envVarTags: document.getElementById('envVarTags'),
      fileVarTags: document.getElementById('fileVarTags'),
      newVarKey: document.getElementById('newVarKey'),
      newVarVal: document.getElementById('newVarVal'),
      assertionList: document.getElementById('assertionList'),
      assertDesc: document.getElementById('assertDesc'),
      assertExpr: document.getElementById('assertExpr'),
      assertOp: document.getElementById('assertOp'),
      assertExpected: document.getElementById('assertExpected'),
      addAssertBtn: document.getElementById('addAssertBtn'),
      cancelAssertBtn: document.getElementById('cancelAssertBtn'),
      assertOperatorsList: document.getElementById('assertOperators'),
      assertExpressionsList: document.getElementById('assertExpressions'),
      method: document.getElementById('method'),
      url: document.getElementById('url'),
      body: document.getElementById('body'),
      headersBody: document.getElementById('headersBody'),
      sendBtn: document.getElementById('sendBtn'),
      responseStatusBadge: document.getElementById('responseStatusBadge'),
      responseMeta: document.getElementById('responseMeta'),
      responseEmpty: document.getElementById('responseEmpty'),
      responseBodyPre: document.getElementById('responseBodyPre'),
      responseHeadersTable: document.getElementById('responseHeadersTable'),
      responseRawPre: document.getElementById('responseRawPre'),
      responseAssertions: document.getElementById('responseAssertions'),
      sendResponseChatBtn: document.getElementById('sendResponseChatBtn'),
      resendResponseBtn: document.getElementById('resendResponseBtn'),
      responseTabButtons: document.querySelectorAll('.response-tab'),
      editorSplit: document.getElementById('editorSplit'),
      responseCard: document.getElementById('responseCard'),
      saveBtn: document.getElementById('saveBtn'),
      copyCurlBtn: document.getElementById('copyCurlBtn'),
      openTextBtn: document.getElementById('openTextBtn'),
      newRequestBtn: document.getElementById('newRequestBtn'),
      addHeaderBtn: document.getElementById('addHeaderBtn'),
      removeHeaderBtn: document.getElementById('removeHeaderBtn'),
      selectEnvBtn: document.getElementById('selectEnvBtn'),
      createEnvBtn: document.getElementById('createEnvBtn'),
      addVarBtn: document.getElementById('addVarBtn'),
      detailTabButtons: document.querySelectorAll('.detail-tab'),
      detailPanes: document.querySelectorAll('.detail-pane'),
    };

    let saveTimer = null;
    let acTarget = null;
    let acIndex = 0;

    function escAttr(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
    function escHtml(s) { return escAttr(s); }
    function post(command, extra) { vscode.postMessage(Object.assign({ command }, extra || {})); }

    function isSecretVarKey(key) {
      return /token|secret|password|api_key|apikey/i.test(key);
    }

    function getMaps() {
      const fileMap = {};
      state.fileVariables.forEach((v) => { fileMap[v.key] = v.value; fileMap[v.key.toLowerCase()] = v.value; });
      const envMap = {};
      state.envVariables.forEach((v) => { envMap[v.key.toLowerCase()] = v.value; });
      return { fileMap, envMap };
    }

    function lookupBinding(inner) {
      const trimmed = inner.trim();
      if (trimmed.startsWith('@')) {
        const h = (state.helperSuggestions || []).find((x) => x.insert.includes(trimmed) || x.label.includes(trimmed.split('(')[0]));
        return { source: 'helper', value: null, tooltip: h ? h.description : 'Dynamic helper (resolved at run time)', cls: 'var-helper' };
      }
      const { fileMap, envMap } = getMaps();
      if (fileMap[trimmed] !== undefined) {
        return { source: 'file', value: fileMap[trimmed], tooltip: '# @var: ' + fileMap[trimmed], cls: 'var-file', masked: false };
      }
      const ev = envMap[trimmed.toLowerCase()];
      if (ev !== undefined) {
        const masked = /token|secret|password|api_key|apikey/i.test(trimmed);
        return { source: 'env', value: ev, tooltip: '.env: ' + (masked ? '(hidden)' : ev), cls: 'var-env', masked };
      }
      return { source: 'missing', value: null, tooltip: 'Not defined in # @var or .env', cls: 'var-missing' };
    }

    let measureCanvas = null;
    let measureFont = '';

    function getMeasureContext(input) {
      if (!measureCanvas) {
        measureCanvas = document.createElement('canvas');
      }
      const style = window.getComputedStyle(input);
      const font = style.font || style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
      const ctx = measureCanvas.getContext('2d');
      if (font !== measureFont) {
        ctx.font = font;
        measureFont = font;
      }
      return ctx;
    }

    function getCharIndexFromMouseX(input, clientX) {
      const text = input.value;
      if (!text) {
        return -1;
      }
      const rect = input.getBoundingClientRect();
      const style = window.getComputedStyle(input);
      const padL = parseFloat(style.paddingLeft) || 0;
      const x = clientX - rect.left - padL + input.scrollLeft;
      if (x <= 0) {
        return 0;
      }
      const ctx = getMeasureContext(input);
      const totalWidth = ctx.measureText(text).width;
      if (x >= totalWidth) {
        return text.length - 1;
      }
      for (let i = 1; i <= text.length; i++) {
        if (ctx.measureText(text.slice(0, i)).width >= x) {
          return i - 1;
        }
      }
      return text.length - 1;
    }

    function findVarTokenAt(text, index) {
      if (index < 0 || !text) {
        return null;
      }
      const regex = /\\{\\{([^}]+)\\}\\}/g;
      let m;
      while ((m = regex.exec(text)) !== null) {
        const start = m.index;
        const end = m.index + m[0].length;
        if (index >= start && index < end) {
          return { inner: m[1], full: m[0], start, end };
        }
      }
      return null;
    }

    function formatVarTooltip(inner) {
      const b = lookupBinding(inner);
      const name = inner.trim();
      if (b.source === 'file') {
        return '# @var ' + name + '\\n→ ' + (b.value || '(empty)');
      }
      if (b.source === 'env') {
        return '.env ' + name + '\\n→ ' + (b.masked ? '(hidden — token/secret)' : b.value);
      }
      if (b.source === 'helper') {
        return b.tooltip;
      }
      return 'Not defined in # @var or .env';
    }

    let lastUrlTooltip = '';

    function showUrlVarTooltip(clientX, clientY, text) {
      if (!els.urlVarTooltip) {
        return;
      }
      if (text !== lastUrlTooltip) {
        els.urlVarTooltip.textContent = text;
        lastUrlTooltip = text;
      }
      els.urlVarTooltip.hidden = false;
      const pad = 12;
      let left = clientX + pad;
      let top = clientY + pad;
      els.urlVarTooltip.style.left = left + 'px';
      els.urlVarTooltip.style.top = top + 'px';
      const tr = els.urlVarTooltip.getBoundingClientRect();
      if (tr.right > window.innerWidth) {
        left = clientX - tr.width - pad;
      }
      if (tr.bottom > window.innerHeight) {
        top = clientY - tr.height - pad;
      }
      els.urlVarTooltip.style.left = left + 'px';
      els.urlVarTooltip.style.top = top + 'px';
    }

    function hideUrlVarTooltip() {
      lastUrlTooltip = '';
      if (els.urlVarTooltip) {
        els.urlVarTooltip.hidden = true;
      }
    }

    function onUrlMouseMove(e) {
      const idx = getCharIndexFromMouseX(els.url, e.clientX);
      const token = findVarTokenAt(els.url.value, idx);
      if (!token) {
        hideUrlVarTooltip();
        return;
      }
      showUrlVarTooltip(e.clientX, e.clientY, formatVarTooltip(token.inner));
    }

    function onUrlMouseLeave() {
      hideUrlVarTooltip();
    }

    function renderUrlHighlight() {
      const text = els.url.value || '';
      const regex = /\\{\\{([^}]+)\\}\\}/g;
      let html = '';
      let last = 0;
      let m;
      while ((m = regex.exec(text)) !== null) {
        html += escHtml(text.slice(last, m.index));
        const b = lookupBinding(m[1]);
        html += '<span class="' + b.cls + '">' + escHtml(m[0]) + '</span>';
        last = m.index + m[0].length;
      }
      html += escHtml(text.slice(last));
      els.urlBackdrop.innerHTML = text ? html : '';
      syncUrlScroll();
    }

    function syncUrlScroll() {
      if (!els.urlBackdrop || !els.url) return;
      els.urlBackdrop.scrollLeft = els.url.scrollLeft;
    }

    function hideAc() {
      els.acDropdown.hidden = true;
      acTarget = null;
      acIndex = 0;
    }

    function getSuggestions(prefix) {
      const p = prefix.toLowerCase();
      const items = [];
      const showHelpers = !p || p.startsWith('@') || p.length <= 2;
      if (showHelpers) {
        (state.helperSuggestions || []).forEach((h) => {
          const needle = p.replace(/^@/, '');
          if (!needle || h.label.toLowerCase().includes(needle) || h.insert.toLowerCase().includes(p)) {
            items.push({ insert: h.insert, label: h.label, description: h.description, kind: 'helper' });
          }
        });
      }
      state.fileVariables.forEach((v) => {
        if (!p || p.startsWith('@') || v.key.toLowerCase().startsWith(p)) {
          items.push({ insert: '{{' + v.key + '}}', label: v.key, description: '# @var = ' + v.value, kind: 'file' });
        }
      });
      state.envVariables.forEach((v) => {
        if (!p || p.startsWith('@') || v.key.toLowerCase().startsWith(p)) {
          items.push({
            insert: '{{' + v.key + '}}',
            label: v.key,
            description: '.env = ' + (v.masked ? '••••' : v.value),
            kind: 'env',
          });
        }
      });
      return items.slice(0, 14);
    }

    function showAc(el, items) {
      if (!items.length) { hideAc(); return; }
      acTarget = el;
      acIndex = 0;
      els.acDropdown.innerHTML = '';
      items.forEach((item, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ac-item' + (idx === 0 ? ' active' : '');
        btn.dataset.insert = item.insert;
        btn.innerHTML =
          '<span class="ac-kind ac-kind-' + item.kind + '">' + item.kind + '</span>' +
          '<span class="ac-label">' + escHtml(item.label) + '</span>' +
          '<div class="ac-desc">' + escHtml(item.description) + '</div>';
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); insertSuggestion(el, item.insert); });
        els.acDropdown.appendChild(btn);
      });
      const rect = el.getBoundingClientRect();
      els.acDropdown.style.left = rect.left + 'px';
      els.acDropdown.style.top = (rect.bottom + 4) + 'px';
      els.acDropdown.hidden = false;
    }

    function insertSuggestion(el, insertValue) {
      const val = el.value;
      const pos = el.selectionStart ?? val.length;
      const before = val.slice(0, pos);
      const start = before.lastIndexOf('{{');
      if (start < 0) return;
      const after = val.slice(pos);
      el.value = val.slice(0, start) + insertValue + after;
      const newPos = start + insertValue.length;
      el.setSelectionRange(newPos, newPos);
      hideAc();
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (el === els.url) renderUrlHighlight();
    }

    function checkAutocomplete(el) {
      const val = el.value;
      const pos = el.selectionStart ?? 0;
      const before = val.slice(0, pos);
      const match = before.match(/\\{\\{([^}]*)$/);
      if (!match) { hideAc(); return; }
      showAc(el, getSuggestions(match[1]));
    }

    function attachVarAutocomplete(el) {
      el.addEventListener('input', () => checkAutocomplete(el));
      el.addEventListener('keydown', (e) => {
        if (els.acDropdown.hidden || acTarget !== el) return;
        const items = els.acDropdown.querySelectorAll('.ac-item');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          acIndex = Math.min(acIndex + 1, items.length - 1);
          items.forEach((it, i) => it.classList.toggle('active', i === acIndex));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          acIndex = Math.max(acIndex - 1, 0);
          items.forEach((it, i) => it.classList.toggle('active', i === acIndex));
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          const active = items[acIndex];
          if (active) {
            e.preventDefault();
            insertSuggestion(el, active.dataset.insert || '');
          }
        } else if (e.key === 'Escape') {
          hideAc();
        }
      });
      el.addEventListener('blur', () => setTimeout(hideAc, 150));
    }

    function fillDatalists() {
      (INIT.assertOperators || []).forEach((op) => {
        const o = document.createElement('option');
        o.value = op;
        els.assertOperatorsList.appendChild(o);
      });
      (INIT.assertExpressions || []).forEach((ex) => {
        const o = document.createElement('option');
        o.value = ex;
        els.assertExpressionsList.appendChild(o);
      });
    }

    function setDirty(d) { state.dirty = d; els.dirtyLabel.hidden = !d; }

    function setDetailTab(tab) {
      state.detailTab = tab;
      els.detailTabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.detail === tab));
      els.detailPanes.forEach((pane) => pane.classList.toggle('active', pane.dataset.detail === tab));
    }

    function readForm() {
      const headers = [];
      els.headersBody.querySelectorAll('tr').forEach((row) => {
        headers.push({ key: row.querySelector('.h-key')?.value ?? '', value: row.querySelector('.h-val')?.value ?? '' });
      });
      return { method: els.method.value, url: els.url.value, headers, body: els.body.value };
    }

    function hasWorkspaceEnvs() {
      return state.projectEnvs.length > 0;
    }

    function renderEnvBanner() {
      const p = state.resolvedPreview;
      const effective = p.effectiveEnv || '';
      els.envBannerEffective.textContent = effective || '—';
      els.envBannerEffective.classList.toggle('empty', !effective);
      const srcLabels = { block: 'block # @env', file: 'file # @env', workspace: 'workspace' };
      els.envBannerSource.textContent = effective ? (srcLabels[p.envSource] || 'workspace') : 'none';
      els.envBannerSource.hidden = !effective;
      let meta = '';
      if (p.envSource === 'block' && state.blockEnv) {
        meta = 'Using .env.' + state.blockEnv + ' from block # @env (workspace picker applies when no override)';
      } else if (p.envSource === 'file' && state.globalFileEnv) {
        meta = 'Using .env.' + state.globalFileEnv + ' from file # @env (workspace picker applies when no override)';
      } else if (!hasWorkspaceEnvs()) {
        meta = 'No .env files at project root — use + to create one';
      }
      els.envBannerMeta.textContent = meta;
      els.envBannerMeta.hidden = !meta;
    }

    function fillProjectEnvPills(container) {
      if (!container) {
        return;
      }
      container.innerHTML = '';
      if (!hasWorkspaceEnvs()) {
        const empty = document.createElement('span');
        empty.className = 'empty-state';
        empty.textContent = 'No .env files';
        container.appendChild(empty);
        return;
      }
      const effective = state.resolvedPreview.effectiveEnv;
      state.projectEnvs.forEach((name) => {
        const wrap = document.createElement('span');
        wrap.className = 'env-pill-wrap';
        const pill = document.createElement('button');
        pill.type = 'button';
        const isActive = !!state.activeProjectEnv && name === state.activeProjectEnv;
        const isEffective = !!effective && name === effective;
        let cls = 'env-pill';
        if (isActive) cls += ' active';
        if (isEffective) cls += ' effective';
        pill.className = cls;
        pill.textContent = name + (isEffective && !isActive ? ' ✓' : '');
        pill.title = 'Select workspace environment .env.' + name;
        pill.addEventListener('click', () => post('setProjectEnv', { envName: name }));
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'ghost icon-btn env-open-btn';
        openBtn.title = 'Open .env.' + name + ' in editor';
        openBtn.textContent = '↗';
        openBtn.setAttribute('aria-label', 'Open .env.' + name);
        openBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          post('openProjectEnvFile', { envName: name });
        });
        wrap.appendChild(pill);
        wrap.appendChild(openBtn);
        container.appendChild(wrap);
      });
    }

    function renderHeaders(headers) {
      els.headersBody.innerHTML = '';
      (headers.length ? headers : [{ key: '', value: '' }]).forEach((h) => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td><input class="h-key" placeholder="Header" value="' + escAttr(h.key) + '" /></td>' +
          '<td><input class="h-val var-ac-input" placeholder="Value" value="' + escAttr(h.value) + '" autocomplete="off" spellcheck="false" /></td>';
        els.headersBody.appendChild(tr);
        const inp = tr.querySelector('.h-val');
        if (inp) attachVarAutocomplete(inp);
      });
    }

    function applyForm(form, skipFocused) {
      state.suppressChange = true;
      if (!skipFocused || document.activeElement !== els.method) {
        els.method.value = (form.method || 'GET').toUpperCase();
      }
      if (!skipFocused || document.activeElement !== els.url) {
        els.url.value = form.url || '';
        renderUrlHighlight();
      }
      if (!skipFocused || document.activeElement !== els.body) {
        els.body.value = form.body || '';
      }
      if (!skipFocused || !els.headersBody.contains(document.activeElement)) {
        renderHeaders(form.headers || []);
      }
      state.suppressChange = false;
      renderEnvBanner();
    }

    function renderRequestTabs() {
      const multi = state.blocks.length > 1;
      els.requestTabs.hidden = !multi;
      els.requestTabs.innerHTML = '';
      if (!multi) return;
      state.blocks.forEach((b) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'request-tab' + (b.index === state.activeBlockIndex ? ' active' : '');
        btn.title = (b.method ? b.method + ' ' : '') + (b.url || b.label);
        btn.innerHTML = '<span class="method-pill ' + escAttr(b.methodClass || 'method-other') + '">' + escHtml(b.method || 'REQ') + '</span><span>' + escHtml(b.label) + '</span>';
        btn.addEventListener('click', () => { if (b.index !== state.activeBlockIndex) post('selectBlock', { blockIndex: b.index }); });
        els.requestTabs.appendChild(btn);
      });
    }

    function renderEnvPills() {
      fillProjectEnvPills(els.projectEnvPills);
      if (state.globalFileEnv) {
        els.fileEnvRow.hidden = false;
        els.fileEnvBadge.innerHTML = '<span class="env-pill effective">#' + escHtml(state.globalFileEnv) + '</span>';
      } else els.fileEnvRow.hidden = true;
      if (state.blockEnv && state.blockEnv !== state.globalFileEnv) {
        els.blockEnvRow.hidden = false;
        els.blockEnvBadge.innerHTML = '<span class="env-pill effective">' + escHtml(state.blockEnv) + '</span>';
      } else els.blockEnvRow.hidden = true;
      if (els.selectEnvBtn) {
        els.selectEnvBtn.hidden = !hasWorkspaceEnvs();
      }
    }

    function renderEnvVarTags() {
      els.envVarTags.innerHTML = '';
      if (!state.envVariables.length) {
        const effective = state.resolvedPreview.effectiveEnv;
        const msg = effective
          ? 'No keys in .env.' + escHtml(effective)
          : 'No workspace .env file selected';
        els.envVarTags.innerHTML = '<span class="empty-state">' + msg + '</span>';
        return;
      }
      state.envVariables.forEach((v) => {
        const span = document.createElement('span');
        span.className = 'var-tag';
        span.title = v.masked ? v.key + '=(hidden)' : v.key + '=' + v.value;
        span.innerHTML = '<span class="var-key">{{' + escHtml(v.key) + '}}</span> ' + (v.masked ? '••••' : escHtml(v.value));
        els.envVarTags.appendChild(span);
      });
    }

    function renderFileVarTags() {
      els.fileVarTags.innerHTML = '';
      if (!state.fileVariables.length) {
        els.fileVarTags.innerHTML = '<span class="empty-state">No # @var in file header</span>';
        return;
      }
      state.fileVariables.forEach((v) => {
        const row = document.createElement('div');
        row.className = 'local-var-row';
        const keyInp = document.createElement('input');
        keyInp.type = 'text';
        keyInp.className = 'local-var-key';
        keyInp.value = v.key;
        keyInp.placeholder = 'KEY';
        const valInp = document.createElement('input');
        valInp.type = 'text';
        valInp.className = 'local-var-val';
        valInp.value = v.value;
        valInp.placeholder = 'value';
        if (isSecretVarKey(v.key)) {
          valInp.type = 'password';
          valInp.autocomplete = 'off';
        }
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'secondary';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', () => {
          const key = keyInp.value.trim();
          const value = valInp.value;
          if (!key) return;
          post('updateFileVar', { originalKey: v.key, key, value });
        });
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove';
        removeBtn.textContent = '×';
        removeBtn.title = 'Remove variable';
        removeBtn.addEventListener('click', () => post('removeFileVar', { key: v.key }));
        row.appendChild(keyInp);
        row.appendChild(valInp);
        row.appendChild(saveBtn);
        row.appendChild(removeBtn);
        els.fileVarTags.appendChild(row);
      });
    }

    function saveAssertionsToFile() {
      post('saveAssertions', { blockIndex: state.activeBlockIndex, assertions: state.assertions, silent: true });
    }

    function clearAssertForm() {
      state.editingAssertionIndex = -1;
      els.assertDesc.value = '';
      els.assertExpr.value = '';
      els.assertOp.value = '';
      els.assertExpected.value = '';
      els.addAssertBtn.textContent = 'Add test';
      els.cancelAssertBtn.hidden = true;
    }

    function startEditAssertion(idx) {
      const a = state.assertions[idx];
      if (!a) return;
      state.editingAssertionIndex = idx;
      els.assertDesc.value = a.description || '';
      els.assertExpr.value = a.expression || '';
      els.assertOp.value = a.operator || '';
      els.assertExpected.value = a.expected || '';
      els.addAssertBtn.textContent = 'Save test';
      els.cancelAssertBtn.hidden = false;
      els.assertExpr.focus();
    }

    function commitAssertionFromForm() {
      const expression = els.assertExpr.value.trim();
      const operator = els.assertOp.value.trim();
      if (!expression || !operator) return false;
      const expected = els.assertExpected.value.trim();
      if (!expected && !OPS_NO_VALUE.has(operator)) {
        alert('This operator requires an expected value.');
        return false;
      }
      const description = els.assertDesc.value.trim() || expression;
      const entry = { description, expression, operator, expected, raw: '' };
      if (state.editingAssertionIndex >= 0) {
        state.assertions[state.editingAssertionIndex] = entry;
      } else {
        state.assertions.push(entry);
      }
      clearAssertForm();
      renderAssertions();
      saveAssertionsToFile();
      return true;
    }

    function renderAssertions() {
      const count = state.assertions.length;
      els.testsBadge.hidden = count === 0;
      els.testsBadge.textContent = String(count);
      els.assertionList.innerHTML = '';
      if (!count) {
        els.assertionList.innerHTML = '<li class="empty-state">No tests yet — add one above</li>';
        return;
      }
      state.assertions.forEach((a, idx) => {
        const li = document.createElement('li');
        li.className = 'assert-item';
        const body = document.createElement('div');
        body.className = 'assert-item-body';
        body.innerHTML = '<strong>' + escHtml(a.description || a.expression) + '</strong><div class="assert-expr">' + escHtml(a.expression) + ' <em>' + escHtml(a.operator) + '</em> ' + escHtml(a.expected || '') + '</div>';
        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '4px';
        actions.style.flexShrink = '0';
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'secondary icon-btn';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => startEditAssertion(idx));
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'danger icon-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => {
          if (state.editingAssertionIndex === idx) clearAssertForm();
          else if (state.editingAssertionIndex > idx) state.editingAssertionIndex -= 1;
          state.assertions = state.assertions.filter((_, i) => i !== idx);
          renderAssertions();
          saveAssertionsToFile();
        });
        actions.appendChild(editBtn);
        actions.appendChild(removeBtn);
        li.appendChild(body);
        li.appendChild(actions);
        els.assertionList.appendChild(li);
      });
    }

    function applyEditorLayout() {
      const layout = state.responseLayout === 'bottom'
        ? 'bottom'
        : state.responseLayout === 'right'
          ? 'right'
          : 'left';
      if (els.editorSplit) {
        els.editorSplit.classList.remove('layout-bottom', 'layout-left', 'layout-right');
        els.editorSplit.classList.add(
          layout === 'bottom' ? 'layout-bottom' : layout === 'right' ? 'layout-right' : 'layout-left'
        );
      }
      const showInline = state.compactMode !== false;
      if (els.responseCard) {
        els.responseCard.hidden = !showInline;
      }
      if (els.editorSplit && !showInline) {
        els.editorSplit.classList.remove('layout-left', 'layout-right');
        els.editorSplit.classList.add('layout-bottom');
      }
    }

    function statusClass(code) {
      if (!code) return 'err';
      if (code >= 200 && code < 300) return 'ok';
      if (code >= 400) return 'err';
      return 'warn';
    }

    function setResponseTab(tab) {
      state.responseTab = tab;
      els.responseTabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.responseTab === tab));
      const show = (id, visible) => {
        const el = document.getElementById(id);
        if (el) el.hidden = !visible;
      };
      show('responseEmpty', false);
      show('responseBodyPre', tab === 'body');
      show('responseHeadersTable', tab === 'headers');
      show('responseRawPre', tab === 'raw');
      show('responseAssertions', tab === 'assertions');
    }

    function renderResponseForActiveBlock() {
      const payload = state.responsesByBlock[state.activeBlockIndex];
      if (!payload) {
        els.responseStatusBadge.textContent = '—';
        els.responseStatusBadge.className = 'response-status';
        els.responseMeta.textContent = '';
        els.responseEmpty.hidden = false;
        els.responseBodyPre.hidden = true;
        els.responseHeadersTable.hidden = true;
        els.responseRawPre.hidden = true;
        els.responseAssertions.hidden = true;
        els.sendResponseChatBtn.disabled = true;
        els.resendResponseBtn.disabled = false;
        return;
      }

      const code = payload.statusCode || 0;
      els.responseStatusBadge.textContent = code > 0 ? 'HTTP ' + code : 'Error';
      els.responseStatusBadge.className = 'response-status ' + statusClass(code);
      const env = payload.envName ? ' · env: ' + payload.envName : '';
      els.responseMeta.textContent = (payload.executionTimeSeconds || '0') + 's' + env;
      els.responseEmpty.hidden = true;
      els.responseBodyPre.textContent = payload.body || '';
      els.responseRawPre.textContent = payload.rawFormatted || '';
      const headers = payload.headers || {};
      els.responseHeadersTable.innerHTML = Object.keys(headers).map((k) =>
        '<tr><td>' + escHtml(k) + '</td><td>' + escHtml(headers[k]) + '</td></tr>'
      ).join('') || '<tr><td colspan="2"><em>None</em></td></tr>';
      const results = payload.assertionResults || [];
      if (!results.length) {
        els.responseAssertions.innerHTML = '<p class="empty-state">No assertions were run.</p>';
      } else {
        const passed = results.filter((r) => r.passed).length;
        els.responseAssertions.innerHTML = '<p class="hint">' + passed + '/' + results.length + ' passed</p>' +
          results.map((r) => {
            const cls = r.passed ? 'pass' : 'fail';
            const label = (r.assertion && (r.assertion.description || r.assertion.expression)) || 'assertion';
            const detail = r.error || String(r.actualValue ?? '');
            return '<div class="response-assert ' + cls + '"><strong>' + escHtml(label) + '</strong><div>' + escHtml(detail) + '</div></div>';
          }).join('');
      }
      els.sendResponseChatBtn.disabled = false;
      els.resendResponseBtn.disabled = false;
      setResponseTab(state.responseTab || 'body');
    }

    function onResponseMessage(msg) {
      if (!msg || !msg.payload) return;
      const idx = typeof msg.blockIndex === 'number' ? msg.blockIndex : state.activeBlockIndex;
      state.responsesByBlock[idx] = msg.payload;
      if (idx === state.activeBlockIndex) {
        renderResponseForActiveBlock();
      }
    }

    function applyInit(msg) {
      state.blocks = msg.blocks || [];
      state.activeBlockIndex = msg.activeBlockIndex || 0;
      state.autoSave = !!msg.autoSave;
      state.projectEnvs = msg.projectEnvs || [];
      state.activeProjectEnv = msg.activeProjectEnv || '';
      state.envVariables = msg.envVariables || [];
      state.fileVariables = msg.fileVariables || [];
      state.helperSuggestions = msg.helperSuggestions || state.helperSuggestions;
      state.assertions = msg.assertions || [];
      state.resolvedPreview = msg.resolvedPreview || state.resolvedPreview;
      state.globalFileEnv = msg.globalFileEnv;
      state.blockEnv = msg.blockEnv;
      state.compactMode = msg.compactMode !== false;
      state.responseLayout = msg.responseLayout === 'bottom'
        ? 'bottom'
        : msg.responseLayout === 'right'
          ? 'right'
          : 'left';
      els.fileName.textContent = msg.fileName || 'HTTP Request';
      if (msg.filePath) {
        const parts = msg.filePath.split(/[/\\\\]/);
        els.filePath.textContent = parts.length > 2 ? parts.slice(-3).join('/') : msg.filePath;
      }
      renderRequestTabs();
      renderEnvPills();
      renderEnvVarTags();
      renderFileVarTags();
      renderAssertions();
      applyForm(msg.form, true);
      renderUrlHighlight();
      renderEnvBanner();
      setDetailTab(state.detailTab);
      applyEditorLayout();
      renderResponseForActiveBlock();
      if (msg.dirty === false) setDirty(false);
    }

    function onFormChange() {
      if (state.suppressChange) return;
      state.form = readForm();
      renderUrlHighlight();
      renderEnvBanner();
      setDirty(true);
      if (state.autoSave) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(
          () => post('save', { form: state.form, blockIndex: state.activeBlockIndex, silent: true }),
          600
        );
      } else {
        post('change', { form: state.form, blockIndex: state.activeBlockIndex });
      }
    }

    function onUrlPaste(e) {
      const text = e.clipboardData?.getData('text/plain')?.trim() ?? '';
      if (!/^curl(\\s|$)/i.test(text)) {
        return;
      }
      e.preventDefault();
      post('importCurl', { text, blockIndex: state.activeBlockIndex });
    }

    function onCurlImported(msg) {
      if (!msg?.form) {
        return;
      }
      if (typeof msg.blockIndex === 'number') {
        state.activeBlockIndex = msg.blockIndex;
      }
      applyForm(msg.form);
      setDetailTab('request');
      onFormChange();
    }

    function bind() {
      els.detailTabButtons.forEach((btn) => btn.addEventListener('click', () => setDetailTab(btn.dataset.detail)));
      els.method.addEventListener('change', onFormChange);
      els.url.addEventListener('input', onFormChange);
      els.url.addEventListener('paste', onUrlPaste);
      els.url.addEventListener('scroll', syncUrlScroll);
      els.url.addEventListener('mousemove', onUrlMouseMove);
      els.url.addEventListener('mouseleave', onUrlMouseLeave);
      attachVarAutocomplete(els.url);
      attachVarAutocomplete(els.body);
      els.body.addEventListener('input', onFormChange);
      els.headersBody.addEventListener('input', onFormChange);
      els.sendBtn.addEventListener('click', () => post('send', { form: readForm(), blockIndex: state.activeBlockIndex }));
      els.responseTabButtons.forEach((btn) => btn.addEventListener('click', () => setResponseTab(btn.dataset.responseTab)));
      els.sendResponseChatBtn.addEventListener('click', () => post('sendResponseToChat'));
      els.resendResponseBtn.addEventListener('click', () => post('send', { form: readForm(), blockIndex: state.activeBlockIndex }));
      els.saveBtn.addEventListener('click', () => post('save', { form: readForm(), blockIndex: state.activeBlockIndex }));
      els.copyCurlBtn.addEventListener('click', () => post('copyCurl', { blockIndex: state.activeBlockIndex }));
      els.openTextBtn.addEventListener('click', () => post('openAsText'));
      els.newRequestBtn.addEventListener('click', () => post('newRequest'));
      els.selectEnvBtn.addEventListener('click', () => post('selectEnvironment'));
      els.createEnvBtn.addEventListener('click', () => post('createEnvironment'));
      els.addHeaderBtn.addEventListener('click', () => {
        const f = readForm();
        f.headers.push({ key: '', value: '' });
        applyForm(f);
        setDetailTab('headers');
        onFormChange();
      });
      els.removeHeaderBtn.addEventListener('click', () => { const f = readForm(); if (f.headers.length > 1) f.headers.pop(); else f.headers = [{ key: '', value: '' }]; applyForm(f); onFormChange(); });
      els.addVarBtn.addEventListener('click', () => { const k = els.newVarKey.value.trim(); const v = els.newVarVal.value.trim(); if (!k) return; post('addFileVar', { key: k, value: v }); els.newVarKey.value = ''; els.newVarVal.value = ''; });
      els.addAssertBtn.addEventListener('click', () => commitAssertionFromForm());
      els.cancelAssertBtn.addEventListener('click', () => clearAssertForm());
    }

    window.addEventListener('message', (e) => {
      if (e.data?.type === 'init') applyInit(e.data);
      if (e.data?.type === 'curlImported') onCurlImported(e.data);
      if (e.data?.type === 'response') onResponseMessage(e.data);
    });
    fillDatalists();
    applyInit(INIT);
    bind();
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
}
