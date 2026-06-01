import type { HttpRequestBlock } from './httpRequestParser';

/** Editable HTTP request fields shown in the visual editor. */
export interface HttpRequestFormData {
  method: string;
  url: string;
  headers: Array<{ key: string; value: string }>;
  body: string;
}

/** Block summary for tag picker in the webview. */
export interface HttpRequestBlockSummary {
  index: number;
  label: string;
  kind: HttpRequestBlock['kind'];
  startLine: number;
  endLine: number;
  sectionTitle?: string;
  method: string;
  url: string;
  methodClass: string;
  envName?: string;
  assertionCount: number;
}

export interface HttpRequestEnvVariableSummary {
  key: string;
  value: string;
  masked: boolean;
}

export interface HttpRequestVariableBinding {
  name: string;
  placeholder: string;
  source: 'file' | 'env' | 'unresolved';
  value: string | null;
  masked: boolean;
}

export interface HttpRequestResolvedPreview {
  effectiveEnv: string;
  envSource: 'block' | 'file' | 'workspace';
  resolvedUrl: string;
  bindings: HttpRequestVariableBinding[];
}

export interface HttpRequestAssertionSummary {
  description: string;
  expression: string;
  operator: string;
  expected: string;
  raw: string;
}

/** Payload pushed from extension → webview on load / refresh. */
export interface HttpRequestEditorInitMessage {
  type: 'init';
  fileName: string;
  filePath: string;
  blocks: HttpRequestBlockSummary[];
  activeBlockIndex: number;
  form: HttpRequestFormData;
  autoSave: boolean;
  dirty: boolean;
  projectEnvs: string[];
  activeProjectEnv: string;
  globalFileEnv?: string;
  blockEnv?: string;
  envVariables: HttpRequestEnvVariableSummary[];
  fileVariables: Array<{ key: string; value: string }>;
  assertions: HttpRequestAssertionSummary[];
  resolvedPreview: HttpRequestResolvedPreview;
  assertOperators: string[];
  assertExpressions: string[];
  helperSuggestions: Array<{
    insert: string;
    label: string;
    description: string;
    kind: 'helper';
  }>;
}

/** Messages webview → extension. */
export type HttpRequestEditorInboundMessage =
  | { command: 'ready' }
  | { command: 'change'; form: HttpRequestFormData; blockIndex: number }
  | { command: 'selectBlock'; blockIndex: number }
  | { command: 'save'; form: HttpRequestFormData; blockIndex: number; silent?: boolean }
  | { command: 'send'; form: HttpRequestFormData; blockIndex: number }
  | { command: 'copyCurl'; blockIndex: number }
  | { command: 'openAsText' }
  | { command: 'setProjectEnv'; envName: string }
  | { command: 'addFileVar'; key: string; value: string }
  | { command: 'updateFileVar'; originalKey: string; key: string; value: string }
  | { command: 'removeFileVar'; key: string }
  | { command: 'openProjectEnvFile'; envName: string }
  | { command: 'setBlockEnv'; blockIndex: number; envName: string | null }
  | { command: 'selectEnvironment' }
  | { command: 'createEnvironment' }
  | { command: 'saveAssertions'; blockIndex: number; assertions: HttpRequestAssertionSummary[]; silent?: boolean };

export const HTTP_REQUEST_EDITOR_VIEW_TYPE = 'cursorToys.httpRequest';
