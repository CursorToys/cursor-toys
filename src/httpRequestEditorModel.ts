import * as vscode from 'vscode';
import { extractAssertions } from './assertionParser';
import { getEnvironmentForSection } from './httpRequestExecutor';
import {
  formFromFileBlock,
  extractRequestTextFromBlock,
} from './httpRequestEditorSerializer';
import { parseHttpRequest } from './httpRequestParse';
import {
  getHttpRequestBlocks,
  getHttpRequestBlockLabel,
  type HttpRequestBlock,
} from './httpRequestParser';
import {
  parseFileGlobalEnv,
  parseFileHeaderVariables,
} from './httpRequestEditorFileMeta';
import { EnvironmentManager } from './environmentManager';
import { buildVariablePreview } from './httpRequestEditorResolve';
import {
  ASSERT_EXPRESSIONS,
  ASSERT_OPERATORS,
} from './httpRequestEditorAssertMeta';
import { HTTP_VARIABLE_HELPERS } from './httpRequestEditorHelpers';
import type {
  HttpRequestEditorInitMessage,
  HttpRequestBlockSummary,
  HttpRequestFormData,
  HttpRequestAssertionSummary,
  HttpRequestEnvVariableSummary,
} from './httpRequestEditorTypes';

function methodBadgeClass(method: string): string {
  const m = method.toUpperCase();
  if (m === 'GET') return 'method-get';
  if (m === 'POST') return 'method-post';
  if (m === 'PUT' || m === 'PATCH') return 'method-put';
  if (m === 'DELETE') return 'method-delete';
  return 'method-other';
}

function blockMethodUrl(
  document: vscode.TextDocument,
  block: HttpRequestBlock
): { method: string; url: string } {
  const lines = document.getText().split('\n');
  const requestText = extractRequestTextFromBlock(lines, block);
  if (!requestText) {
    return { method: 'GET', url: '' };
  }
  const config = parseHttpRequest(requestText);
  return {
    method: (config?.method ?? 'GET').toUpperCase(),
    url: config?.url ?? '',
  };
}

function assertionsForBlock(
  document: vscode.TextDocument,
  block: HttpRequestBlock
): HttpRequestAssertionSummary[] {
  const chunk: string[] = [];
  for (let i = block.startLine; i <= block.endLine && i < document.lineCount; i++) {
    chunk.push(document.lineAt(i).text);
  }
  const assertions = extractAssertions(chunk.join('\n'));
  return assertions.map((a) => ({
    description: a.description || a.expression,
    expression: a.expression,
    operator: a.operator,
    expected:
      a.expected !== undefined && a.expected !== null ? String(a.expected) : '',
    raw: a.raw ?? '',
  }));
}

function buildBlockSummaries(
  document: vscode.TextDocument,
  blocks: HttpRequestBlock[]
): HttpRequestBlockSummary[] {
  return blocks.map((block, index) => {
    const { method, url } = blockMethodUrl(document, block);
    const resolvedEnv =
      getEnvironmentForSection(document, block.startLine) ??
      block.envName ??
      null;
    return {
      index,
      label: getHttpRequestBlockLabel(block, document),
      kind: block.kind,
      startLine: block.startLine,
      endLine: block.endLine,
      sectionTitle: block.kind === 'section' ? block.title : undefined,
      method,
      url,
      methodClass: methodBadgeClass(method),
      envName: resolvedEnv ?? undefined,
      assertionCount: assertionsForBlock(document, block).length,
    };
  });
}

/**
 * Builds the full webview init payload for the HTTP request editor.
 */
export function buildHttpRequestEditorState(
  document: vscode.TextDocument,
  activeBlockIndex: number,
  dirty: boolean
): HttpRequestEditorInitMessage {
  const text = document.getText();
  const lines = text.split('\n');
  const blocks = getHttpRequestBlocks(document);
  const safeIndex =
    activeBlockIndex >= 0 && activeBlockIndex < blocks.length
      ? activeBlockIndex
      : 0;
  const block = blocks[safeIndex];
  const form: HttpRequestFormData = formFromFileBlock(text, block);

  const workspacePath =
    vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ?? '';
  const envManager = EnvironmentManager.getInstance();
  const projectEnvs = workspacePath
    ? envManager.getAvailableEnvironments(workspacePath)
    : [];
  const managerActiveEnv = envManager.getActiveEnvironment();
  const activeProjectEnv = resolveActiveProjectEnv(projectEnvs, managerActiveEnv);
  const globalFileEnv = parseFileGlobalEnv(lines);
  const blockEnv =
    getEnvironmentForSection(document, block.startLine) ?? globalFileEnv;

  const envVars: HttpRequestEnvVariableSummary[] = [];
  const sectionEnv = getEnvironmentForSection(document, block.startLine);
  const effectiveEnvForLoad = sectionEnv || activeProjectEnv || undefined;
  if (workspacePath && effectiveEnvForLoad) {
    const loaded = envManager.loadEnvironment(effectiveEnvForLoad, workspacePath);
    if (loaded) {
      for (const [key, value] of loaded.entries()) {
        envVars.push({
          key,
          value,
          masked: isSecretKey(key),
        });
      }
      envVars.sort((a, b) => a.key.localeCompare(b.key));
    }
  }

  const headerVars = parseFileHeaderVariables(lines);
  const fileVariables = headerVars.map((v) => ({ key: v.key, value: v.value }));

  const config = vscode.workspace.getConfiguration('cursorToys');

  const resolvedPreview = buildVariablePreview(
    form,
    document,
    block.startLine,
    workspacePath,
    activeProjectEnv
  );

  return {
    type: 'init',
    fileName: document.uri.path.split('/').pop() ?? 'request',
    filePath: document.uri.fsPath,
    blocks: buildBlockSummaries(document, blocks),
    activeBlockIndex: safeIndex,
    form,
    autoSave: config.get<boolean>('httpRequestEditor.autoSave', true),
    dirty,
    projectEnvs,
    activeProjectEnv,
    globalFileEnv: globalFileEnv ?? undefined,
    blockEnv: blockEnv ?? undefined,
    envVariables: envVars,
    fileVariables,
    assertions: assertionsForBlock(document, block),
    resolvedPreview,
    assertOperators: [...ASSERT_OPERATORS],
    assertExpressions: [...ASSERT_EXPRESSIONS],
    helperSuggestions: [...HTTP_VARIABLE_HELPERS],
  };
}

/** Returns workspace active env only when it matches a real project-root .env file. */
function resolveActiveProjectEnv(
  projectEnvs: string[],
  managerActive: string
): string {
  if (projectEnvs.length === 0) {
    return '';
  }
  return projectEnvs.includes(managerActive) ? managerActive : '';
}

function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.includes('token') ||
    lower.includes('secret') ||
    lower.includes('password') ||
    lower.includes('api_key') ||
    lower.includes('apikey')
  );
}
