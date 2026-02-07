/**
 * Skills Browser Panel for CursorToys
 * Webview-based marketplace interface for browsing Agent Skills from Tech Leads Club
 */

import * as vscode from 'vscode';
import { RecommendationsManager } from './recommendationsManager';

interface SkillItem {
  id: string;
  name: string;
  description: string;
  category: string;
  path: string;
  author?: string;
  version?: string;
}

export class RecommendationsBrowserPanel {
  public static currentPanel: RecommendationsBrowserPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private skills: SkillItem[] = [];
  private categories: Record<string, { name: string; description: string }> = {};

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
            await this.loadSkills();
            break;
          case 'copyInstallCommand':
            await this.copyInstallCommand(message.skillName);
            break;
          case 'openInTerminal':
            await this.openInTerminal(message.skillName);
            break;
          case 'openGitHub':
            await this.openGitHub(message.skillPath);
            break;
          case 'clearCache':
            await this.manager.clearCache();
            await this.loadSkills();
            break;
          case 'openExternal':
            if (message.url) {
              vscode.env.openExternal(vscode.Uri.parse(message.url));
            }
            break;
        }
      },
      null,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Load skills
    this.loadSkills();
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
      'cursorToysSkillsMarketplace',
      'Agent Skills Marketplace',
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

  private async loadSkills(): Promise<void> {
    try {
      const registry = await this.manager.getAllSkills();
      
      if (!registry) {
        vscode.window.showErrorMessage(
          'Failed to load skills registry. Check your internet connection.'
        );
        return;
      }

      this.skills = registry.skills;
      this.categories = registry.categories;
      
      // Send skills to webview
      this.panel.webview.postMessage({
        command: 'updateSkills',
        skills: this.skills,
        categories: this.categories,
        totalSkills: this.skills.length,
        totalCategories: Object.keys(this.categories).length
      });

    } catch (error) {
      vscode.window.showErrorMessage(
        `Error loading skills: ${error}`
      );
    }
  }

  private async copyInstallCommand(skillName: string): Promise<void> {
    const command = `npx @tech-leads-club/agent-skills --skill ${skillName} -a cursor`;
    
    await vscode.env.clipboard.writeText(command);
    
    vscode.window.showInformationMessage(
      `Install command copied! Run it in your terminal to add this skill.`,
      'Open Terminal'
    ).then(selection => {
      if (selection === 'Open Terminal') {
        vscode.commands.executeCommand('workbench.action.terminal.new');
      }
    });
  }

  private async openInTerminal(skillName: string): Promise<void> {
    const command = `npx @tech-leads-club/agent-skills --skill ${skillName} -a cursor`;
    
    // Copy to clipboard first
    await vscode.env.clipboard.writeText(command);
    
    // Create or get terminal
    const terminal = vscode.window.createTerminal('Agent Skills');
    terminal.show();
    
    // Send command to terminal
    terminal.sendText(command);
    
    vscode.window.showInformationMessage(
      `Running install command in terminal...`
    );
  }

  private async openGitHub(skillPath: string): Promise<void> {
    const baseUrl = 'https://github.com/tech-leads-club/agent-skills/tree/main/packages/skills-catalog/skills';
    const url = `${baseUrl}/${skillPath}`;
    vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Skills Marketplace</title>
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
      margin-bottom: 8px;
      text-align: center;
    }

    .header h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .header-subtitle {
      font-size: 16px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }

    .header-disclaimer {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 20px;
    }

    .header-actions {
      display: flex;
      gap: 10px;
      justify-content: center;
      margin-bottom: 20px;
    }

    .search-bar {
      width: 100%;
      max-width: 600px;
      margin: 0 auto 20px;
      padding: 10px 16px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      font-size: 14px;
      display: block;
    }

    .search-bar:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    .filters {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
      flex-wrap: wrap;
      justify-content: center;
      max-width: 100%;
      overflow-x: auto;
      padding: 8px 0;
    }

    .filter-button {
      padding: 8px 16px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 20px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .filter-button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
      transform: translateY(-1px);
    }

    .filter-button.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
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

    .skills-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }

    .skill-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 20px;
      transition: all 0.2s;
    }

    .skill-card:hover {
      border-color: var(--vscode-focusBorder);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transform: translateY(-2px);
    }

    .skill-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      gap: 12px;
    }

    .skill-card-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--vscode-editor-foreground);
      flex: 1;
      min-width: 0;
    }

    .category-badge {
      padding: 4px 12px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 12px;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .skill-card-description {
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
      margin-bottom: 12px;
      line-height: 1.6;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .skill-card-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      flex-wrap: wrap;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .subfolders {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .subfolder-item {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 4px;
      font-size: 11px;
    }

    .subfolder-icon {
      width: 14px;
      height: 14px;
      opacity: 0.9;
      flex-shrink: 0;
    }

    .install-command-box {
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .install-command {
      flex: 1;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: var(--vscode-textLink-foreground);
      word-break: break-all;
      user-select: all;
    }

    .copy-icon {
      width: 18px;
      height: 18px;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.2s;
      flex-shrink: 0;
    }

    .copy-icon:hover {
      opacity: 1;
    }

    .skill-card-actions {
      display: flex;
      gap: 8px;
    }

    .action-button {
      flex: 1;
      padding: 8px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: background 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .action-button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .action-button-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .action-button-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .action-icon {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
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
  </style>
</head>
<body>
  <div class="header">
    <h1>Browse Skills</h1>
    <div class="header-subtitle" id="subtitle">
      Explore our collection of agent skills
    </div>
    <div class="header-disclaimer">
      Powered by Tech Leads Club
    </div>
    <div class="header-actions">
      <button class="button-secondary button" onclick="refreshSkills()">Refresh</button>
      <button class="button-secondary button" onclick="clearCache()">Clear Cache</button>
    </div>
  </div>

  <input 
    type="text" 
    class="search-bar" 
    id="searchInput" 
    placeholder="Search skills by name or description..."
    oninput="filterSkills()"
  />

  <div class="filters" id="filters">
    <button class="filter-button active" data-filter="all" onclick="setFilter('all')">All</button>
  </div>

  <div id="content">
    <div class="empty-state">
      <h2>Loading skills...</h2>
      <p>Please wait while we fetch the latest skills from Tech Leads Club.</p>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let allSkills = [];
    let categories = {};
    let currentFilter = 'all';

    window.addEventListener('message', event => {
      const message = event.data;
      
      switch (message.command) {
        case 'updateSkills':
          allSkills = message.skills || [];
          categories = message.categories || {};
          updateHeader(message.totalSkills || 0, message.totalCategories || 0);
          updateFilters();
          renderSkills();
          break;
      }
    });

    function updateHeader(totalSkills, totalCategories) {
      const subtitle = document.getElementById('subtitle');
      subtitle.textContent = \`Explore our collection of \${totalSkills} agent skills across \${totalCategories} categories\`;
    }

    function updateFilters() {
      const filtersContainer = document.getElementById('filters');
      
      // Clear existing category filters (keep "All")
      const allButton = filtersContainer.querySelector('[data-filter="all"]');
      filtersContainer.innerHTML = '';
      filtersContainer.appendChild(allButton);
      
      // Add category filters
      Object.keys(categories).sort().forEach(categoryId => {
        const category = categories[categoryId];
        const button = document.createElement('button');
        button.className = 'filter-button';
        button.dataset.filter = categoryId;
        button.textContent = category.name;
        button.onclick = () => setFilter(categoryId);
        filtersContainer.appendChild(button);
      });
    }

    function refreshSkills() {
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
      filterSkills();
    }

    function filterSkills() {
      const searchTerm = document.getElementById('searchInput').value.toLowerCase();
      renderSkills(searchTerm);
    }

    function renderSkills(searchTerm = '') {
      const content = document.getElementById('content');
      
      if (!allSkills || allSkills.length === 0) {
        content.innerHTML = \`
          <div class="empty-state">
            <h2>No skills found</h2>
            <p>Unable to load skills from the registry. Check your internet connection and try again.</p>
          </div>
        \`;
        return;
      }

      // Filter skills
      const filteredSkills = allSkills.filter(skill => {
        // Filter by category
        if (currentFilter !== 'all' && skill.category !== currentFilter) {
          return false;
        }

        // Filter by search term
        if (searchTerm) {
          const searchableText = [
            skill.name,
            skill.description,
            skill.category,
            skill.author || ''
          ].join(' ').toLowerCase();
          
          if (!searchableText.includes(searchTerm)) {
            return false;
          }
        }

        return true;
      });

      if (filteredSkills.length === 0) {
        content.innerHTML = \`
          <div class="empty-state">
            <h2>No matching skills</h2>
            <p>Try adjusting your search or filters.</p>
          </div>
        \`;
        return;
      }

      // Render grid
      const grid = document.createElement('div');
      grid.className = 'skills-grid';

      filteredSkills.forEach(skill => {
        const card = createSkillCard(skill);
        grid.appendChild(card);
      });

      content.innerHTML = '';
      content.appendChild(grid);
    }

    function createSkillCard(skill) {
      const card = document.createElement('div');
      card.className = 'skill-card';
      
      const categoryName = categories[skill.category]?.name || skill.category;
      const installCommand = \`npx @tech-leads-club/agent-skills --skill \${skill.name} -a cursor\`;
      
      // Detect subfolders from files array
      const subfolders = {
        references: false,
        scripts: false,
        assets: false
      };
      
      if (skill.files && Array.isArray(skill.files)) {
        skill.files.forEach(file => {
          if (file.includes('references/')) subfolders.references = true;
          if (file.includes('scripts/')) subfolders.scripts = true;
          if (file.includes('assets/')) subfolders.assets = true;
        });
      }
      
      // Build meta items (author, version, subfolders)
      const metaItems = [];
      
      if (skill.author) {
        metaItems.push(\`<span class="meta-item">by \${skill.author}</span>\`);
      }
      
      if (skill.version) {
        metaItems.push(\`<span class="meta-item">v\${skill.version}</span>\`);
      }
      
      // Add subfolder badges with icons and text
      if (subfolders.references) {
        metaItems.push(\`
          <span class="subfolder-item">
            <svg class="subfolder-icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 1.75A.75.75 0 01.75 1h4.253c1.227 0 2.317.59 3 1.501A3.744 3.744 0 0111.006 1h4.245a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75h-4.507a2.25 2.25 0 00-1.591.659l-.622.621a.75.75 0 01-1.06 0l-.622-.621A2.25 2.25 0 005.258 13H.75a.75.75 0 01-.75-.75V1.75zm8.755 3a2.25 2.25 0 012.25-2.25H14.5v9h-3.757c-.71 0-1.4.201-1.992.572l.004-7.322zm-1.504 7.324l.004-5.073-.002-2.253A2.25 2.25 0 005.003 2.5H1.5v9h3.757a3.75 3.75 0 011.994.574z"/>
            </svg>
            References
          </span>
        \`);
      }
      
      if (subfolders.scripts) {
        metaItems.push(\`
          <span class="subfolder-item">
            <svg class="subfolder-icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.72 3.22a.75.75 0 011.06 1.06L2.06 8l3.72 3.72a.75.75 0 11-1.06 1.06L.47 8.53a.75.75 0 010-1.06l4.25-4.25zm6.56 0a.75.75 0 10-1.06 1.06L13.94 8l-3.72 3.72a.75.75 0 101.06 1.06l4.25-4.25a.75.75 0 000-1.06l-4.25-4.25z"/>
            </svg>
            Scripts
          </span>
        \`);
      }
      
      if (subfolders.assets) {
        metaItems.push(\`
          <span class="subfolder-item">
            <svg class="subfolder-icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.75 2.5a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h.94a.5.5 0 01.5.5c0 .28.22.5.5.5h6.5a.5.5 0 00.5-.5.5.5 0 01.5-.5h.94a.25.25 0 00.25-.25v-10.5a.25.25 0 00-.25-.25H1.75zM0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75zm4.5 2a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-2 1.5a2 2 0 114 0 2 2 0 01-4 0zm9.75 5.5H3.75v-.75c0-.69.56-1.25 1.25-1.25h5c.69 0 1.25.56 1.25 1.25v.75z"/>
            </svg>
            Assets
          </span>
        \`);
      }

      card.innerHTML = \`
        <div class="skill-card-header">
          <div class="skill-card-title">\${skill.name}</div>
          <span class="category-badge">\${categoryName}</span>
        </div>
        <div class="skill-card-description">\${skill.description}</div>
        \${metaItems.length > 0 ? \`<div class="skill-card-meta">\${metaItems.join('')}</div>\` : ''}
        <div class="install-command-box">
          <code class="install-command">\${installCommand}</code>
          <svg class="copy-icon" onclick='copyInstallCommand("\${skill.name}")' viewBox="0 0 16 16" fill="currentColor" title="Copy Command">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"/>
            <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"/>
          </svg>
        </div>
        <div class="skill-card-actions">
          <button class="action-button" onclick='openInTerminal("\${skill.name}")'>
            <svg class="action-icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25H1.75zM7.25 8a.75.75 0 01-.22.53l-2.25 2.25a.75.75 0 01-1.06-1.06L5.44 8 3.72 6.28a.75.75 0 111.06-1.06l2.25 2.25c.141.14.22.331.22.53zm1.5 1.5a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z"/>
            </svg>
            Install in Cursor
          </button>
          <button class="action-button-secondary action-button" onclick='openGitHub("\${skill.path}")'>
            <svg class="action-icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            View on GitHub
          </button>
        </div>
      \`;

      return card;
    }

    function openInTerminal(skillName) {
      vscode.postMessage({ 
        command: 'openInTerminal', 
        skillName: skillName 
      });
    }

    function copyInstallCommand(skillName) {
      vscode.postMessage({ 
        command: 'copyInstallCommand', 
        skillName: skillName 
      });
    }

    function openGitHub(skillPath) {
      vscode.postMessage({ 
        command: 'openGitHub', 
        skillPath: skillPath 
      });
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

