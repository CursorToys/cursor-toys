import * as vscode from 'vscode';
import * as path from 'path';
import { serializeRestClientRequest } from './httpRequestEditorSerializer';
import type { HttpRequestFormData } from './httpRequestEditorTypes';
import { openHttpRequestEditor } from './httpRequestEditorProvider';
import { nextDateBasedHttpFileBaseName } from './httpRequestFileNaming';
import { getHttpPath, isHttpRequestFile } from './utils';

const BLANK_FORM: HttpRequestFormData = {
  method: 'GET',
  url: 'https://example.com',
  headers: [{ key: 'Accept', value: 'application/json' }],
  body: '',
};

async function listHttpRequestFileNames(httpDir: string): Promise<string[]> {
  const names: string[] = [];
  const dirUri = vscode.Uri.file(httpDir);
  try {
    await vscode.workspace.fs.stat(dirUri);
  } catch {
    return names;
  }

  const walk = async (dir: string): Promise<void> => {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
    for (const [entryName, fileType] of entries) {
      const fullPath = path.join(dir, entryName);
      if (fileType === vscode.FileType.Directory) {
        await walk(fullPath);
      } else if (isHttpRequestFile(fullPath)) {
        names.push(entryName);
      }
    }
  };

  await walk(httpDir);
  return names;
}

/**
 * Creates a new .req file under the workspace HTTP folder and opens the visual editor.
 * File name pattern: YYYY-MM-DD-XX.req (XX increments per day).
 */
export async function createNewHttpRequest(workspacePath?: string): Promise<void> {
  const resolvedWorkspace =
    workspacePath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!resolvedWorkspace) {
    void vscode.window.showErrorMessage('Open a workspace folder to create HTTP requests.');
    return;
  }

  const httpDir = getHttpPath(resolvedWorkspace);
  try {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(httpDir));
  } catch {
    // may exist
  }

  const existingNames = await listHttpRequestFileNames(httpDir);
  const baseName = nextDateBasedHttpFileBaseName(existingNames);
  const title = baseName.replace(/-/g, ' ');
  const filePath = path.join(httpDir, `${baseName}.req`);
  const uri = vscode.Uri.file(filePath);

  const content = buildNewRequestFileContent(title, BLANK_FORM);
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
