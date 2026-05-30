import * as vscode from 'vscode';
import * as path from 'path';
import { parseHttpRequest } from './httpRequestParse';
import { serializeRestClientRequest } from './httpRequestEditorSerializer';
import type { HttpRequestFormData } from './httpRequestEditorTypes';
import { openHttpRequestEditor } from './httpRequestEditorProvider';
import { getHttpPath, sanitizeFileName } from './utils';

const BLANK_FORM: HttpRequestFormData = {
  method: 'GET',
  url: 'https://example.com',
  headers: [{ key: 'Accept', value: 'application/json' }],
  body: '',
};

/**
 * Creates a new .req file under the workspace HTTP folder and opens the visual editor.
 */
export async function createNewHttpRequest(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    void vscode.window.showErrorMessage('Open a workspace folder to create HTTP requests.');
    return;
  }

  const mode = await vscode.window.showQuickPick(
    [
      { label: 'Blank request', description: 'Start with a template', id: 'blank' as const },
      { label: 'Paste cURL', description: 'Import from clipboard or paste', id: 'curl' as const },
      { label: 'Paste raw HTTP', description: 'REST Client or raw request text', id: 'http' as const },
    ],
    { placeHolder: 'How do you want to create the request?' }
  );
  if (!mode) {
    return;
  }

  let form: HttpRequestFormData = { ...BLANK_FORM, headers: [...BLANK_FORM.headers] };

  if (mode.id === 'curl' || mode.id === 'http') {
    const pasted = await vscode.window.showInputBox({
      prompt:
        mode.id === 'curl'
          ? 'Paste a cURL command'
          : 'Paste raw HTTP (method line, headers, body)',
      ignoreFocusOut: true,
      validateInput: (v) => (v.trim() ? null : 'Paste request content'),
    });
    if (!pasted?.trim()) {
      return;
    }
    const parsed = parseHttpRequest(pasted.trim());
    if (!parsed) {
      void vscode.window.showErrorMessage('Could not parse the pasted request.');
      return;
    }
    form = {
      method: (parsed.method ?? 'GET').toUpperCase(),
      url: parsed.url,
      headers: Object.entries(parsed.headers ?? {}).map(([key, value]) => ({
        key,
        value,
      })),
      body:
        typeof parsed.body === 'string'
          ? parsed.body
          : parsed.body
            ? JSON.stringify(parsed.body, null, 2)
            : '',
    };
  }

  const defaultName = 'new-request';
  const nameInput = await vscode.window.showInputBox({
    prompt: 'File name (without extension)',
    value: defaultName,
    validateInput: (v) => {
      const s = sanitizeFileName(v.trim() || defaultName);
      return s ? null : 'Enter a valid file name';
    },
  });
  if (nameInput === undefined) {
    return;
  }

  const baseName = sanitizeFileName(nameInput.trim() || defaultName);
  const title = baseName.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const httpDir = getHttpPath(workspaceFolder.uri.fsPath);
  const filePath = path.join(httpDir, `${baseName}.req`);
  const uri = vscode.Uri.file(filePath);

  try {
    await vscode.workspace.fs.stat(uri);
    const overwrite = await vscode.window.showWarningMessage(
      `File ${baseName}.req already exists. Overwrite?`,
      'Overwrite',
      'Cancel'
    );
    if (overwrite !== 'Overwrite') {
      return;
    }
  } catch {
    // file does not exist
  }

  try {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(httpDir));
  } catch {
    // may exist
  }

  const content = buildNewRequestFileContent(title, form);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  await openHttpRequestEditor(uri);
  void vscode.window.showInformationMessage(`Created ${baseName}.req`);
}

function buildNewRequestFileContent(title: string, form: HttpRequestFormData): string {
  const request = serializeRestClientRequest(form);
  return `# @env dev

## ${title}
${request}

###
`;
}
