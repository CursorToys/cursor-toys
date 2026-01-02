/**
 * Recommendations Browser Panel for CursorToys
 * Webview-based marketplace interface for browsing and installing recommendations
 */

import * as vscode from 'vscode';
import { RecommendationsManager, RecommendationSet, RecommendationItem } from './recommendationsManager';

export class RecommendationsBrowserPanel {
  public static currentPanel: RecommendationsBrowserPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private recommendations: RecommendationSet[] = [];
  private selectedItems: Set<string> = new Set();

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly manager: RecommendationsManager
  ) {
    this.panel = panel;

    // Set up webview content
    this.panel.webview.html = this.getWebviewContent();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'refresh':
            await this.loadRecommendations();
            break;
          case 'install':
            await this.installItem(message.item);
            break;
          case 'installSelected':
            await this.installSelected();
            break;
          case 'toggleSelect':
            this.toggleSelect(message.itemId);
            break;
          case 'preview':
            await this.previewItem(message.item);
            break;
          case 'clearCache':
            await this.manager.clearCache();
            await this.loadRecommendations();
            break;
          case 'openExternal':
            if (message.url) {
              vscode.env.openExternal(vscode.Uri.parse(message.url));
            }
            break;
          case 'shareCurrentFile':
            await this.shareCurrentFile();
            break;
        }
      },
      null,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Load recommendations
    this.loadRecommendations();
  }

  public static async createOrShow(
    context: vscode.ExtensionContext,
    manager: RecommendationsManager
  ): Promise<void> {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (RecommendationsBrowserPanel.currentPanel) {
      RecommendationsBrowserPanel.currentPanel.panel.reveal(column);
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      'cursorToysMarketplace',
      'CursorToys Marketplace',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: []
      }
    );

    RecommendationsBrowserPanel.currentPanel = new RecommendationsBrowserPanel(
      panel,
      context,
      manager
    );
  }

  private async loadRecommendations(): Promise<void> {
    try {
      this.recommendations = await this.manager.getAllRecommendations();
      
      // Check which items are already installed
      const enrichedRecommendations = await this.enrichWithInstallStatus(this.recommendations);
      
      // Send recommendations to webview
      this.panel.webview.postMessage({
        command: 'updateRecommendations',
        recommendations: enrichedRecommendations
      });

      if (this.recommendations.length === 0) {
        vscode.window.showInformationMessage(
          'No recommendations found. Configure a recommendations index URL or Gist ID in settings.'
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Error loading recommendations: ${error}`
      );
    }
  }

  /**
   * Enrich recommendations with installation status
   */
  private async enrichWithInstallStatus(recommendations: RecommendationSet[]): Promise<any[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    const fs = require('fs');
    const path = require('path');
    const { getCommandsPath, getPromptsPath, getRulesPath } = require('./utils');

    return recommendations.map(recSet => {
      const enrichedItems = recSet.items.map(item => {
        let isInstalled = false;
        let installedPath = '';

        try {
          // Try to match any .md or .mdc file with similar name
          const baseName = item.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          
          const personalPath = item.type === 'command' 
            ? getCommandsPath(undefined, true)
            : item.type === 'prompt'
            ? getPromptsPath(undefined, true)
            : getRulesPath(undefined, true);

          // Check personal folder
          if (fs.existsSync(personalPath)) {
            const files = fs.readdirSync(personalPath);
            const found = files.find((f: string) => {
              const fName = f.toLowerCase().replace(/\.(md|mdc)$/, '');
              return fName.includes(baseName) || baseName.includes(fName);
            });
            
            if (found) {
              isInstalled = true;
              installedPath = 'Personal';
            }
          }

          // Check project folder if not found in personal
          if (!isInstalled && workspaceFolder) {
            const projectPath = item.type === 'command'
              ? getCommandsPath(workspaceFolder.uri.fsPath, false)
              : item.type === 'prompt'
              ? getPromptsPath(workspaceFolder.uri.fsPath, false)
              : getRulesPath(workspaceFolder.uri.fsPath, false);

            if (fs.existsSync(projectPath)) {
              const files = fs.readdirSync(projectPath);
              const found = files.find((f: string) => {
                const fName = f.toLowerCase().replace(/\.(md|mdc)$/, '');
                return fName.includes(baseName) || baseName.includes(fName);
              });
              
              if (found) {
                isInstalled = true;
                installedPath = 'Project';
              }
            }
          }
        } catch (error) {
          console.error('Error checking install status:', error);
        }

        return {
          ...item,
          isInstalled,
          installedPath
        };
      });

      return {
        ...recSet,
        items: enrichedItems
      };
    });
  }

  private async installItem(item: RecommendationItem): Promise<void> {
    try {
      // Use existing import system
      if (item.gistId) {
        // Convert Gist ID to URL for import
        const gistUrl = `https://gist.github.com/${item.gistId}`;
        const { importFromGist } = require('./shareableImporter');
        await importFromGist(gistUrl, this.context);
      } else if (item.cursortoysUrl) {
        const { importShareable } = require('./shareableImporter');
        await importShareable(item.cursortoysUrl);
      } else {
        vscode.window.showWarningMessage(
          `No installation source for ${item.name}`
        );
        return;
      }

      vscode.window.showInformationMessage(
        `Successfully installed: ${item.name}`
      );

      // Refresh to show updated state
      await this.loadRecommendations();
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to install ${item.name}: ${error}`
      );
    }
  }

  private async installSelected(): Promise<void> {
    if (this.selectedItems.size === 0) {
      vscode.window.showWarningMessage('No items selected');
      return;
    }

    const allItems: RecommendationItem[] = [];
    for (const recSet of this.recommendations) {
      allItems.push(...recSet.items);
    }

    const itemsToInstall = allItems.filter((item) =>
      this.selectedItems.has(item.id)
    );

    let successCount = 0;
    let errorCount = 0;

    const { importFromGist, importShareable } = require('./shareableImporter');

    for (const item of itemsToInstall) {
      try {
        if (item.gistId) {
          const gistUrl = `https://gist.github.com/${item.gistId}`;
          await importFromGist(gistUrl, this.context);
        } else if (item.cursortoysUrl) {
          await importShareable(item.cursortoysUrl);
        }
        successCount++;
      } catch (error) {
        console.error(`Failed to install ${item.name}:`, error);
        errorCount++;
      }
    }

    if (errorCount === 0) {
      vscode.window.showInformationMessage(
        `Successfully installed ${successCount} items`
      );
    } else {
      vscode.window.showWarningMessage(
        `Installed ${successCount} of ${itemsToInstall.length} items. ${errorCount} failed.`
      );
    }

    // Clear selection
    this.selectedItems.clear();
    await this.loadRecommendations();
  }

  private toggleSelect(itemId: string): void {
    if (this.selectedItems.has(itemId)) {
      this.selectedItems.delete(itemId);
    } else {
      this.selectedItems.add(itemId);
    }

    // Update webview
    this.panel.webview.postMessage({
      command: 'updateSelection',
      selected: Array.from(this.selectedItems)
    });
  }

  private async previewItem(item: RecommendationItem): Promise<void> {
    // Show preview in a new document
    const doc = await vscode.workspace.openTextDocument({
      content: this.getPreviewContent(item),
      language: 'markdown'
    });

    await vscode.window.showTextDocument(doc, {
      preview: true,
      viewColumn: vscode.ViewColumn.Beside
    });
  }

  private getPreviewContent(item: RecommendationItem): string {
    return `# ${item.name}

**Type:** ${item.type}
**Description:** ${item.description}

${item.tags && item.tags.length > 0 ? `**Tags:** ${item.tags.join(', ')}` : ''}
${item.category ? `**Category:** ${item.category}` : ''}
${item.author ? `**Author:** ${item.author}` : ''}
${item.version ? `**Version:** ${item.version}` : ''}

---

${item.gistId ? `**Gist ID:** ${item.gistId}` : ''}
${item.cursortoysUrl ? `**CursorToys URL:** ${item.cursortoysUrl}` : ''}
`;
  }

  private async shareCurrentFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
      vscode.window.showWarningMessage('No active file to share. Please open a file first.');
      return;
    }

    const filePath = editor.document.uri.fsPath;
    const fileName = filePath.split('/').pop() || '';
    
    // Detect file type from path
    const { getFileTypeFromPath } = require('./utils');
    const fileType = getFileTypeFromPath(filePath);
    
    if (!fileType) {
      vscode.window.showWarningMessage(
        'This file is not a command, prompt, or rule. Please open a .cursor/commands/, .cursor/prompts/, or .cursor/rules/ file.'
      );
      return;
    }

    // Show quick pick for sharing method
    const shareMethod = await vscode.window.showQuickPick([
      {
        label: '$(mark-github) Share as GitHub Gist',
        description: 'Recommended - Version controlled and updatable',
        value: 'gist'
      },
      {
        label: '$(link) Generate Deeplink',
        description: 'Quick share via URL',
        value: 'deeplink'
      }
    ], {
      placeHolder: 'Choose how to share this file'
    });

    if (!shareMethod) {
      return;
    }

    try {
      if (shareMethod.value === 'gist') {
        // Use existing Share as Gist command
        if (fileType === 'command') {
          await vscode.commands.executeCommand('cursor-toys.shareAsCursorToysCommand');
        } else if (fileType === 'prompt') {
          await vscode.commands.executeCommand('cursor-toys.shareAsCursorToysPrompt');
        } else if (fileType === 'rule') {
          await vscode.commands.executeCommand('cursor-toys.shareAsCursorToysRule');
        }
      } else {
        // Use existing Generate Deeplink command
        if (fileType === 'command') {
          await vscode.commands.executeCommand('cursor-toys.generate-command');
        } else if (fileType === 'prompt') {
          await vscode.commands.executeCommand('cursor-toys.generate-prompt');
        } else if (fileType === 'rule') {
          await vscode.commands.executeCommand('cursor-toys.generate-rule');
        }
      }
      
      vscode.window.showInformationMessage(
        'File shared! Copy the URL and create a PR to add it to the recommendations index.',
        'Open Repository'
      ).then(selection => {
        if (selection === 'Open Repository') {
          vscode.env.openExternal(
            vscode.Uri.parse('https://github.com/CursorToys/marketplace')
          );
        }
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to share file: ${error}`);
    }
  }

  private getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CursorToys Marketplace</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
    }

    .header {
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }

    .header h1 {
      font-size: 24px;
      font-weight: 600;
    }

    .header-actions {
      display: flex;
      gap: 10px;
    }

    .search-bar {
      width: 100%;
      max-width: 500px;
      padding: 8px 12px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-size: 14px;
      margin-bottom: 20px;
    }

    .search-bar:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    .filters {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .filter-button {
      padding: 6px 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      transition: background-color 0.2s;
    }

    .filter-button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .filter-button.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .button {
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      transition: background-color 0.2s;
    }

    .button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .button-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .button-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .recommendations-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }

    .rec-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 16px;
      transition: all 0.2s;
      cursor: pointer;
    }

    .rec-card:hover {
      border-color: var(--vscode-focusBorder);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    .rec-card.selected {
      border-color: var(--vscode-button-background);
      background: var(--vscode-list-activeSelectionBackground);
    }

    .rec-card.installed {
      opacity: 0.7;
      border-color: var(--vscode-testing-iconPassed);
    }

    .rec-card.installed .rec-card-title::after {
      content: " ✓";
      color: var(--vscode-testing-iconPassed);
      margin-left: 8px;
    }

    .rec-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }

    .rec-card-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .rec-card-type {
      display: inline-block;
      padding: 2px 8px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 3px;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
      margin-right: 6px;
    }

    .installed-badge {
      display: inline-block;
      padding: 2px 8px;
      background: var(--vscode-testing-iconPassed);
      color: var(--vscode-editor-background);
      border-radius: 3px;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
    }

    .rec-card-description {
      color: var(--vscode-descriptionForeground);
      font-size: 13px;
      margin-bottom: 12px;
      line-height: 1.5;
    }

    .rec-card-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }

    .tag {
      padding: 2px 8px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 3px;
      font-size: 11px;
      color: var(--vscode-textLink-foreground);
    }

    .rec-card-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }

    .action-button {
      flex: 1;
      padding: 6px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .action-button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .action-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background: var(--vscode-button-secondaryBackground);
    }

    .action-button:disabled:hover {
      background: var(--vscode-button-secondaryBackground);
    }

    .action-button-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .action-button-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .footer {
      position: sticky;
      bottom: 0;
      background: var(--vscode-editor-background);
      padding: 16px 0;
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .selected-count {
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state h2 {
      font-size: 20px;
      margin-bottom: 10px;
    }

    .contribute-section {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }

    .contribute-section h2 {
      font-size: 24px;
      margin-bottom: 20px;
      color: var(--vscode-editor-foreground);
    }

    .contribute-section h3 {
      font-size: 18px;
      margin-top: 24px;
      margin-bottom: 12px;
      color: var(--vscode-editor-foreground);
    }

    .contribute-section p {
      line-height: 1.6;
      margin-bottom: 16px;
      color: var(--vscode-descriptionForeground);
    }

    .contribute-section ul, .contribute-section ol {
      margin-bottom: 16px;
      padding-left: 24px;
      color: var(--vscode-descriptionForeground);
    }

    .contribute-section li {
      margin-bottom: 8px;
      line-height: 1.6;
    }

    .contribute-section code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
    }

    .contribute-section pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin-bottom: 16px;
    }

    .contribute-section pre code {
      background: none;
      padding: 0;
    }

    .info-box {
      background: var(--vscode-textBlockQuote-background);
      border-left: 4px solid var(--vscode-textLink-foreground);
      padding: 12px 16px;
      margin-bottom: 16px;
      border-radius: 4px;
    }

    .warning-box {
      background: var(--vscode-inputValidation-warningBackground);
      border-left: 4px solid var(--vscode-inputValidation-warningBorder);
      padding: 12px 16px;
      margin-bottom: 16px;
      border-radius: 4px;
    }

    .example-box {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      padding: 16px;
      margin-bottom: 16px;
      border-radius: 6px;
    }

    .contribute-actions {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }

    .contribute-actions .button {
      flex: 1;
    }

    .icon {
      display: inline-block;
      width: 16px;
      height: 16px;
      margin-right: 4px;
      vertical-align: text-bottom;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>CursorToys Marketplace</h1>
    <div class="header-actions">
      <button class="button-secondary button" onclick="refreshRecommendations()">Refresh</button>
      <button class="button-secondary button" onclick="clearCache()">Clear Cache</button>
    </div>
  </div>

  <input 
    type="text" 
    class="search-bar" 
    id="searchInput" 
    placeholder="Search recommendations by name, description, or tags..."
    oninput="filterRecommendations()"
  />

  <div class="filters">
    <button class="filter-button active" data-filter="all" onclick="setFilter('all')">All</button>
    <button class="filter-button" data-filter="command" onclick="setFilter('command')">Commands</button>
    <button class="filter-button" data-filter="prompt" onclick="setFilter('prompt')">Prompts</button>
    <button class="filter-button" data-filter="rule" onclick="setFilter('rule')">Rules</button>
    <button class="filter-button" data-filter="contribute" onclick="setFilter('contribute')" style="margin-left: auto;">
      📤 Contribute
    </button>
  </div>

  <div id="content">
    <div class="empty-state">
      <h2>Loading recommendations...</h2>
      <p>Please wait while we fetch the latest recommendations.</p>
    </div>
  </div>

  <div class="footer" id="footer" style="display: none;">
    <div class="selected-count" id="selectedCount">0 items selected</div>
    <button class="button" onclick="installSelected()">Install Selected</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let allRecommendations = [];
    let currentFilter = 'all';
    let selectedItems = new Set();

    window.addEventListener('message', event => {
      const message = event.data;
      
      switch (message.command) {
        case 'updateRecommendations':
          allRecommendations = message.recommendations;
          renderRecommendations();
          break;
        case 'updateSelection':
          selectedItems = new Set(message.selected);
          updateSelectionUI();
          break;
      }
    });

    function refreshRecommendations() {
      vscode.postMessage({ command: 'refresh' });
    }

    function clearCache() {
      vscode.postMessage({ command: 'clearCache' });
    }

    function setFilter(filter) {
      currentFilter = filter;
      document.querySelectorAll('.filter-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
      });
      
      if (filter === 'contribute') {
        showContributePage();
      } else {
        filterRecommendations();
      }
    }

    function filterRecommendations() {
      const searchTerm = document.getElementById('searchInput').value.toLowerCase();
      renderRecommendations(searchTerm);
    }

    function showContributePage() {
      const content = document.getElementById('content');
      const footer = document.getElementById('footer');
      footer.style.display = 'none';
      
      content.innerHTML = \`
        <div class="contribute-section">
          <h2>🚀 Contribute Your Commands, Prompts & Rules</h2>
          
          <p>
            Help the CursorToys community by sharing your awesome commands, prompts, and rules! 
            Your contributions will help other developers be more productive.
          </p>

          <div class="info-box">
            <strong>📌 What can you contribute?</strong>
            <ul style="margin: 8px 0 0 0;">
              <li><strong>Commands:</strong> Reusable automation scripts</li>
              <li><strong>Prompts:</strong> AI interaction templates</li>
              <li><strong>Rules:</strong> Project guidelines and standards</li>
            </ul>
          </div>

          <h3>📝 Step 1: Prepare Your File with Metadata</h3>
          <p>Create a Markdown file (.md or .mdc) with YAML frontmatter containing metadata:</p>
          
          <div class="example-box">
            <pre><code>---
description: Short description of what this does
tags:
  - api
  - http
  - automation
category: Development Tools
author: Your Name
version: 1.0.0
---

# Your Command/Prompt/Rule Title

Your content goes here...

## Usage
Explain how to use it...

## Examples
Provide examples...
</code></pre>
          </div>

          <div class="warning-box">
            <strong>⚠️ Important:</strong> The YAML frontmatter helps with discovery in the marketplace. Include description, tags, and category.
          </div>

          <h3>🔗 Step 2: Share Using CursorToys</h3>
          <p>Use the built-in CursorToys sharing system to create a shareable link:</p>

          <h4>Option A: Share as Gist (Recommended)</h4>
          <ol>
            <li>Open your command/prompt/rule file in the editor</li>
            <li>Right-click → <strong>CursorToys: Share as Gist</strong></li>
            <li>The file will be uploaded to GitHub Gist automatically</li>
            <li>Copy the Gist URL from the notification</li>
          </ol>

          <div class="info-box">
            <strong>💡 Pro Tip:</strong> Gists are recommended because they:
            <ul style="margin: 8px 0 0 0;">
              <li>Are version-controlled (users get updates)</li>
              <li>Support multiple files</li>
              <li>Have syntax highlighting</li>
              <li>Can be edited later without changing the URL</li>
            </ul>
          </div>

          <h4>Option B: Generate Deeplink</h4>
          <ol>
            <li>Open your file in the editor</li>
            <li>Right-click → <strong>CursorToys: Share as Deeplink</strong></li>
            <li>Choose the type (Command/Prompt/Rule)</li>
            <li>Copy the generated CursorToys URL</li>
          </ol>

          <div class="contribute-actions" style="margin: 20px 0;">
            <button class="button" onclick="shareCurrentFile()">
              🔗 Share Current File
            </button>
            <button class="button-secondary button" onclick="openShareHelp()">
              ❓ How to Share
            </button>
          </div>

          <h3>📬 Step 3: Submit to the Index</h3>
          <p>After generating your shareable link, add it to the recommendations index:</p>

          <h4>Via Pull Request (Easy!)</h4>
          <ol>
            <li>Click the button below to open the index editor</li>
            <li>Add your item to the appropriate section:
              <pre style="margin-top: 8px;"><code>{
  "name": "Your Item Name",
  "gistId": "username/gist-id",  // or use cursortoysUrl
  "type": "command",  // or "prompt" or "rule"
  "context": {
    "languages": ["javascript", "typescript"],
    "frameworks": ["react"]
  }
}</code></pre>
            </li>
            <li>Click "Propose changes" and submit the Pull Request</li>
          </ol>

          <div class="contribute-actions" style="margin: 20px 0;">
            <button class="button" onclick="openIndexEditor()">
              📝 Edit Recommendations Index
            </button>
            <button class="button-secondary button" onclick="viewIndexExample()">
              📚 View Index Format
            </button>
          </div>

          <h4>Or via GitHub Issue</h4>
          <p>If you prefer, you can also submit via issue:</p>
          <ol>
            <li>Copy your Gist URL or CursorToys deeplink</li>
            <li>Click "Submit via Issue" below</li>
            <li>Fill in the details and submit</li>
          </ol>

          <div class="contribute-actions" style="margin: 20px 0;">
            <button class="button-secondary button" onclick="openIssue()">
              📬 Submit via Issue
            </button>
          </div>

          <h3>🎯 Context Targeting (Optional)</h3>
          <p>
            Help users discover your contribution by specifying when it's relevant:
          </p>
          <ul>
            <li><strong>Languages:</strong> <code>javascript</code>, <code>python</code>, <code>go</code>, <code>java</code>, <code>typescript</code>, etc.</li>
            <li><strong>Frameworks:</strong> <code>react</code>, <code>vue</code>, <code>django</code>, <code>express</code>, <code>nextjs</code>, etc.</li>
            <li><strong>Special folders:</strong> <code>.github</code>, <code>docker</code>, <code>kubernetes</code>, etc.</li>
          </ul>

          <div class="example-box">
            <strong>Example with context:</strong>
            <pre><code>{
  "name": "React Component Generator",
  "gistId": "username/abc123",
  "type": "command",
  "context": {
    "languages": ["javascript", "typescript"],
    "frameworks": ["react", "nextjs"],
    "specialFolders": ["components", "src"]
  }
}</code></pre>
          </div>

          <div class="info-box">
            <strong>💡 More Pro Tips:</strong>
            <ul style="margin: 8px 0 0 0;">
              <li>Use clear, descriptive names</li>
              <li>Add relevant tags for better discovery</li>
              <li>Include usage examples in your file</li>
              <li>Test your command/prompt/rule before sharing</li>
              <li>Update your Gist if you improve it later</li>
            </ul>
          </div>

          <h3>✅ Review Process</h3>
          <p>
            After submission, your contribution will be reviewed for:
          </p>
          <ul>
            <li>✓ Quality and usefulness</li>
            <li>✓ Proper formatting and metadata</li>
            <li>✓ Security (no malicious code)</li>
            <li>✓ Compatibility with CursorToys</li>
          </ul>
          <p>
            Most contributions are reviewed within 1-3 days. You'll receive feedback via GitHub.
          </p>

          <h3>🎬 Quick Start Workflow</h3>
          <div class="example-box">
            <ol style="margin: 8px 0;">
              <li>Open your .md file with YAML frontmatter</li>
              <li>Right-click → <strong>Share as Gist</strong></li>
              <li>Copy the Gist URL</li>
              <li>Click <strong>Edit Recommendations Index</strong> above</li>
              <li>Add your entry with the Gist URL</li>
              <li>Submit the PR</li>
              <li>Done! 🎉</li>
            </ol>
          </div>

          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--vscode-panel-border); text-align: center; color: var(--vscode-descriptionForeground);">
            <p>
              Thank you for contributing to the CursorToys community! 🎉<br>
              Questions? <a href="https://github.com/CursorToys/cursor-toys/discussions" style="color: var(--vscode-textLink-foreground);">Join the discussion</a>
            </p>
          </div>
        </div>
      \`;
    }

    function shareCurrentFile() {
      vscode.postMessage({ command: 'shareCurrentFile' });
    }

    function openShareHelp() {
      vscode.postMessage({ 
        command: 'openExternal', 
        url: 'https://github.com/CursorToys/cursor-toys#sharing-commands-prompts--rules' 
      });
    }

    function openIndexEditor() {
      vscode.postMessage({ 
        command: 'openExternal', 
        url: 'https://github.com/CursorToys/marketplace/edit/main/recommendations-index.json' 
      });
    }

    function viewIndexExample() {
      vscode.postMessage({ 
        command: 'openExternal', 
        url: 'https://github.com/CursorToys/marketplace/blob/main/recommendations-index.json' 
      });
    }

    function openIssue() {
      vscode.postMessage({ 
        command: 'openExternal', 
        url: 'https://github.com/CursorToys/marketplace/pulls' 
      });
    }

    function viewExamples() {
      vscode.postMessage({ 
        command: 'openExternal', 
        url: 'https://github.com/CursorToys/marketplace/blob/main/recommendations-index.json' 
      });
    }

    function renderRecommendations(searchTerm = '') {
      const content = document.getElementById('content');
      
      if (!allRecommendations || allRecommendations.length === 0) {
        content.innerHTML = \`
          <div class="empty-state">
            <h2>No recommendations found</h2>
            <p>Configure a recommendations index URL or Gist ID in settings to get started.</p>
          </div>
        \`;
        return;
      }

      // Flatten all items
      const allItems = [];
      allRecommendations.forEach(recSet => {
        recSet.items.forEach(item => {
          allItems.push({ ...item, setName: recSet.name });
        });
      });

      // Filter items
      const filteredItems = allItems.filter(item => {
        // Filter by type
        if (currentFilter !== 'all' && item.type !== currentFilter) {
          return false;
        }

        // Filter by search term
        if (searchTerm) {
          const searchableText = [
            item.name,
            item.description,
            ...(item.tags || [])
          ].join(' ').toLowerCase();
          
          if (!searchableText.includes(searchTerm)) {
            return false;
          }
        }

        return true;
      });

      if (filteredItems.length === 0) {
        content.innerHTML = \`
          <div class="empty-state">
            <h2>No matching recommendations</h2>
            <p>Try adjusting your search or filters.</p>
          </div>
        \`;
        return;
      }

      // Render grid
      const grid = document.createElement('div');
      grid.className = 'recommendations-grid';

      filteredItems.forEach(item => {
        const card = createRecommendationCard(item);
        grid.appendChild(card);
      });

      content.innerHTML = '';
      content.appendChild(grid);

      updateSelectionUI();
    }

    function createRecommendationCard(item) {
      const card = document.createElement('div');
      card.className = 'rec-card';
      card.dataset.itemId = item.id;
      
      if (selectedItems.has(item.id)) {
        card.classList.add('selected');
      }

      if (item.isInstalled) {
        card.classList.add('installed');
      }

      card.innerHTML = \`
        <div class="rec-card-header">
          <div>
            <div class="rec-card-title">\${item.name}</div>
            <span class="rec-card-type">\${item.type}</span>
            \${item.isInstalled ? \`<span class="installed-badge">Installed (\${item.installedPath})</span>\` : ''}
          </div>
        </div>
        <div class="rec-card-description">\${item.description}</div>
        \${item.tags && item.tags.length > 0 ? \`
          <div class="rec-card-tags">
            \${item.tags.map(tag => \`<span class="tag">\${tag}</span>\`).join('')}
          </div>
        \` : ''}
        <div class="rec-card-actions">
          <button class="action-button" onclick="installItem('\${item.id}')" \${item.isInstalled ? 'disabled' : ''}>
            \${item.isInstalled ? 'Installed' : 'Install'}
          </button>
          <button class="action-button-secondary action-button" onclick="previewItem('\${item.id}')">Preview</button>
        </div>
      \`;

      card.addEventListener('click', (e) => {
        if (!e.target.classList.contains('action-button') && !item.isInstalled) {
          toggleSelect(item.id);
        }
      });

      return card;
    }

    function toggleSelect(itemId) {
      if (selectedItems.has(itemId)) {
        selectedItems.delete(itemId);
      } else {
        selectedItems.add(itemId);
      }
      vscode.postMessage({ command: 'toggleSelect', itemId });
      updateSelectionUI();
    }

    function updateSelectionUI() {
      const footer = document.getElementById('footer');
      const selectedCount = document.getElementById('selectedCount');
      
      footer.style.display = selectedItems.size > 0 ? 'flex' : 'none';
      selectedCount.textContent = \`\${selectedItems.size} item\${selectedItems.size !== 1 ? 's' : ''} selected\`;

      // Update card selection
      document.querySelectorAll('.rec-card').forEach(card => {
        const itemId = card.dataset.itemId;
        card.classList.toggle('selected', selectedItems.has(itemId));
      });
    }

    function installItem(itemId) {
      const allItems = [];
      allRecommendations.forEach(recSet => {
        allItems.push(...recSet.items);
      });
      
      const item = allItems.find(i => i.id === itemId);
      if (item) {
        vscode.postMessage({ command: 'install', item });
      }
    }

    function previewItem(itemId) {
      const allItems = [];
      allRecommendations.forEach(recSet => {
        allItems.push(...recSet.items);
      });
      
      const item = allItems.find(i => i.id === itemId);
      if (item) {
        vscode.postMessage({ command: 'preview', item });
      }
    }

    function installSelected() {
      vscode.postMessage({ command: 'installSelected' });
    }
  </script>
</body>
</html>`;
  }

  public dispose(): void {
    RecommendationsBrowserPanel.currentPanel = undefined;

    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

