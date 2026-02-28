/**
 * Release Notes Panel - shows "What's New" when the extension is updated.
 * Similar to turbo-console-log release notification.
 */

import * as vscode from 'vscode';

const LAST_SEEN_VERSION_KEY = 'cursorToys.lastSeenVersion';

/**
 * Compare two semver-like version strings (e.g. "1.11.2" vs "1.10.0").
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map((n) => parseInt(n, 10) || 0);
  const partsB = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const na = partsA[i] ?? 0;
    const nb = partsB[i] ?? 0;
    if (na !== nb) {
      return na - nb;
    }
  }
  return 0;
}

/**
 * Extract the first release block from CHANGELOG markdown (from first ## [ to next ## [ or end).
 * Converts to simple HTML for the webview.
 */
export function parseChangelogFirstSection(changelogRaw: string): string {
  const match = changelogRaw.match(/^# Change Log[\s\S]*?^## \[([^\]]+)\][\s\S]*?(?=^## \[|$(?![\s\S]))/m);
  if (!match) {
    return '<p>Release notes could not be loaded. Check the CHANGELOG in the repository.</p>';
  }
  const section = match[0];
  const version = match[1];
  const afterHeader = section.replace(/^# Change Log[\s\S]*?^## \[[^\]]+\][^\n]*\n/m, '').trim();
  const html = markdownToHtml(afterHeader);
  return `<div class="changelog-version">Version ${escapeHtml(version)}</div>${html}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Simple markdown to HTML for changelog (headers, lists, bold, code).
 * Escapes HTML in content first, then applies markdown patterns.
 */
function markdownToHtml(md: string): string {
  const escaped = escapeHtml(md);
  const withHeaders = escaped
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const withListItems = withHeaders.replace(/^- (.+)$/gm, '<li>$1</li>');
  const withLists = withListItems.replace(/(<li>.*?<\/li>\n?)+/g, (m) => '<ul>' + m.trim() + '</ul>');
  const withParas = withLists.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>');
  return '<p>' + withParas + '</p>';
}

/** Default branch and raw URL base for GitHub; overridable via package.json repository. */
const DEFAULT_CHANGELOG_RAW_URL =
  'https://raw.githubusercontent.com/CursorToys/cursor-toys/main/CHANGELOG.md';

/**
 * Build raw GitHub URL for CHANGELOG from package.json repository url (e.g. .../repo.git -> main/CHANGELOG.md).
 */
function getChangelogRawUrl(context: vscode.ExtensionContext): string {
  const pkg = context.extension.packageJSON as { repository?: { url?: string } };
  const repo = pkg?.repository?.url;
  if (!repo || typeof repo !== 'string') {
    return DEFAULT_CHANGELOG_RAW_URL;
  }
  const m = repo.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (!m) {
    return DEFAULT_CHANGELOG_RAW_URL;
  }
  const repoPath = m[1].replace(/\.git$/, '');
  return `https://raw.githubusercontent.com/${repoPath}/main/CHANGELOG.md`;
}

/**
 * Fetch CHANGELOG from GitHub (raw) and return the first section as HTML.
 * Keeps the extension package small; no need to ship CHANGELOG.md.
 */
export async function loadChangelogSection(context: vscode.ExtensionContext): Promise<string> {
  const url = getChangelogRawUrl(context);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const raw = await res.text();
    return parseChangelogFirstSection(raw);
  } catch {
    return (
      '<p>Release notes could not be loaded (offline or temporary error).</p>' +
      '<p><a href="#" data-url="https://github.com/CursorToys/cursor-toys/blob/main/CHANGELOG.md">Open full changelog on GitHub</a></p>'
    );
  }
}

export class ReleaseNotesPanel {
  private static currentPanel: ReleaseNotesPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly version: string,
    private readonly changelogHtml: string
  ) {
    this.panel = panel;
    this.panel.webview.html = this.getWebviewContent();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg) => {
        if (msg.command === 'openExternal' && msg.url) {
          vscode.env.openExternal(vscode.Uri.parse(msg.url));
        }
      },
      null,
      this.disposables
    );
  }

  public static createOrShow(
    context: vscode.ExtensionContext,
    version: string,
    changelogHtml: string
  ): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (ReleaseNotesPanel.currentPanel) {
      ReleaseNotesPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'cursorToysReleaseNotes',
      'CursorToys - What\'s New',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    ReleaseNotesPanel.currentPanel = new ReleaseNotesPanel(
      panel,
      context,
      version,
      changelogHtml
    );
  }

  private dispose(): void {
    ReleaseNotesPanel.currentPanel = undefined;
    this.disposables.forEach((d) => d.dispose());
  }

  private getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CursorToys - What's New</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 24px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      line-height: 1.6;
    }
    .header {
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    .header h1 {
      font-size: 1.5em;
      margin: 0 0 8px 0;
      color: var(--vscode-foreground);
    }
    .header .version {
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
    }
    .changelog-version {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 16px;
    }
    .content {
      font-size: 13px;
    }
    .content h3 { font-size: 1.1em; margin: 16px 0 8px 0; }
    .content h4 { font-size: 1em; margin: 12px 0 6px 0; }
    .content ul { margin: 8px 0; padding-left: 20px; }
    .content li { margin: 4px 0; }
    .content code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }
    .content strong { font-weight: 600; }
    .footer {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--vscode-widget-border);
    }
    .footer a {
      color: var(--vscode-textLink-foreground);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>What's New in CursorToys</h1>
    <span class="version">Version ${escapeHtml(this.version)}</span>
  </div>
  <div class="content">
    ${this.changelogHtml}
  </div>
  <div class="footer">
    <a href="#" data-url="https://github.com/CursorToys/cursor-toys/blob/main/CHANGELOG.md">Full changelog on GitHub</a>
  </div>
  <script>
    (function() {
      const vscode = acquireVsCodeApi();
      document.querySelectorAll('[data-url]').forEach(function(el) {
        el.addEventListener('click', function(e) {
          e.preventDefault();
          vscode.postMessage({ command: 'openExternal', url: el.getAttribute('data-url') });
        });
      });
    })();
  </script>
</body>
</html>`;
  }
}

/**
 * Check if the extension was updated and show release notes once.
 * Call this from activate() after other initialization.
 */
export async function checkAndShowReleaseNotes(context: vscode.ExtensionContext): Promise<void> {
  const pkg = context.extension.packageJSON as { version?: string };
  const currentVersion = pkg?.version ?? '0.0.0';
  const lastSeen = context.globalState.get<string>(LAST_SEEN_VERSION_KEY);

  if (lastSeen !== undefined && compareVersions(currentVersion, lastSeen) > 0) {
    const changelogHtml = await loadChangelogSection(context);
    ReleaseNotesPanel.createOrShow(context, currentVersion, changelogHtml);
  }

  await context.globalState.update(LAST_SEEN_VERSION_KEY, currentVersion);
}
