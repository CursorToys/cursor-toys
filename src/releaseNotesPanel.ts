/**
 * Release Notes Panel - shows "What's New" when the extension is updated.
 * Similar to turbo-console-log release notification.
 */

import * as vscode from 'vscode';
import {
  buildPanelHeader,
  buildWebviewDocument,
  configurePanelWebview,
  getExtensionUri,
} from './webviewUi';

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
 * Extract the intro block (title, images, first paragraph) and first release block from CHANGELOG.
 * Supports both version formats: "## [1.0.0]" (Keep a Changelog) and "## v1.0.0 - Title".
 * Converts to simple HTML for the webview (including images).
 */
export function parseChangelogFirstSection(changelogRaw: string): string {
  // Intro: everything before the first ## version line
  const introMatch = changelogRaw.match(/^[\s\S]*?(?=^## (?:\[[^\]]+\]|v\d+(?:\.\d+)*))/m);
  const intro = introMatch ? introMatch[0].trim() : '';

  // First version block: ## [x.y.z] or ## vx.y.z, then content until next ## or end of file
  const match = changelogRaw.match(
    /[\s\S]*?^## (?:\[([^\]]+)\]|v(\d+(?:\.\d+)*))[^\n]*\n((?:[\s\S]*?)(?=^## )|(?:[\s\S]*))/m
  );
  if (!match) {
    return '<p>Release notes could not be loaded. Check the CHANGELOG in the repository.</p>';
  }
  const version = match[1] ?? match[2];
  const afterHeader = (match[3] ?? '').trim();

  const introHtml = intro ? markdownToHtml(intro) : '';
  const releaseHtml = markdownToHtml(afterHeader);
  const versionDiv = `<div class="changelog-version">Version ${escapeHtml(version)}</div>`;
  return introHtml + versionDiv + releaseHtml;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Simple markdown to HTML for changelog blocks (headers, lists, bold, code, images).
 */
function markdownToHtml(md: string): string {
  const blocks = md.split(/\n{2,}/);
  const parts: string[] = [];

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (!block) {
      continue;
    }

    if (/^#### /.test(block)) {
      parts.push(`<h4>${inlineMarkdown(block.replace(/^#### /, ''))}</h4>`);
      continue;
    }
    if (/^### /.test(block)) {
      parts.push(`<h3>${inlineMarkdown(block.replace(/^### /, ''))}</h3>`);
      continue;
    }
    if (/^## /.test(block)) {
      parts.push(`<h2>${inlineMarkdown(block.replace(/^## /, ''))}</h2>`);
      continue;
    }
    if (/^# /.test(block)) {
      parts.push(`<h1>${inlineMarkdown(block.replace(/^# /, ''))}</h1>`);
      continue;
    }

    const lines = block.split('\n');
    if (lines.every((line) => /^- /.test(line.trim()))) {
      const items = lines
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => `<li>${inlineMarkdown(line.replace(/^- /, ''))}</li>`)
        .join('');
      parts.push(`<ul>${items}</ul>`);
      continue;
    }

    if (/^!\[[^\]]*\]\(https?:\/\//.test(block)) {
      parts.push(inlineMarkdown(block));
      continue;
    }

    const paragraph = lines.map((line) => line.trim()).join(' ');
    parts.push(`<p>${inlineMarkdown(paragraph)}</p>`);
  }

  return parts.join('\n');
}

function inlineMarkdown(text: string): string {
  const escaped = escapeHtml(text);
  const withImages = replaceMarkdownImages(escaped);
  const withLinks = replaceMarkdownLinks(withImages);
  return withLinks
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/** Replace ![](url) and ![alt](url) with <img>. Only allows https? URLs. */
function replaceMarkdownImages(escaped: string): string {
  return escaped.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (_m, alt, url) => {
    const safeUrl = url.replace(/&amp;/g, '&').replace(/"/g, '&quot;');
    const safeAlt = (alt || '').replace(/"/g, '&quot;');
    return `<img src="${safeUrl}" alt="${safeAlt}" loading="lazy" />`;
  });
}

/** Replace [text](url) with <a href="url">text</a>. Only allows https? URLs. */
function replaceMarkdownLinks(escaped: string): string {
  return escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_m, text, url) => {
    const safeUrl = url.replace(/&amp;/g, '&').replace(/"/g, '&quot;');
    const safeText = (text || '').replace(/"/g, '&quot;');
    return `<a href="${safeUrl}">${safeText}</a>`;
  });
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
    configurePanelWebview(this.panel.webview, this.context.extensionUri);
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
    const body =
      buildPanelHeader({
        title: 'CursorToys',
        subtitle: `What's New · v${this.version}`,
      }) +
      `<div class="ct-body fade-in">` +
      `<div class="content">${this.changelogHtml}</div>` +
      `<div class="footer">` +
      `<a href="#" data-url="https://github.com/CursorToys/cursor-toys/blob/main/CHANGELOG.md">Full changelog on GitHub</a>` +
      `</div></div>`;

    return buildWebviewDocument({
      webview: this.panel.webview,
      extensionUri: this.context.extensionUri,
      title: "CursorToys - What's New",
      body,
      allowHttpsImages: true,
      extraStyles: `
    .content { line-height: 1.5; }
    .content h2 { margin: 14px 0 6px; font-size: 1.05em; }
    .content h3 { margin: 12px 0 4px; font-size: 1em; }
    .content h4 { margin: 10px 0 4px; font-size: 0.95em; }
    .content p { margin: 6px 0; }
    .content ul { margin: 6px 0 8px; }
    .content li { margin: 2px 0; }
    .changelog-version {
      margin: 12px 0 8px;
      font-family: var(--ct-mono, monospace);
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ct-accent, #6366f1);
    }`,
      scripts: `
    (function() {
      const vscode = acquireVsCodeApi();
      document.querySelectorAll('[data-url]').forEach(function(el) {
        el.addEventListener('click', function(e) {
          e.preventDefault();
          vscode.postMessage({ command: 'openExternal', url: el.getAttribute('data-url') });
        });
      });
      document.querySelectorAll('a[href^="http"]').forEach(function(el) {
        el.addEventListener('click', function(e) {
          e.preventDefault();
          vscode.postMessage({ command: 'openExternal', url: el.getAttribute('href') });
        });
      });
    })();`,
    });
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
  const isFirstRun = lastSeen === undefined;
  const isUpdate = lastSeen !== undefined && compareVersions(currentVersion, lastSeen) > 0;

  const showOnStartup = vscode.workspace
    .getConfiguration('cursorToys')
    .get<boolean>('releaseNotes.showOnStartup', true);

  if (showOnStartup && (isFirstRun || isUpdate)) {
    const changelogHtml = await loadChangelogSection(context);
    ReleaseNotesPanel.createOrShow(context, currentVersion, changelogHtml);
  }

  await context.globalState.update(LAST_SEEN_VERSION_KEY, currentVersion);
}
