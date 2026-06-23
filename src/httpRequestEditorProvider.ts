import * as vscode from 'vscode';
import {
  getHttpRequestBlocks,
  type HttpRequestBlock,
} from './httpRequestParser';
import { mergeRequestFormIntoFile } from './httpRequestEditorSerializer';
import { mergeAssertionsIntoBlock } from './httpRequestEditorAssertions';
import { buildHttpRequestEditorHtml } from './httpRequestEditorHtml';
import { configurePanelWebview, getExtensionUri } from './webviewUi';
import { buildHttpRequestEditorState } from './httpRequestEditorModel';
import {
  setBlockEnvInFile,
  setFileGlobalEnv,
  upsertFileVariable,
} from './httpRequestEditorFileMeta';
import {
  HTTP_REQUEST_EDITOR_VIEW_TYPE,
  type HttpRequestEditorInboundMessage,
  type HttpRequestFormData,
  type HttpRequestAssertionSummary,
} from './httpRequestEditorTypes';
import { getProjectEnvFilePath, isHttpRequestFile } from './utils';
import { EnvironmentManager } from './environmentManager';
import { curlToFormData } from './httpCurlImport';
import { createNewHttpRequest } from './httpRequestEditorCommands';

function isEditorEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('cursorToys')
    .get<boolean>('httpRequestEditor.enabled', true);
}

function isAutoSaveEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('cursorToys')
    .get<boolean>('httpRequestEditor.autoSave', true);
}

/**
 * Opens a .req file with the visual HTTP request editor when enabled.
 */
export async function openHttpRequestEditor(uri: vscode.Uri): Promise<void> {
  if (!isEditorEnabled() || !isHttpRequestFile(uri.fsPath)) {
    await vscode.window.showTextDocument(uri, { preview: false });
    return;
  }
  try {
    await vscode.commands.executeCommand(
      'vscode.openWith',
      uri,
      HTTP_REQUEST_EDITOR_VIEW_TYPE
    );
  } catch {
    await vscode.window.showTextDocument(uri, { preview: false });
  }
}

/**
 * Custom text editor for HTTP request files (Postman-style UI).
 */
