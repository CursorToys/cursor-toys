import { ProjectEntry } from './types';

export interface ProjectsDashboardState {
  projects: ProjectEntry[];
  categories: string[];
}

const COLOR_STRIPE: Record<string, string> = {
  blue: '#3794ff',
  green: '#89d185',
  orange: '#ce9178',
  purple: '#b180d7',
  red: '#f14c4c',
  teal: '#4ec9b0',
  yellow: '#dcdcaa',
  gray: '#858585',
};

/**
 * Builds HTML for the Projects dashboard webview.
 */
export function buildProjectsDashboardHtml(state: ProjectsDashboardState): string {
  const stateJson = JSON.stringify(state).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Projects Dashboard</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    .toolbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 16px;
      align-items: center;
    }
    .toolbar h1 {
      margin: 0;
      font-size: 1.2em;
      flex: 1;
      min-width: 160px;
    }
    input, select, button {
      font: inherit;
      color: var(--vscode-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      padding: 6px 10px;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      cursor: pointer;
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 12px;
    }
    .card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      background: var(--vscode-editor-background);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 140px;
    }
    .stripe {
      height: 4px;
      background: var(--vscode-focusBorder);
    }
    .card-body {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
    }
    .card h2 {
      margin: 0;
      font-size: 1em;
    }
    .meta {
      opacity: 0.85;
      font-size: 0.9em;
    }
    .path {
      font-size: 0.8em;
      opacity: 0.7;
      word-break: break-all;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: auto;
    }
    .empty {
      opacity: 0.8;
      padding: 24px;
      text-align: center;
      border: 1px dashed var(--vscode-panel-border);
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <h1>Projects</h1>
    <input id="search" type="search" placeholder="Search label or path…" />
    <select id="categoryFilter">
      <option value="">All categories</option>
    </select>
    <button id="refresh" class="secondary">Refresh</button>
  </div>
  <div id="grid" class="grid"></div>
  <script>
    const vscode = acquireVsCodeApi();
    const state = ${stateJson};
    const stripeColors = ${JSON.stringify(COLOR_STRIPE)};

    const grid = document.getElementById('grid');
    const searchInput = document.getElementById('search');
    const categoryFilter = document.getElementById('categoryFilter');
    const refreshBtn = document.getElementById('refresh');

    function uniqueCategories(projects) {
      const set = new Set();
      for (const p of projects) {
        if (p.category) set.add(p.category);
      }
      return [...set].sort();
    }

    function fillCategoryFilter() {
      const current = categoryFilter.value;
      categoryFilter.innerHTML = '<option value="">All categories</option>';
      for (const cat of uniqueCategories(state.projects)) {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        categoryFilter.appendChild(opt);
      }
      categoryFilter.value = current;
    }

    function matchesFilters(project) {
      const q = (searchInput.value || '').trim().toLowerCase();
      const cat = categoryFilter.value;
      if (cat && project.category !== cat) return false;
      if (!q) return true;
      return (
        (project.label || '').toLowerCase().includes(q) ||
        (project.path || '').toLowerCase().includes(q)
      );
    }

    function render() {
      fillCategoryFilter();
      grid.innerHTML = '';
      const visible = state.projects.filter(matchesFilters);
      if (visible.length === 0) {
        grid.innerHTML = '<div class="empty">No projects match your filters. Pin a workspace from the sidebar.</div>';
        return;
      }
      for (const project of visible) {
        const card = document.createElement('article');
        card.className = 'card';
        const stripe = document.createElement('div');
        stripe.className = 'stripe';
        stripe.style.background = stripeColors[project.color] || 'var(--vscode-focusBorder)';
        const body = document.createElement('div');
        body.className = 'card-body';
        const title = document.createElement('h2');
        title.textContent = project.label;
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = [
          project.pinned ? 'Pinned' : 'Recent',
          project.category || '',
        ].filter(Boolean).join(' · ');
        const path = document.createElement('div');
        path.className = 'path';
        path.title = project.path;
        path.textContent = project.path;
        const actions = document.createElement('div');
        actions.className = 'actions';
        const openBtn = document.createElement('button');
        openBtn.textContent = 'Open';
        openBtn.addEventListener('click', () => vscode.postMessage({ type: 'open', id: project.id }));
        const pinBtn = document.createElement('button');
        pinBtn.className = 'secondary';
        pinBtn.textContent = project.pinned ? 'Unpin' : 'Pin';
        pinBtn.addEventListener('click', () => vscode.postMessage({
          type: project.pinned ? 'unpin' : 'pin',
          id: project.id,
        }));
        actions.append(openBtn, pinBtn);
        body.append(title, meta, path, actions);
        card.append(stripe, body);
        grid.appendChild(card);
      }
    }

    searchInput.addEventListener('input', render);
    categoryFilter.addEventListener('change', render);
    refreshBtn.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'state') {
        state.projects = event.data.projects || [];
        render();
      }
    });
    render();
  </script>
</body>
</html>`;
}

/**
 * Builds dashboard state from registry snapshot.
 */
export function buildProjectsDashboardState(
  pinned: readonly ProjectEntry[],
  recent: readonly ProjectEntry[]
): ProjectsDashboardState {
  const projects = [
    ...pinned.map((entry) => ({ ...entry, pinned: true })),
    ...recent.filter((recentEntry) => !pinned.some((p) => p.id === recentEntry.id)),
  ];
  const categories = [...new Set(projects.map((p) => p.category).filter(Boolean) as string[])].sort();
  return { projects, categories };
}
