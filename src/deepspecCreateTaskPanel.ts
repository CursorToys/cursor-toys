import * as vscode from 'vscode';
import {
  buildCreateTaskChatMessage,
  DEEPSPEC_SPEC_TYPES,
  DeepSpecType,
  slugifyDeepspecTaskName,
} from './deepspecChatPrompts';
import { getDeepspecRootUri, isMultiRootWorkspace } from './deepspecPaths';
import { sendDeepspecToChat } from './deepspecSendToChat';

interface CreateTaskFormPayload {
  specType: DeepSpecType;
  taskTitle: string;
  description: string;
}

/**
 * Webview form to compose a new DeepSpec spec and send it to chat (paste-and-submit inject).
 */
export class DeepspecCreateTaskPanel {
  private static currentPanel: DeepspecCreateTaskPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(private readonly panel: vscode.WebviewPanel) {
    panel.onDidDispose(() => this.dispose(), null, this.disposables);
    panel.webview.html = this.getHtml();
    panel.webview.onDidReceiveMessage(
      async (message: { command?: string; specType?: string; taskTitle?: string; description?: string }) => {
        if (message.command === 'cancel') {
          this.panel.dispose();
          return;
        }
        if (message.command === 'send') {
          await this.handleSend({
            specType: (message.specType as DeepSpecType) || 'feature',
            taskTitle: message.taskTitle || '',
            description: message.description || '',
          });
        }
      },
      null,
      this.disposables
    );
  }

  static createOrShow(): void {
    if (DeepspecCreateTaskPanel.currentPanel) {
      DeepspecCreateTaskPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'cursorToys.deepspec.createTask',
      'New DeepSpec',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true }
    );
    DeepspecCreateTaskPanel.currentPanel = new DeepspecCreateTaskPanel(panel);
  }

  private async handleSend(form: CreateTaskFormPayload): Promise<void> {
    const title = form.taskTitle.trim();
    if (!title) {
      void vscode.window.showWarningMessage('Enter a task title.');
      return;
    }
    const slug = slugifyDeepspecTaskName(title);
    if (!slug) {
      void vscode.window.showWarningMessage('Task title must contain letters or numbers.');
      return;
    }
    const validType = DEEPSPEC_SPEC_TYPES.some((t) => t.id === form.specType);
    const specType = validType ? form.specType : 'feature';

    let workspaceFolderUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (isMultiRootWorkspace()) {
      const picked = await vscode.window.showWorkspaceFolderPick({
        placeHolder: 'Select workspace folder for the new DeepSpec draft',
      });
      if (!picked) {
        return;
      }
      workspaceFolderUri = picked.uri;
    }
    if (!workspaceFolderUri) {
      void vscode.window.showErrorMessage('Open a workspace folder to create a DeepSpec task.');
      return;
    }

    const message = buildCreateTaskChatMessage(
      specType,
      slug,
      form.description,
      workspaceFolderUri.fsPath,
      getDeepspecRootUri(workspaceFolderUri)
    );
    const sent = await sendDeepspecToChat(message);
    if (sent) {
      void vscode.window.showInformationMessage(`Sent to chat: Create task ${slug}`);
      this.panel.dispose();
    }
  }

  private dispose(): void {
    DeepspecCreateTaskPanel.currentPanel = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  private getHtml(): string {
    const typeOptions = DEEPSPEC_SPEC_TYPES.map(
      (t) => `<option value="${t.id}">${t.label}</option>`
    ).join('');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      margin: 0;
    }
    h2 { font-size: 1.1em; font-weight: 600; margin: 0 0 12px; }
    label { display: block; margin: 12px 0 4px; font-size: 0.9em; opacity: 0.9; }
    select, input, textarea {
      width: 100%;
      box-sizing: border-box;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      padding: 8px;
      font-family: inherit;
      font-size: inherit;
    }
    textarea { min-height: 120px; resize: vertical; }
    .actions { margin-top: 16px; display: flex; gap: 8px; }
    button {
      flex: 1;
      padding: 8px 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
    }
    button.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    button.primary:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .hint { font-size: 0.85em; opacity: 0.75; margin-top: 8px; line-height: 1.4; }
  </style>
</head>
<body>
  <h2>New spec</h2>
  <p class="hint">Creates a draft via the DeepSpec skill. Send injects into Cursor chat (paste and submit).</p>
  <label for="specType">Type</label>
  <select id="specType">${typeOptions}</select>
  <label for="taskTitle">Task title</label>
  <input id="taskTitle" type="text" placeholder="e.g. Fix login timeout" />
  <label for="description">Description</label>
  <textarea id="description" placeholder="Goal, acceptance criteria, context…"></textarea>
  <div class="actions">
    <button class="secondary" id="cancelBtn">Cancel</button>
    <button class="primary" id="sendBtn">Send to chat</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('sendBtn').addEventListener('click', () => {
      vscode.postMessage({
        command: 'send',
        specType: document.getElementById('specType').value,
        taskTitle: document.getElementById('taskTitle').value,
        description: document.getElementById('description').value,
      });
    });
    document.getElementById('cancelBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'cancel' });
    });
  </script>
</body>
</html>`;
  }
}
