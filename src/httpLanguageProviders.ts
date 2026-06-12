import * as vscode from 'vscode';
import { EnvironmentManager } from './environmentManager';
import { SYSTEM_DYNAMIC_VARIABLES } from './httpDynamicVariables';
import { getEnvironmentForSection } from './httpRequestExecutor';
import {
  listVariableDefinitions,
  mergeCustomVariables,
} from './httpRequestVariables';
import { isHttpRequestFile } from './utils';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

const COMMON_HEADERS: Array<{ name: string; value: string }> = [
  { name: 'Accept', value: 'application/json' },
  { name: 'Authorization', value: 'Bearer {{TOKEN}}' },
  { name: 'Content-Type', value: 'application/json' },
  { name: 'User-Agent', value: 'CursorToys-HTTP/1.0' },
  { name: 'X-Request-ID', value: '{{$guid}}' },
];

const MIME_TYPES = [
  'application/json',
  'application/xml',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
  'text/html',
];

const PLACEHOLDER_RE = /\{\{[^}]*$/;
const CUSTOM_VAR_HOVER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/;
const DYNAMIC_VAR_HOVER_RE = /\{\{\s*\$(\w+)(?:\s+([^}]*))?\s*\}\}/;
const PROMPT_HOVER_RE = /\{\{\s*@(prompt|randomIn|datetime|uuid|randomString|userAgent|ip|lorem|randomFrom)\s*\([^)]*\)\s*\}\}/i;

function getWorkspacePath(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  return folders?.[0]?.uri.fsPath ?? null;
}

/**
 * Hover for custom, env, prompt, and system variables in HTTP files.
 */
export class HttpRequestHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    if (!isHttpRequestFile(document.uri.fsPath)) {
      return null;
    }

    const line = document.lineAt(position.line).text;
    const textBefore = line.substring(0, position.character);

    const dynamicMatch = textBefore.match(DYNAMIC_VAR_HOVER_RE);
    if (dynamicMatch) {
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**${dynamicMatch[0]}** \`[system]\`\n\n`);
      md.appendMarkdown(`Dynamic variable \`$${dynamicMatch[1]}\` resolved at send time.`);
      return new vscode.Hover(md);
    }

    const promptMatch = textBefore.match(PROMPT_HOVER_RE) ?? line.match(PROMPT_HOVER_RE);
    if (promptMatch) {
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**${promptMatch[0]}** \`[prompt]\`\n\n`);
      md.appendMarkdown('Prompted interactively when the request is sent.');
      return new vscode.Hover(md);
    }

    const range =
      document.getWordRangeAtPosition(position, CUSTOM_VAR_HOVER_RE) ??
      (() => {
        const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
        let match: RegExpExecArray | null;
        while ((match = re.exec(line)) !== null) {
          const start = match.index;
          const end = start + match[0].length;
          if (position.character >= start && position.character <= end) {
            return new vscode.Range(position.line, start, position.line, end);
          }
        }
        return null;
      })();

    if (!range) {
      return null;
    }

    const word = document.getText(range);
    const varMatch = word.match(CUSTOM_VAR_HOVER_RE);
    if (!varMatch) {
      return null;
    }

    const varName = varMatch[1];
    const defs = listVariableDefinitions(document);
    const def = defs.find((d) => d.name.toLowerCase() === varName.toLowerCase());

    if (def) {
      const md = new vscode.MarkdownString();
      const scopeLabel = def.scope === 'request' ? 'request # @var' : 'file # @var';
      md.appendMarkdown(`**${varName}** \`[${scopeLabel}]\`\n\n`);
      md.appendCodeblock(def.value, 'text');
      md.appendMarkdown(`\n\n_Line ${def.line + 1}_`);
      return new vscode.Hover(md);
    }

    const envName = getEnvironmentForSection(document, position.line);
    const workspacePath = getWorkspacePath();
    if (envName && workspacePath) {
      const envManager = EnvironmentManager.getInstance();
      const envVars = envManager.loadEnvironment(envName, workspacePath);
      const value = envVars?.get(varName.toLowerCase());
      if (value !== undefined) {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${varName}** \`[${envName}]\`\n\n`);
        md.appendCodeblock(value, 'text');
        return new vscode.Hover(md);
      }
    }

    const merged = mergeCustomVariables(document, position.line);
    const customVal = merged.get(varName);
    if (customVal !== undefined) {
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**${varName}** \`[# @var cascade]\`\n\n`);
      md.appendCodeblock(customVal, 'text');
      return new vscode.Hover(md);
    }

    const unresolved = new vscode.MarkdownString();
    unresolved.appendMarkdown(`**${varName}** \`[unresolved]\`\n\n`);
    unresolved.appendMarkdown('Define with `# @var`, add to `.env`, or use `{{$...}}` system variables.');
    return new vscode.Hover(unresolved);
  }
}

