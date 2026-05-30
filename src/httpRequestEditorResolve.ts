import * as vscode from 'vscode';
import { extractFileVariables, getEnvironmentForSection } from './httpRequestExecutor';
import { EnvironmentManager } from './environmentManager';
import type {
  HttpRequestFormData,
  HttpRequestVariableBinding,
} from './httpRequestEditorTypes';

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

function replaceFilePlaceholders(text: string, fileVars: Map<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, varName) => {
    if (match.includes('@')) {
      return match;
    }
    const value = fileVars.get(varName);
    return value !== undefined ? value : match;
  });
}

/**
 * Collects {{var}} bindings and a resolved URL for the request editor preview.
 */
export function buildVariablePreview(
  form: HttpRequestFormData,
  document: vscode.TextDocument,
  blockStartLine: number,
  workspacePath: string,
  activeProjectEnv: string
): {
  effectiveEnv: string;
  envSource: 'block' | 'file' | 'workspace';
  resolvedUrl: string;
  bindings: HttpRequestVariableBinding[];
} {
  const fileVars = extractFileVariables(document, blockStartLine);
  const blockEnv = getEnvironmentForSection(document, blockStartLine);
  const globalEnv = getEnvironmentForSection(document, 0);

  let effectiveEnv = activeProjectEnv || '';
  let envSource: 'block' | 'file' | 'workspace' = 'workspace';
  if (blockEnv) {
    effectiveEnv = blockEnv;
    envSource = 'block';
  } else if (globalEnv) {
    effectiveEnv = globalEnv;
    envSource = 'file';
  } else if (!effectiveEnv) {
    envSource = 'workspace';
  }

  const envManager = EnvironmentManager.getInstance();
  const envMap =
    workspacePath && effectiveEnv
      ? envManager.loadEnvironment(effectiveEnv, workspacePath)
      : null;

  const parts = [
    form.url,
    ...form.headers.flatMap((h) => [h.key, h.value]),
    form.body,
  ];
  const combined = parts.join('\n');
  const regex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  const seen = new Set<string>();
  const bindings: HttpRequestVariableBinding[] = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(combined)) !== null) {
    const name = match[1];
    const keyLower = name.toLowerCase();
    if (seen.has(keyLower)) {
      continue;
    }
    seen.add(keyLower);

    let source: HttpRequestVariableBinding['source'] = 'unresolved';
    let value: string | null = null;

    if (fileVars.has(name)) {
      source = 'file';
      value = fileVars.get(name) ?? null;
    } else if (envMap?.has(keyLower)) {
      source = 'env';
      value = envMap.get(keyLower) ?? null;
    }

    bindings.push({
      name,
      placeholder: match[0],
      source,
      value,
      masked: value !== null && isSecretKey(name),
    });
  }

  let resolvedUrl = form.url;
  resolvedUrl = replaceFilePlaceholders(resolvedUrl, fileVars);
  if (workspacePath && effectiveEnv) {
    resolvedUrl = envManager.replaceVariables(resolvedUrl, effectiveEnv, workspacePath);
  }

  bindings.sort((a, b) => a.name.localeCompare(b.name));

  return {
    effectiveEnv,
    envSource,
    resolvedUrl,
    bindings,
  };
}
