import { MCP_PROMPT_DEFINITIONS } from '../promptCatalog';
import { trackMcpEvent } from '../mcpTelemetry';

export interface McpPromptMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string };
}

export interface McpPromptResult {
  description?: string;
  messages: McpPromptMessage[];
}

const PROMPT_BODIES: Record<string, (args: Record<string, string>) => string> = {
  'kanban-workflow': (args) => `You are working with the CursorToys Kanban board in this workspace.

Use MCP tools:
- kanban_list — list cards by status (backlog, todo, doing, done)
- kanban_read — read a card
- kanban_create / kanban_update / kanban_move — manage cards
- kanban_delete — requires confirm: true

${args.focus ? `Focus on: ${args.focus}` : 'Start by listing backlog and todo columns, then help the user prioritize and move cards.'}

Prefer typed Kanban tools over cursortoys_execute.`,

  'http-test-suite': (args) => `You are testing HTTP APIs using CursorToys HTTP request files.

Use MCP tools:
- http_list / http_read — discover and inspect .req files
- http_run — execute a single request
- http_run_tests_file / http_run_tests_folder / http_run_tests_all — run test suites
- http_list_envs / http_get_env — check environments (secrets are redacted)

${args.folder ? `Focus folder: ${args.folder}` : 'List HTTP files, pick a suite, run tests, and summarize pass/fail with response snippets.'}`,

  'project-inventory': () => `Inventory this project's Cursor AI assets using MCP tools:

- commands_list, rules_list, prompts_list, skills_list
- hooks_list, plan_list
- inline_annotation_list (todo/fix/note markers grouped by tag)
- personal_*_list for user libraries
- cursortoys://config resource for resolved paths

Produce a concise table: type, count, notable items. Do not read secret env values.`,

  'share-and-import': (args) => `Help share or import CursorToys assets.

Tools:
- import_shareable, import_from_gist
- {type}_share, {type}_generate_deeplink
- share_via_gist, share_folder_via_gist, export_project_bundle

${args.assetType ? `Asset type focus: ${args.assetType}` : 'Ask what the user wants to share or import, then use the matching tool.'}

Never echo API tokens from configure_* tools.`,

  'anchor-navigation': (args) => `Use code anchors for structured code review.

Tools:
- anchor_list / anchor_list_file
- anchor_next / anchor_prev / anchor_goto
- anchor_add / anchor_remove (non-destructive navigation first)

${args.filePath ? `Start from file: ${args.filePath}` : 'List all anchors, then walk through them in order with brief context per stop.'}`,

  'inline-annotation-review': (args) => `Review inline comment markers in this project (//todo, //fix, ##note, etc.).

Resources (read-only):
- cursortoys://inline-annotations — all markers grouped by tag
- cursortoys://inline-annotations/{tag} — one tag column (todo, fix, note, …)
- cursortoys://inline-annotations/file/{path} — markers in a file

Tools:
- inline_annotation_list / inline_annotation_list_by_tag / inline_annotation_list_file
- inline_annotation_next / inline_annotation_prev / inline_annotation_goto
- inline_annotation_refresh — rescan after bulk edits

UI mirrors Control Panel → Project tab → Inline annotations (annotations first, grouped by tag; commands last).

${args.tag ? `Focus tag: ${args.tag}` : 'Start with todo, then fix, then note columns.'}
${args.workspaceRoot ? `Workspace root: ${args.workspaceRoot}` : ''}`,

  'notepad-scratchpad': (args) => `Use notepads as a session scratchpad.

Tools:
- notepad_list / notepad_read
- notepad_create / notepad_update

${args.name ? `Notepad: ${args.name}` : 'Create or open a notepad to capture findings, then keep it updated as work progresses.'}`,
};

/**
 * Builds MCP prompt messages for registered prompt templates.
 */
export class McpPromptHost {
  listPrompts(): Array<{ name: string; description?: string }> {
    return MCP_PROMPT_DEFINITIONS.map((p) => ({
      name: p.name,
      description: p.description,
    }));
  }

  getPrompt(name: string, args: Record<string, string> = {}): McpPromptResult {
    trackMcpEvent('mcp_prompt_get', { name });

    const def = MCP_PROMPT_DEFINITIONS.find((p) => p.name === name);
    if (!def) {
      throw new Error(`Unknown prompt: ${name}`);
    }

    const bodyFn = PROMPT_BODIES[name];
    const text = bodyFn ? bodyFn(args) : def.description;

    return {
      description: def.description,
      messages: [{ role: 'user', content: { type: 'text', text } }],
    };
  }
}