/** @deprecated Use HttpRequestHoverProvider */
export const HttpVariableHoverProvider = HttpRequestHoverProvider;

/**
 * Completion for methods, headers, MIME types, env decorator, and variables.
 */
export class HttpRequestCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    if (!isHttpRequestFile(document.uri.fsPath)) {
      return [];
    }

    const lineText = document.lineAt(position.line).text;
    const textBefore = lineText.substring(0, position.character);

    if (textBefore.match(/^#\s*@env\s*$/)) {
      return this.envDecoratorCompletions();
    }

    if (PLACEHOLDER_RE.test(textBefore) || textBefore.endsWith('{{')) {
      return this.variableCompletions(document, position.line);
    }

    if (/^\s*$/.test(textBefore) || context.triggerCharacter === undefined) {
      const trimmed = lineText.trim();
      if (trimmed === '' || HTTP_METHODS.some((m) => trimmed.startsWith(m))) {
        return this.methodCompletions(textBefore);
      }
    }

    if (/^[A-Za-z-]*$/.test(textBefore.trim()) && lineText.includes(':')) {
      const headerPrefix = textBefore.trim();
      if (headerPrefix.length >= 0 && !lineText.trim().startsWith('#')) {
        const colonIdx = lineText.indexOf(':');
        if (position.character <= colonIdx + 1) {
          return this.headerCompletions(headerPrefix);
        }
        if (lineText.trim().toLowerCase().startsWith('content-type:')) {
          return this.mimeCompletions();
        }
      }
    }

    return [];
  }

  private envDecoratorCompletions(): vscode.CompletionItem[] {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return [];
    }
    const envManager = EnvironmentManager.getInstance();
    return envManager.getAvailableEnvironments(workspacePath).map((envName) => {
      const item = new vscode.CompletionItem(envName, vscode.CompletionItemKind.Value);
      item.detail = `Environment: ${envName}`;
      item.insertText = envName;
      return item;
    });
  }

  private variableCompletions(
    document: vscode.TextDocument,
    line: number
  ): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    for (const sys of SYSTEM_DYNAMIC_VARIABLES) {
      const item = new vscode.CompletionItem(sys.name, vscode.CompletionItemKind.Variable);
      item.detail = sys.detail;
      item.insertText = sys.insert;
      item.filterText = sys.name;
      items.push(item);
    }

    const helpers = [
      '{{@prompt("Label")}}',
      '{{@uuid()}}',
      '{{@datetime}}',
      '{{@randomIn(1, 10)}}',
      '{{@randomString(8)}}',
    ];
    for (const h of helpers) {
      const item = new vscode.CompletionItem(h, vscode.CompletionItemKind.Function);
      item.detail = 'Helper expression';
      item.insertText = h.replace('{{', '').replace('}}', '');
      items.push(item);
    }

    for (const def of listVariableDefinitions(document)) {
      const item = new vscode.CompletionItem(def.name, vscode.CompletionItemKind.Variable);
      item.detail = def.scope === 'request' ? 'Request variable' : 'File variable';
      item.documentation = def.value;
      items.push(item);
    }

    const envName = getEnvironmentForSection(document, line);
    const workspacePath = getWorkspacePath();
    if (envName && workspacePath) {
      const envManager = EnvironmentManager.getInstance();
      const envVars = envManager.loadEnvironment(envName, workspacePath);
      envVars?.forEach((value, key) => {
        const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Variable);
        item.detail = `Environment: ${envName}`;
        item.documentation = value;
        items.push(item);
      });
    }

    return items;
  }

  private methodCompletions(prefix: string): vscode.CompletionItem[] {
    return HTTP_METHODS.map((method) => {
      const item = new vscode.CompletionItem(method, vscode.CompletionItemKind.Keyword);
      item.insertText = new vscode.SnippetString(`${method} {{BASE_URL}}/path`);
      item.range = new vscode.Range(0, 0, 0, prefix.length);
      return item;
    });
  }

  private headerCompletions(prefix: string): vscode.CompletionItem[] {
    return COMMON_HEADERS.map((h) => {
      const item = new vscode.CompletionItem(h.name, vscode.CompletionItemKind.Property);
      item.insertText = new vscode.SnippetString(`${h.name}: ${h.value}`);
      item.filterText = h.name;
      if (prefix) {
        item.sortText = h.name.toLowerCase().startsWith(prefix.toLowerCase()) ? '0' : '1';
      }
      return item;
    });
  }

  private mimeCompletions(): vscode.CompletionItem[] {
    return MIME_TYPES.map((mime) => {
      const item = new vscode.CompletionItem(mime, vscode.CompletionItemKind.Value);
      item.insertText = mime;
      return item;
    });
  }
}

