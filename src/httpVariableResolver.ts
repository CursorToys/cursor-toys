import { replaceDynamicVariables, DynamicVariableContext } from './httpDynamicVariables';
import { mergeCustomVariables } from './httpRequestVariables';

const CUSTOM_VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export type VariableSource = 'request' | 'file' | 'env' | 'system' | 'prompt' | 'unresolved';

export interface ResolvedVariable {
  name: string;
  placeholder: string;
  source: VariableSource;
  value: string | null;
}

export interface ResolveVariablesOptions {
  content: string;
  workspacePath?: string;
  envRoot?: string;
  envName?: string | null;
  customVariables?: Map<string, string>;
  dotenvVariables?: Map<string, string>;
  /** When false, leave {{$...}} untouched (preview mode). */
  resolveDynamic?: boolean;
}

/**
 * Resolves custom {{VAR}} placeholders using request/file/env maps.
 */
export function replaceCustomVariables(
  content: string,
  variables: Map<string, string>
): string {
  return content.replace(CUSTOM_VAR_RE, (match, varName: string) => {
    if (match.includes('@') || match.includes('$')) {
      return match;
    }
    const direct = variables.get(varName);
    if (direct !== undefined) {
      return direct;
    }
    for (const [key, value] of variables.entries()) {
      if (key.toLowerCase() === varName.toLowerCase()) {
        return value;
      }
    }
    return match;
  });
}

/**
 * Builds merged custom variable map from document line context.
 */
export function buildCustomVariableMap(
  document: import('vscode').TextDocument,
  startLine?: number
): Map<string, string> {
  return mergeCustomVariables(document, startLine);
}

/**
 * Full synchronous resolution pipeline for URL/headers/body (except prompts).
 */
export function resolveHttpVariables(options: ResolveVariablesOptions): string {
  let result = options.content;
  const custom = options.customVariables ?? new Map<string, string>();

  result = replaceCustomVariables(result, custom);

  if (options.workspacePath !== undefined && options.envName) {
    const { EnvironmentManager } = require('./environmentManager') as typeof import('./environmentManager');
    const envManager = EnvironmentManager.getInstance();
    result = envManager.replaceVariables(
      result,
      options.envName,
      options.workspacePath,
      options.envRoot
    );
  }

  if (options.resolveDynamic !== false) {
    const ctx: DynamicVariableContext = {
      dotenvVariables: options.dotenvVariables,
    };
    result = replaceDynamicVariables(result, ctx);
  }

  return result;
}

/**
 * Lists unresolved custom {{VAR}} names still present after resolution.
 */
export function findUnresolvedCustomVariables(content: string): string[] {
  const unresolved: string[] = [];
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (!match[0].includes('@') && !match[0].includes('$')) {
      unresolved.push(match[1]);
    }
  }
  return unresolved;
}

/**
 * Classifies a placeholder name for hover/completion metadata.
 */
export function classifyVariable(
  varName: string,
  customVars: Map<string, string>,
  envVars: Map<string, string> | null,
  isDynamic: boolean,
  isPrompt: boolean
): VariableSource {
  if (isPrompt) {
    return 'prompt';
  }
  if (isDynamic) {
    return 'system';
  }
  if (customVars.has(varName)) {
    return customVars.get(varName) !== undefined ? 'file' : 'file';
  }
  for (const key of customVars.keys()) {
    if (key.toLowerCase() === varName.toLowerCase()) {
      return 'file';
    }
  }
  if (envVars?.has(varName.toLowerCase())) {
    return 'env';
  }
  return 'unresolved';
}