export class HttpRequestEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = HTTP_REQUEST_EDITOR_VIEW_TYPE;

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    if (!isHttpRequestFile(document.uri.fsPath)) {
      await vscode.window.showTextDocument(document.uri, { preview: false });
      return;
    }

    const extensionUri = getExtensionUri();
    if (extensionUri) {
      configurePanelWebview(webviewPanel.webview, extensionUri);
    } else {
      webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [] };
    }

    const state = {
      activeBlockIndex: 0,
      dirty: false,
      saving: false,
      htmlReady: false,
    };

    const pushState = (): void => {
      const init = buildHttpRequestEditorState(
        document,
        state.activeBlockIndex,
        state.dirty
      );
      state.activeBlockIndex = init.activeBlockIndex;
      if (!state.htmlReady) {
        const ui = extensionUri
          ? { webview: webviewPanel.webview, extensionUri }
          : undefined;
        webviewPanel.webview.html = buildHttpRequestEditorHtml(JSON.stringify(init), ui);
        state.htmlReady = true;
      } else {
        void webviewPanel.webview.postMessage(init);
      }
    };

    const replaceDocument = async (nextText: string): Promise<boolean> => {
      if (nextText === document.getText()) {
        return true;
      }
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
      );
      edit.replace(document.uri, fullRange, nextText);
      state.saving = true;
      const ok = await vscode.workspace.applyEdit(edit);
      state.saving = false;
      if (ok) {
        state.dirty = false;
        await document.save();
      }
      return ok;
    };

    const applySave = async (
      form: HttpRequestFormData,
      blockIndex: number
    ): Promise<boolean> => {
      const blocks = getHttpRequestBlocks(document);
      const block = blocks[blockIndex];
      if (!block) {
        return false;
      }
      const nextText = mergeRequestFormIntoFile(document.getText(), block, form);
      return replaceDocument(nextText);
    };

    const sendBlock = async (block: HttpRequestBlock): Promise<void> => {
      await vscode.commands.executeCommand(
        'cursor-toys.sendHttpRequest',
        document.uri,
        block.startLine,
        block.endLine,
        block.kind === 'section' ? block.title : undefined
      );
    };

    pushState();

    const envSub = EnvironmentManager.getInstance().onDidChangeEnvironment(() => {
      pushState();
    });

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) {
        return;
      }
      if (state.saving) {
        return;
      }
      pushState();
    });

    webviewPanel.onDidDispose(() => {
      changeSub.dispose();
      envSub.dispose();
    });

    webviewPanel.webview.onDidReceiveMessage(
      async (raw: HttpRequestEditorInboundMessage) => {
        const blocks = getHttpRequestBlocks(document);
        const blockIndex =
          'blockIndex' in raw && typeof raw.blockIndex === 'number'
            ? raw.blockIndex
            : state.activeBlockIndex;

        switch (raw.command) {
          case 'ready':
            if (!state.htmlReady) {
              pushState();
            }
            break;
          case 'change':
            state.dirty = true;
            state.activeBlockIndex = blockIndex;
            break;
          case 'selectBlock': {
            if (state.dirty && !isAutoSaveEnabled()) {
              const pick = await vscode.window.showWarningMessage(
                'Discard unsaved changes to this request block?',
                'Discard',
                'Cancel'
              );
              if (pick !== 'Discard') {
                pushState();
                return;
              }
            }
            state.activeBlockIndex = blockIndex;
            state.dirty = false;
            pushState();
            break;
          }
          case 'save': {
            if (!('form' in raw)) {
              break;
            }
            const silent = raw.silent === true;
            const ok = await applySave(raw.form, blockIndex);
            if (ok) {
              if (!silent) {
                void vscode.window.showInformationMessage('HTTP request saved.');
              }
              pushState();
            } else if (!silent) {
              void vscode.window.showErrorMessage('Failed to save HTTP request.');
            }
            break;
          }
          case 'send': {
            if (!('form' in raw)) {
              break;
            }
            const ok = await applySave(raw.form, blockIndex);
            if (!ok) {
              void vscode.window.showErrorMessage(
                'Save the request before sending.'
              );
              return;
            }
            const freshBlocks = getHttpRequestBlocks(document);
            const block = freshBlocks[blockIndex];
            if (block) {
              await sendBlock(block);
            }
            break;
          }
          case 'copyCurl': {
            const block = blocks[blockIndex];
            if (block) {
              await vscode.commands.executeCommand(
                'cursor-toys.copyCurlCommand',
                document.uri,
                block.startLine,
                block.endLine
              );
            }
            break;
          }
          case 'openAsText': {
            await vscode.commands.executeCommand(
              'vscode.openWith',
              document.uri,
              'default',
              vscode.ViewColumn.Active
            );
            break;
          }
          case 'setProjectEnv': {
            const envManager = EnvironmentManager.getInstance();
            envManager.setActiveEnvironment(raw.envName);
            envManager.clearCache();
            pushState();
            break;
          }
          case 'selectEnvironment': {
            await vscode.commands.executeCommand('cursor-toys.selectEnvironment');
            pushState();
            break;
          }
          case 'createEnvironment': {
            const wf = vscode.workspace.getWorkspaceFolder(document.uri);
            if (wf) {
              const name = await vscode.window.showInputBox({
                prompt: 'New environment name (creates .env.{name} at project root)',
                validateInput: (v) =>
                  /^\w+$/.test(v.trim()) ? null : 'Use letters, numbers, underscore',
              });
              if (name?.trim()) {
                await EnvironmentManager.getInstance().createEnvironment(
                  name.trim(),
                  wf.uri.fsPath
                );
                EnvironmentManager.getInstance().setActiveEnvironment(name.trim());
                pushState();
              }
            }
            break;
          }
          case 'addFileVar': {
            const next = upsertFileVariable(
              document.getText(),
              raw.key,
              raw.value
            );
            await replaceDocument(next);
            pushState();
            break;
          }
          case 'updateFileVar': {
            let next = document.getText();
            if (
              raw.originalKey.toLowerCase() !== raw.key.toLowerCase()
            ) {
              next = upsertFileVariable(next, raw.originalKey, null);
            }
            next = upsertFileVariable(next, raw.key, raw.value);
            await replaceDocument(next);
            pushState();
            break;
          }
          case 'removeFileVar': {
            const next = upsertFileVariable(document.getText(), raw.key, null);
            await replaceDocument(next);
            pushState();
            break;
          }
          case 'openProjectEnvFile': {
            const wf = vscode.workspace.getWorkspaceFolder(document.uri);
            if (wf?.uri.fsPath && raw.envName) {
              const envPath = getProjectEnvFilePath(
                wf.uri.fsPath,
                raw.envName
              );
              try {
                await vscode.window.showTextDocument(
                  vscode.Uri.file(envPath),
                  { preview: false }
                );
              } catch {
                void vscode.window.showErrorMessage(
                  `Could not open environment file: ${envPath}`
                );
              }
            }
            break;
          }
          case 'setBlockEnv': {
            const block = blocks[raw.blockIndex];
            if (block?.kind === 'section') {
              const next = setBlockEnvInFile(
                document.getText(),
                block.startLine,
                raw.envName
              );
              await replaceDocument(next);
              pushState();
            } else if (raw.envName) {
              const next = setFileGlobalEnv(document.getText(), raw.envName);
              await replaceDocument(next);
              pushState();
            }
            break;
          }
          case 'saveAssertions': {
            const block = blocks[raw.blockIndex];
            if (!block) {
              break;
            }
            const next = mergeAssertionsIntoBlock(
              document.getText(),
              block,
              raw.assertions
            );
            const ok = await replaceDocument(next);
            if (ok) {
              if (raw.silent !== true) {
                void vscode.window.showInformationMessage('Tests saved.');
              }
              pushState();
            } else if (raw.silent !== true) {
              void vscode.window.showErrorMessage('Failed to save tests.');
            }
            break;
          }
          case 'importCurl': {
            const form = curlToFormData(raw.text);
            if (!form) {
              void vscode.window.showErrorMessage(
                'Could not parse cURL command. Check the format and try again.'
              );
              break;
            }
            state.activeBlockIndex = blockIndex;
            void webviewPanel.webview.postMessage({
              type: 'curlImported',
              form,
              blockIndex,
            });
            void vscode.window.showInformationMessage('Imported request from cURL.');
            break;
          }
          case 'newRequest': {
            const wf = vscode.workspace.getWorkspaceFolder(document.uri);
            await createNewHttpRequest(wf?.uri.fsPath);
            break;
          }
          default:
            break;
        }
      }
    );
  }
}