/** @deprecated Use HttpRequestCompletionProvider */
export const HttpEnvironmentCompletionProvider = HttpRequestCompletionProvider;

/**
 * Go to definition for `# @var` custom variables.
 */
export class HttpRequestDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
    if (!isHttpRequestFile(document.uri.fsPath)) {
      return null;
    }

    const line = document.lineAt(position.line).text;
    const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (position.character < start || position.character > end) {
        continue;
      }
      const varName = match[1];
      const def = listVariableDefinitions(document).find(
        (d) => d.name.toLowerCase() === varName.toLowerCase()
      );
      if (def) {
        return new vscode.Location(
          document.uri,
          new vscode.Position(def.line, 0)
        );
      }
      return null;
    }
    return null;
  }
}

/**
 * Formats JSON/XML body regions in HTTP request files.
 */
export class HttpRequestDocumentFormattingProvider implements vscode.DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.TextEdit[]> {
    if (!isHttpRequestFile(document.uri.fsPath)) {
      return [];
    }

    const edits: vscode.TextEdit[] = [];
    const lines = document.getText().split('\n');
    let i = 0;

    while (i < lines.length) {
      const trimmed = lines[i].trim();
      const isMethod = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/i.test(trimmed);
      if (!isMethod) {
        i++;
        continue;
      }

      let bodyStart = -1;
      for (let j = i + 1; j < lines.length; j++) {
        const t = lines[j].trim();
        if (t === '' && bodyStart === -1) {
          bodyStart = j + 1;
          continue;
        }
        if (bodyStart === -1) {
          continue;
        }
        if (
          t.startsWith('###') ||
          t.startsWith('##') ||
          /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/i.test(t)
        ) {
          const bodyLines = lines.slice(bodyStart, j);
          const bodyText = bodyLines.join('\n').trim();
          if (bodyText.startsWith('{') || bodyText.startsWith('[')) {
            try {
              const formatted = JSON.stringify(JSON.parse(bodyText), null, 2);
              const range = new vscode.Range(bodyStart, 0, j, 0);
              edits.push(vscode.TextEdit.replace(range, formatted + '\n'));
            } catch {
              // keep unformatted invalid JSON
            }
          }
          i = j;
          break;
        }
        if (j === lines.length - 1 && bodyStart >= 0) {
          i = j + 1;
        }
      }
      if (bodyStart === -1) {
        i++;
      }
    }

    return edits;
  }
}
