import { MCP_PROMPT_DEFINITIONS } from '../promptCatalog';
import { filterPromptsForCursorPet, isCursorPetMcpPrompt } from '../cursorPetMcpCatalog';
import { isCursorPetMcpCatalogEnabled } from '../cursorPetMcpVisibility';
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
- agents_list, hooks_list, plan_list
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

  'inline-annotation-review': (args) => `Review inline comment markers in this project (//TODO, //FIX, ##NOTE, etc.; uppercase in source).

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

  'cursor-pet-care': () => `Care for the user's Cursor Pet companion (requires cursorToys.cursorPet.enabled).

Resource:
- cursortoys://cursor-pet — current phase, vitals, incubation progress

Tools:
- cursor_pet_status — full state snapshot
- cursor_pet_select_egg — start incubation (ember, mist, moss)
- cursor_pet_feed — how to feed organically (editor code activity)
- cursor_pet_play — play with the pet (+happiness, optional weight)
- cursor_pet_clean — clean poop/mess when hygiene is needed
- cursor_pet_medicine — cure sickness when care.sick is true
- cursor_pet_discipline — stop a tantrum (+training)
- cursor_pet_lights_off — turn off lights when sleeping at night
- cursor_pet_treat — bonus happiness (overuse causes sickness)
- cursor_pet_refresh — latest view model
- cursor_pet_install_hooks — install activity bridge scripts
- cursor_pet_open — open the pet panel

Organic care:
- **Feed** (hunger): code edits, shell runs — editor only, no manual button
- **Play** (happiness): chat prompts, agent responses, MCP/subagent activity, or cursor_pet_play
- **Clean / Medicine / Discipline / Lights / Treat**: agent calls the matching cursor_pet_* MCP tool

Workflow:
1. Read cursortoys://cursor-pet
2. If phase is egg_selection or dead, suggest cursor_pet_select_egg
3. If vitals are low, suggest editor actions (edit code, chat with agent) or cursor_pet_play
4. If poop, sick, tantrum, or sleeping with lights on, run the matching care tool
5. If hooks missing, run cursor_pet_install_hooks`,

  'notepad-scratchpad': (args) => `Use notepads as a session scratchpad.

Tools:
- notepad_list / notepad_read
- notepad_create / notepad_update

${args.name ? `Notepad: ${args.name}` : 'Create or open a notepad to capture findings, then keep it updated as work progresses.'}`,

  'global-user-ai-workflow': (args) => `Manage personal Cursor AI libraries under ~/.cursor/ (global user scope).

Resources (read-only discovery):
- cursortoys://config — resolved globalCursorRoot and paths
- cursortoys://personal/{type} — index for rules, skills, commands, prompts, agents, hooks

Tools:
- rules_* / skills_* / commands_* / prompts_* with isPersonal: true (no personal_rules_* duplicate)
- agents_* — subagents in ~/.cursor/agents/ (Cursor docs: "subagents")
- hooks_*, hook_script_*, hook_script_spawn_placeholders, hook_script_set_enabled with isPersonal: true
- sync_asset_to_workspace / sync_asset_to_global — backup before overwrite; use dryRun: true first, then confirm: true

Workflow:
1. Read cursortoys://personal/{type} or agents_list
2. hooks_validate for hooks; rules_create/update supports applyMode (always, intelligent, globs, manual)
3. Mutations create timestamped backups under ~/.cursor/.backups/
4. Optional sync to/from workspace; share via *_share or share-and-import prompt

${args.focus ? `Focus category: ${args.focus}` : 'Start with cursortoys://config, then inventory personal libraries.'}`,
};

/**
 * Builds MCP prompt messages for registered prompt templates.
 */
export class McpPromptHost {
  listPrompts(): Array<{ name: string; description?: string }> {
    const defs = filterPromptsForCursorPet(MCP_PROMPT_DEFINITIONS, isCursorPetMcpCatalogEnabled());
    return defs.map((p) => ({
      name: p.name,
      description: p.description,
    }));
  }

  getPrompt(name: string, args: Record<string, string> = {}): McpPromptResult {
    trackMcpEvent('mcp_prompt_get', { name });

    if (isCursorPetMcpPrompt(name) && !isCursorPetMcpCatalogEnabled()) {
      throw new Error('Cursor Pet MCP prompts require cursorToys.cursorPet.enabled in CursorToys settings.');
    }

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
