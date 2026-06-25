/**
 * MCP resource URI catalog — no vscode imports (used by stdio subprocess).
 */

export interface McpResourceStaticDef {
  kind: 'static';
  name: string;
  uri: string;
  description: string;
  mimeType?: string;
}

export interface McpResourceTemplateDef {
  kind: 'template';
  name: string;
  uriTemplate: string;
  description: string;
  mimeType?: string;
}

export type McpResourceDef = McpResourceStaticDef | McpResourceTemplateDef;

export const MCP_RESOURCE_DEFINITIONS: McpResourceDef[] = [
  {
    kind: 'static',
    name: 'config',
    uri: 'cursortoys://config',
    description: 'Effective CursorToys configuration and resolved paths',
    mimeType: 'application/json',
  },
  {
    kind: 'static',
    name: 'anchors',
    uri: 'cursortoys://anchors',
    description: 'All code anchors in the workspace',
    mimeType: 'application/json',
  },
  {
    kind: 'static',
    name: 'inline-annotations',
    uri: 'cursortoys://inline-annotations',
    description: 'All inline comment markers (todo, fix, note, etc.) grouped by tag',
    mimeType: 'application/json',
  },
  {
    kind: 'static',
    name: 'cursor-pet',
    uri: 'cursortoys://cursor-pet',
    description: 'Cursor Pet state, vitals, and incubation progress',
    mimeType: 'application/json',
  },
  {
    kind: 'static',
    name: 'hooks',
    uri: 'cursortoys://hooks',
    description: 'hooks.json and hook scripts index',
    mimeType: 'application/json',
  },
  {
    kind: 'static',
    name: 'clipboard-history',
    uri: 'cursortoys://clipboard/history',
    description: 'Clipboard history index (previews may be truncated)',
    mimeType: 'application/json',
  },
  {
    kind: 'template',
    name: 'kanban-status',
    uriTemplate: 'cursortoys://kanban/{status}',
    description: 'Kanban cards in a column (backlog, todo, doing, done)',
    mimeType: 'application/json',
  },
  {
    kind: 'template',
    name: 'kanban-card',
    uriTemplate: 'cursortoys://kanban/card/{path}',
    description: 'Full kanban card markdown by file path',
    mimeType: 'text/markdown',
  },
  {
    kind: 'template',
    name: 'notepad',
    uriTemplate: 'cursortoys://notepad/{name}',
    description: 'Notepad content by name',
    mimeType: 'text/markdown',
  },
  {
    kind: 'template',
    name: 'http-request',
    uriTemplate: 'cursortoys://http/{path}',
    description: 'HTTP request file content (project or absolute personal path)',
    mimeType: 'text/plain',
  },
  {
    kind: 'template',
    name: 'http-personal',
    uriTemplate: 'cursortoys://http/personal/{path}',
    description: 'Personal HTTP request file under ~/.cursortoys/http or ~/.cursor/http',
    mimeType: 'text/plain',
  },
  {
    kind: 'template',
    name: 'env',
    uriTemplate: 'cursortoys://env/{name}',
    description: 'Project environment variables (secrets redacted)',
    mimeType: 'application/json',
  },
  {
    kind: 'template',
    name: 'inline-annotations-tag',
    uriTemplate: 'cursortoys://inline-annotations/{tag}',
    description: 'Inline annotations for a tag (todo, fix, note, bug, hack, warn, idea, refactor, review, test)',
    mimeType: 'application/json',
  },
  {
    kind: 'template',
    name: 'inline-annotations-file',
    uriTemplate: 'cursortoys://inline-annotations/file/{path}',
    description: 'Inline annotations in a single source file',
    mimeType: 'application/json',
  },
  {
    kind: 'template',
    name: 'anchors-file',
    uriTemplate: 'cursortoys://anchors/{file}',
    description: 'Code anchors in a single file',
    mimeType: 'application/json',
  },
  {
    kind: 'template',
    name: 'assets-index',
    uriTemplate: 'cursortoys://assets/{type}',
    description: 'Asset index for commands, rules, prompts, or skills',
    mimeType: 'application/json',
  },
  {
    kind: 'template',
    name: 'asset',
    uriTemplate: 'cursortoys://asset/{type}/{name}',
    description: 'Single project asset file',
    mimeType: 'text/markdown',
  },
  {
    kind: 'template',
    name: 'plan',
    uriTemplate: 'cursortoys://plan/{name}',
    description: 'Cursor plan file content',
    mimeType: 'text/markdown',
  },
  {
    kind: 'template',
    name: 'personal-index',
    uriTemplate: 'cursortoys://personal/{type}',
    description: 'Personal library index (rules, skills, commands, prompts, agents, hooks)',
    mimeType: 'application/json',
  },
];
