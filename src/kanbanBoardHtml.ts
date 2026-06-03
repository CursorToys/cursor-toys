import { KanbanBoardState } from './kanbanBoardTypes';

const CARD_HEIGHT_PX = 168;

/**
 * Builds HTML for the Kanban board webview.
 */
export function buildKanbanBoardHtml(state: KanbanBoardState): string {
  const stateJson = JSON.stringify(state).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kanban Board</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      height: 100%;
      margin: 0;
    }
    body {
      display: flex;
      flex-direction: column;
      padding: 12px 16px 16px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      overflow: hidden;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }
    .toolbar h1 {
      margin: 0;
      font-size: 1.1em;
      font-weight: 600;
      flex: 1;
      min-width: 120px;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      border-radius: 2px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button:hover { opacity: 0.9; }
    .board {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      height: 100%;
    }
    @media (max-width: 960px) {
      .board { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 560px) {
      .board { grid-template-columns: 1fr; }
    }
    .column {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .column-header {
      padding: 10px 12px;
      font-weight: 600;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }
    .column-count {
      font-size: 0.85em;
      opacity: 0.8;
      font-weight: normal;
    }
    .column-body {
      padding: 8px;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }
    .column-body.drag-over {
      outline: 2px dashed var(--vscode-focusBorder);
      outline-offset: -2px;
    }
    .card {
      background: var(--vscode-editor-background);
      border: 1px solid #ffffff;
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 8px;
      cursor: grab;
      height: ${CARD_HEIGHT_PX}px;
      min-height: ${CARD_HEIGHT_PX}px;
      max-height: ${CARD_HEIGHT_PX}px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .card:active { cursor: grabbing; }
    .card-title {
      font-weight: 600;
      margin-bottom: 4px;
      word-break: break-word;
      flex-shrink: 0;
      line-height: 1.25;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .card-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 6px;
      flex-shrink: 0;
      min-height: 0;
      max-height: 44px;
      overflow: hidden;
    }
    .card-tags:empty { display: none; }
    .tag {
      display: inline-block;
      font-size: 0.72em;
      line-height: 1.2;
      padding: 2px 8px;
      border-radius: 10px;
      color: #ffffff;
      white-space: nowrap;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card-preview {
      font-size: 0.85em;
      opacity: 0.85;
      margin-bottom: 6px;
      white-space: pre-wrap;
      word-break: break-word;
      flex: 1;
      min-height: 0;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .card-preview:empty { display: none; }
    .card-actions {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      flex-shrink: 0;
      margin-top: auto;
    }
    .card-actions button {
      padding: 2px 8px;
      font-size: 0.8em;
    }
    .empty {
      padding: 12px;
      text-align: center;
      opacity: 0.6;
      font-size: 0.9em;
    }
    .error-banner {
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-inputValidation-errorForeground);
      padding: 8px 12px;
      margin-bottom: 12px;
      border-radius: 4px;
      display: none;
      flex-shrink: 0;
    }
    dialog {
      border: 1px solid var(--vscode-widget-border);
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      padding: 16px;
      border-radius: 4px;
      max-width: 480px;
      width: 90%;
    }
    dialog label {
      display: block;
      margin: 8px 0 4px;
      font-size: 0.9em;
    }
    dialog input, dialog textarea {
      width: 100%;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 6px 8px;
      font-family: inherit;
    }
    dialog textarea { min-height: 80px; resize: vertical; }
    .dialog-actions {
      margin-top: 12px;
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .tag-row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }
    .tag-row input[type="text"] { flex: 1; }
    .tag-row input[type="color"] {
      width: 40px;
      height: 32px;
      padding: 2px;
      cursor: pointer;
    }
    .tag-row button {
      padding: 4px 8px;
    }
    #edit-tags { margin-top: 4px; }
    #view-dialog { max-width: 560px; }
    .view-body {
      margin: 12px 0;
      padding: 12px;
      max-height: min(60vh, 420px);
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
      background: var(--vscode-textBlockQuote-background, var(--vscode-sideBar-background));
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      font-size: 0.95em;
      line-height: 1.45;
    }
    .view-body:empty { display: none; }
    #view-title { margin: 0 0 8px; word-break: break-word; }
    #confirm-delete-text { margin: 0 0 12px; line-height: 1.4; }
    .card-actions button[data-action="expand"] {
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div id="error" class="error-banner"></div>
  <div class="toolbar">
    <h1>Kanban Board</h1>
    <button type="button" id="btn-add">Add card</button>
    <button type="button" class="secondary" id="btn-refresh">Refresh</button>
  </div>
  <div class="board" id="board"></div>

  <dialog id="create-dialog">
    <form method="dialog" id="create-form">
      <h3>New card</h3>
      <label for="create-title">Title</label>
      <input id="create-title" required />
      <label for="create-description">Description</label>
      <textarea id="create-description"></textarea>
      <div class="dialog-actions">
        <button type="button" class="secondary" id="create-cancel">Cancel</button>
        <button type="submit">Create</button>
      </div>
    </form>
  </dialog>

  <dialog id="view-dialog">
    <h3 id="view-title"></h3>
    <div id="view-tags" class="card-tags"></div>
    <div id="view-description" class="view-body"></div>
    <div class="dialog-actions">
      <button type="button" id="view-copy">Copy</button>
      <button type="button" id="view-chat">Send to chat</button>
      <button type="button" id="view-edit">Edit</button>
      <button type="button" id="view-open">Open file</button>
      <button type="button" class="secondary" id="view-delete">Delete</button>
      <button type="button" class="secondary" id="view-close">Close</button>
    </div>
  </dialog>

  <dialog id="confirm-delete-dialog">
    <p id="confirm-delete-text"></p>
    <div class="dialog-actions">
      <button type="button" class="secondary" id="confirm-delete-cancel">Cancel</button>
      <button type="button" id="confirm-delete-yes">Delete</button>
    </div>
  </dialog>

  <dialog id="edit-dialog">
    <form method="dialog" id="edit-form">
      <h3 id="edit-heading">Edit card</h3>
      <label for="edit-title">Title</label>
      <input id="edit-title" required />
      <label for="edit-description">Description</label>
      <textarea id="edit-description"></textarea>
      <label>Tags</label>
      <div id="edit-tags"></div>
      <button type="button" class="secondary" id="btn-add-tag">Add tag</button>
      <div class="dialog-actions">
        <button type="button" class="secondary" id="edit-cancel">Cancel</button>
        <button type="submit">Save</button>
      </div>
    </form>
  </dialog>

  <script>
    const vscode = acquireVsCodeApi();
    const DEFAULT_TAG_COLOR = '#3794ff';
    const COLUMNS = [
      { id: 'backlog', label: 'Backlog' },
      { id: 'todo', label: 'Todo' },
      { id: 'doing', label: 'Doing' },
      { id: 'done', label: 'Done' }
    ];
    let state = ${stateJson};
    let draggingPath = null;
    let editingPath = null;
    let viewingCard = null;
    let pendingDeletePath = null;

    function post(type, payload) {
      vscode.postMessage({ type, ...(payload || {}) });
    }

    function bindCardAction(cardEl, selector, handler) {
      const btn = cardEl.querySelector(selector);
      if (!btn) return;
      btn.addEventListener('mousedown', function(e) { e.stopPropagation(); });
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        handler(e);
      });
    }

    function findCardByPath(filePath) {
      for (const col of COLUMNS) {
        const cards = (state.columns && state.columns[col.id]) || [];
        for (const c of cards) {
          if (c.filePath === filePath) return c;
        }
      }
      return null;
    }

    function openConfirmDelete(card) {
      pendingDeletePath = card.filePath;
      document.getElementById('confirm-delete-text').textContent =
        'Delete card "' + card.title + '"? This cannot be undone.';
      document.getElementById('confirm-delete-dialog').showModal();
    }

    function openViewCard(card) {
      viewingCard = card;
      document.getElementById('view-title').textContent = card.title;
      const tagsEl = document.getElementById('view-tags');
      const tagsHtml = renderTagsHtml(card.tags);
      tagsEl.innerHTML = tagsHtml || '';
      tagsEl.style.display = tagsHtml ? 'flex' : 'none';
      const descEl = document.getElementById('view-description');
      const desc = (card.description || '').trim();
      descEl.textContent = desc;
      descEl.style.display = desc ? 'block' : 'none';
      document.getElementById('view-dialog').showModal();
    }

    function showError(msg) {
      const el = document.getElementById('error');
      if (!msg) {
        el.style.display = 'none';
        el.textContent = '';
        return;
      }
      el.style.display = 'block';
      el.textContent = msg;
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function tagColor(tag) {
      return (tag && tag.color) ? tag.color : DEFAULT_TAG_COLOR;
    }

    function renderTagsHtml(tags) {
      if (!tags || !tags.length) return '';
      return tags.map(function(tag) {
        const bg = tagColor(tag);
        return '<span class="tag" style="background:' + escapeHtml(bg) + '">' +
          escapeHtml(tag.name) + '</span>';
      }).join('');
    }

    function render() {
      const board = document.getElementById('board');
      board.innerHTML = '';
      for (const col of COLUMNS) {
        const cards = (state.columns && state.columns[col.id]) || [];
        const total = (state.columnTotals && state.columnTotals[col.id]) || cards.length;
        const countLabel = total > cards.length ? cards.length + '/' + total : String(cards.length);
        const colEl = document.createElement('div');
        colEl.className = 'column';
        colEl.innerHTML =
          '<div class="column-header">' + escapeHtml(col.label) +
          ' <span class="column-count">' + countLabel + '</span></div>';
        const body = document.createElement('div');
        body.className = 'column-body';
        body.dataset.status = col.id;
        body.addEventListener('dragover', onDragOver);
        body.addEventListener('dragleave', onDragLeave);
        body.addEventListener('drop', onDrop);
        if (cards.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'empty';
          empty.textContent = 'No cards';
          body.appendChild(empty);
        } else {
          for (const card of cards) {
            body.appendChild(renderCard(card));
          }
        }
        colEl.appendChild(body);
        board.appendChild(colEl);
      }
    }

    function renderCard(card) {
      const el = document.createElement('div');
      el.className = 'card';
      el.draggable = true;
      el.dataset.path = card.filePath;
      el.addEventListener('dragstart', (e) => {
        draggingPath = card.filePath;
        e.dataTransfer.setData('text/plain', card.filePath);
        e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', () => { draggingPath = null; });

      const tagsHtml = renderTagsHtml(card.tags);
      const tagsBlock = tagsHtml
        ? '<div class="card-tags">' + tagsHtml + '</div>'
        : '<div class="card-tags"></div>';
      const preview = card.descriptionPreview
        ? '<div class="card-preview">' + escapeHtml(card.descriptionPreview) + '</div>'
        : '<div class="card-preview"></div>';

      const expandBtn = card.canExpand
        ? '<button type="button" data-action="expand">Expand</button>'
        : '';

      el.innerHTML =
        '<div class="card-title">' + escapeHtml(card.title) + '</div>' +
        tagsBlock +
        preview +
        '<div class="card-actions">' +
        expandBtn +
        '<button type="button" data-action="copy">Copy</button>' +
        '<button type="button" data-action="chat">Send to chat</button>' +
        '<button type="button" data-action="edit">Edit</button>' +
        '<button type="button" data-action="open">Open</button>' +
        '<button type="button" class="secondary" data-action="delete">Delete</button>' +
        '</div>';

      if (card.canExpand) {
        bindCardAction(el, '[data-action="expand"]', function() { openViewCard(card); });
      }
      bindCardAction(el, '[data-action="copy"]', function() {
        post('copyCardContent', { filePath: card.filePath });
      });
      bindCardAction(el, '[data-action="chat"]', function() {
        post('sendCardToChat', { filePath: card.filePath });
      });
      bindCardAction(el, '[data-action="edit"]', function() { openEdit(card); });
      bindCardAction(el, '[data-action="open"]', function() {
        post('openCard', { filePath: card.filePath });
      });
      bindCardAction(el, '[data-action="delete"]', function() { openConfirmDelete(card); });

      return el;
    }

    function onDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      e.currentTarget.classList.add('drag-over');
    }

    function onDragLeave(e) {
      e.currentTarget.classList.remove('drag-over');
    }

    function onDrop(e) {
      e.preventDefault();
      e.currentTarget.classList.remove('drag-over');
      const status = e.currentTarget.dataset.status;
      const filePath = e.dataTransfer.getData('text/plain') || draggingPath;
      if (filePath && status) {
        post('moveCard', { filePath, status });
      }
    }

    function addTagRow(name, color) {
      const container = document.getElementById('edit-tags');
      const row = document.createElement('div');
      row.className = 'tag-row';
      row.innerHTML =
        '<input type="text" class="tag-name" placeholder="Tag name" value="' + escapeHtml(name || '') + '" />' +
        '<input type="color" class="tag-color" value="' + escapeHtml(color || DEFAULT_TAG_COLOR) + '" />' +
        '<button type="button" class="secondary tag-remove">Remove</button>';
      row.querySelector('.tag-remove').addEventListener('click', () => row.remove());
      container.appendChild(row);
    }

    function setTagsEditor(tags) {
      const container = document.getElementById('edit-tags');
      container.innerHTML = '';
      if (tags && tags.length) {
        for (const tag of tags) {
          addTagRow(tag.name, tagColor(tag));
        }
      }
    }

    function collectTagsFromEditor() {
      const rows = document.querySelectorAll('#edit-tags .tag-row');
      const tags = [];
      rows.forEach(function(row) {
        const name = row.querySelector('.tag-name').value.trim();
        const color = row.querySelector('.tag-color').value;
        if (name) {
          tags.push({ name: name, color: color });
        }
      });
      return tags;
    }

    function openEdit(card) {
      editingPath = card.filePath;
      document.getElementById('edit-heading').textContent = 'Edit card';
      document.getElementById('edit-title').value = card.title;
      document.getElementById('edit-description').value = card.description || '';
      setTagsEditor(card.tags || []);
      document.getElementById('edit-dialog').showModal();
    }

    document.getElementById('btn-add').addEventListener('click', () => {
      document.getElementById('create-title').value = '';
      document.getElementById('create-description').value = '';
      document.getElementById('create-dialog').showModal();
      document.getElementById('create-title').focus();
    });

    document.getElementById('create-cancel').addEventListener('click', () => {
      document.getElementById('create-dialog').close();
    });

    document.getElementById('create-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('create-title').value.trim();
      if (title) {
        const description = document.getElementById('create-description').value;
        post('createCard', { title: title, description: description });
        document.getElementById('create-dialog').close();
      }
    });

    document.getElementById('view-close').addEventListener('click', () => {
      document.getElementById('view-dialog').close();
      viewingCard = null;
    });

    document.getElementById('view-edit').addEventListener('click', () => {
      if (!viewingCard) return;
      document.getElementById('view-dialog').close();
      openEdit(viewingCard);
      viewingCard = null;
    });

    document.getElementById('view-copy').addEventListener('click', () => {
      if (!viewingCard) return;
      post('copyCardContent', { filePath: viewingCard.filePath });
    });

    document.getElementById('view-chat').addEventListener('click', () => {
      if (!viewingCard) return;
      post('sendCardToChat', { filePath: viewingCard.filePath });
    });

    document.getElementById('view-open').addEventListener('click', () => {
      if (!viewingCard) return;
      post('openCard', { filePath: viewingCard.filePath });
    });

    document.getElementById('view-delete').addEventListener('click', () => {
      if (!viewingCard) return;
      const card = viewingCard;
      document.getElementById('view-dialog').close();
      viewingCard = null;
      openConfirmDelete(card);
    });

    document.getElementById('confirm-delete-cancel').addEventListener('click', () => {
      document.getElementById('confirm-delete-dialog').close();
      pendingDeletePath = null;
    });

    document.getElementById('confirm-delete-yes').addEventListener('click', () => {
      if (pendingDeletePath) {
        post('deleteCard', { filePath: pendingDeletePath });
      }
      document.getElementById('confirm-delete-dialog').close();
      pendingDeletePath = null;
      viewingCard = null;
    });

    document.getElementById('btn-refresh').addEventListener('click', () => post('refresh', {}));

    document.getElementById('btn-add-tag').addEventListener('click', () => addTagRow('', DEFAULT_TAG_COLOR));

    document.getElementById('edit-cancel').addEventListener('click', () => {
      document.getElementById('edit-dialog').close();
      editingPath = null;
    });

    document.getElementById('edit-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!editingPath) return;
      post('updateCard', {
        filePath: editingPath,
        title: document.getElementById('edit-title').value.trim(),
        description: document.getElementById('edit-description').value,
        tags: collectTagsFromEditor()
      });
      document.getElementById('edit-dialog').close();
      editingPath = null;
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'init') {
        state = msg.state;
        showError('');
        render();
      }
      if (msg.type === 'error') {
        showError(msg.message);
      }
    });

    post('ready', {});
    render();
  </script>
</body>
</html>`;
}
