/**
 * MCP tool schemas only — no vscode imports (used by stdio subprocess).
 */
import { z } from 'zod';
import { CURSOR_PET_MCP_TOOL_DEFINITIONS } from './cursorPetMcpCatalog';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}

const confirmSchema = { confirm: z.boolean().optional().describe('Required true for destructive ops') };

const PROJECT_ASSET_TYPES = ['commands', 'rules', 'prompts', 'skills'] as const;
const PERSONAL_ASSET_TYPES = ['commands', 'prompts', 'skills', 'plans', 'hooks'] as const;

function buildAssetToolDefinitions(): ToolDefinition[] {
  const confirm = { confirm: z.boolean().optional() };
  const common = {
    filePath: z.string().optional(),
    name: z.string().optional(),
    isPersonal: z.boolean().optional(),
  };
  const defs: ToolDefinition[] = [];
  for (const type of PROJECT_ASSET_TYPES) {
    defs.push(
      { name: `${type}_list`, description: `List project ${type}`, inputSchema: { isPersonal: z.boolean().optional() } },
      { name: `${type}_read`, description: `Read ${type} asset`, inputSchema: common },
      {
        name: `${type}_create`,
        description: `Create ${type} asset`,
        inputSchema: {
          name: z.string(),
          content: z.string().optional(),
          isPersonal: z.boolean().optional(),
        },
      },
      { name: `${type}_update`, description: `Update ${type} asset`, inputSchema: { ...common, content: z.string() } },
      { name: `${type}_rename`, description: `Rename ${type} asset`, inputSchema: { ...common, newName: z.string() } },
      { name: `${type}_delete`, description: `Delete ${type} asset`, inputSchema: { ...common, ...confirm } },
      { name: `${type}_generate_deeplink`, description: `Generate deeplink for ${type}`, inputSchema: common },
      { name: `${type}_share`, description: `Share ${type} as CursorToys link`, inputSchema: common }
    );
  }
  return defs;
}

function buildPersonalToolDefinitions(): ToolDefinition[] {
  const confirm = { confirm: z.boolean().optional() };
  const common = { filePath: z.string().optional(), name: z.string().optional() };
  const defs: ToolDefinition[] = [
    {
      name: 'personal_save_from_selection',
      description: 'Save editor selection or text as personal command/prompt/skill',
      inputSchema: {
        type: z.enum(['commands', 'prompts', 'skills', 'plans', 'hooks']).optional(),
        name: z.string().optional(),
        text: z.string().optional(),
      },
    },
  ];
  for (const type of PERSONAL_ASSET_TYPES) {
    defs.push(
      { name: `personal_${type}_list`, description: `List personal ${type}`, inputSchema: {} },
      { name: `personal_${type}_read`, description: `Read personal ${type}`, inputSchema: common },
      {
        name: `personal_${type}_create`,
        description: `Create personal ${type}`,
        inputSchema: { name: z.string(), content: z.string().optional() },
      },
      {
        name: `personal_${type}_update`,
        description: `Update personal ${type}`,
        inputSchema: { ...common, content: z.string() },
      },
      {
        name: `personal_${type}_rename`,
        description: `Rename personal ${type}`,
        inputSchema: { ...common, newName: z.string() },
      },
      {
        name: `personal_${type}_delete`,
        description: `Delete personal ${type}`,
        inputSchema: { ...common, ...confirm },
      },
      { name: `personal_${type}_share`, description: `Share personal ${type}`, inputSchema: common },
      {
        name: `personal_${type}_generate_deeplink`,
        description: `Generate deeplink for personal ${type}`,
        inputSchema: common,
      }
    );
  }
  return defs;
}

function buildHooksToolDefinitions(): ToolDefinition[] {
  const confirm = { confirm: z.boolean().optional() };
  const personal = { isPersonal: z.boolean().optional() };
  const scriptPath = { filePath: z.string(), ...personal };
  return [
    { name: 'hooks_list', description: 'List hooks.json and scripts', inputSchema: personal },
    { name: 'hooks_read', description: 'Read hooks.json', inputSchema: personal },
    { name: 'hooks_create', description: 'Create default hooks.json', inputSchema: personal },
    { name: 'hooks_validate', description: 'Validate hooks.json schema', inputSchema: personal },
    {
      name: 'hooks_update',
      description: 'Update hooks.json content',
      inputSchema: { ...personal, content: z.union([z.string(), z.record(z.unknown())]) },
    },
    { name: 'hooks_delete', description: 'Delete hooks.json', inputSchema: { ...personal, ...confirm } },
    { name: 'hooks_share', description: 'Share hooks as CursorToys link', inputSchema: personal },
    { name: 'hooks_share_gist', description: 'Share hooks via GitHub Gist', inputSchema: personal },
    { name: 'hook_script_read', description: 'Read hook script file', inputSchema: scriptPath },
    {
      name: 'hook_script_create',
      description: 'Create hook script',
      inputSchema: { name: z.string(), content: z.string().optional(), ...personal },
    },
    {
      name: 'hook_script_update',
      description: 'Update hook script',
      inputSchema: { ...scriptPath, content: z.string() },
    },
    { name: 'hook_script_delete', description: 'Delete hook script', inputSchema: { ...scriptPath, ...confirm } },
    { name: 'hook_script_share', description: 'Read hook script for sharing', inputSchema: scriptPath },
    { name: 'hooks_clear', description: 'Clear all hook registrations in hooks.json', inputSchema: { ...personal, ...confirm } },
    { name: 'hook_script_spawn_placeholders', description: 'Create missing default hook script stubs', inputSchema: personal },
    {
      name: 'hook_script_set_enabled',
      description: 'Enable or disable a hook script in hooks.json',
      inputSchema: { name: z.string().optional(), filePath: z.string().optional(), enabled: z.boolean().optional(), ...personal },
    },
  ];
}

function buildPlansToolDefinitions(): ToolDefinition[] {
  const confirm = { confirm: z.boolean().optional() };
  const common = {
    filePath: z.string().optional(),
    name: z.string().optional(),
    isPersonal: z.boolean().optional(),
  };
  return [
    { name: 'plan_list', description: 'List cursor plans', inputSchema: { isPersonal: z.boolean().optional() } },
    { name: 'plan_read', description: 'Read plan file', inputSchema: common },
    {
      name: 'plan_create',
      description: 'Create plan',
      inputSchema: { title: z.string(), content: z.string().optional(), isPersonal: z.boolean().optional() },
    },
    { name: 'plan_update', description: 'Update plan', inputSchema: { ...common, content: z.string() } },
    { name: 'plan_rename', description: 'Rename plan', inputSchema: { ...common, newTitle: z.string() } },
    { name: 'plan_delete', description: 'Delete plan', inputSchema: { ...common, ...confirm } },
    { name: 'plan_share', description: 'Share plan as CursorToys link', inputSchema: common },
    {
      name: 'plan_share_folder',
      description: 'Share plans folder',
      inputSchema: { isPersonal: z.boolean().optional() },
    },
  ];
}

function buildShareToolDefinitions(): ToolDefinition[] {
  return [
    { name: 'import_shareable', description: 'Import CursorToys shareable URL', inputSchema: { url: z.string() } },
    { name: 'import_from_gist', description: 'Import from GitHub Gist', inputSchema: { gistUrl: z.string() } },
    { name: 'export_project_bundle', description: 'Export workspace as CursorToys project bundle', inputSchema: {} },
    {
      name: 'generate_tree',
      description: 'Generate directory tree text',
      inputSchema: {
        path: z.string().optional(),
        maxDepth: z.number().optional(),
        maxFiles: z.number().optional(),
      },
    },
    { name: 'share_via_gist', description: 'Share file via GitHub Gist', inputSchema: { filePath: z.string() } },
    {
      name: 'share_folder_via_gist',
      description: 'Share folder via Gist bundle',
      inputSchema: {
        folderPath: z.string(),
        bundleType: z
          .enum(['command', 'rule', 'prompt', 'notepad', 'http', 'project', 'plan', 'skill'])
          .optional(),
      },
    },
    {
      name: 'configure_github_token',
      description: 'Set GitHub token for Gist (write-only)',
      inputSchema: { token: z.string() },
    },
    { name: 'remove_github_token', description: 'Remove stored GitHub token', inputSchema: {} },
    {
      name: 'chat_generate_tree_and_send',
      description: 'Generate workspace tree and send to chat',
      inputSchema: { prompt: z.string().optional() },
    },
  ];
}

function buildChatToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'chat_send',
      description: 'Send text to Cursor chat',
      inputSchema: { text: z.string(), prompt: z.string().optional() },
    },
    {
      name: 'chat_send_selection',
      description: 'Send selection or text to chat',
      inputSchema: { text: z.string().optional(), prompt: z.string().optional() },
    },
    {
      name: 'chat_open_with_prompt',
      description: 'Open chat composer with prompt',
      inputSchema: { prompt: z.string() },
    },
    {
      name: 'chat_copy_as_prompt_link',
      description: 'Build prompt deeplink from text or selection',
      inputSchema: { text: z.string().optional() },
    },
    {
      name: 'chat_inject',
      description: 'Inject text into chat composer (optional auto-submit)',
      inputSchema: { text: z.string(), submit: z.boolean().optional() },
    },
  ];
}

function buildClipboardToolDefinitions(): ToolDefinition[] {
  const confirm = { confirm: z.boolean().optional() };
  return [
    { name: 'clipboard_history_list', description: 'List clipboard ring buffer (preview truncated)', inputSchema: {} },
    {
      name: 'clipboard_history_get',
      description: 'Get clipboard entry by index',
      inputSchema: {
        index: z.number(),
        includeFullContent: z.boolean().optional(),
      },
    },
    { name: 'clipboard_history_clear', description: 'Clear clipboard history', inputSchema: confirm },
    { name: 'clipboard_slot_list', description: 'List named clipboard slots', inputSchema: {} },
    { name: 'clipboard_slot_get', description: 'Get clipboard slot content', inputSchema: { slotId: z.string() } },
    {
      name: 'clipboard_slot_assign',
      description: 'Assign text to clipboard slot',
      inputSchema: { slotId: z.string(), text: z.string(), label: z.string().optional() },
    },
    {
      name: 'clipboard_slot_rename',
      description: 'Rename clipboard slot label',
      inputSchema: { slotId: z.string(), label: z.string() },
    },
    { name: 'clipboard_slot_clear', description: 'Clear clipboard slot', inputSchema: { slotId: z.string() } },
  ];
}

function buildRefineToolDefinitions(): ToolDefinition[] {
  return [
    { name: 'minify_file', description: 'Minify a file in workspace', inputSchema: { filePath: z.string() } },
    {
      name: 'minify_text',
      description: 'Minify text content',
      inputSchema: { text: z.string(), fileType: z.string().optional() },
    },
    { name: 'trim_clipboard', description: 'Trim and minify clipboard', inputSchema: {} },
    {
      name: 'refine_text',
      description: 'Refine text via Gemini',
      inputSchema: { text: z.string(), prompt: z.string().optional() },
    },
    {
      name: 'refine_and_send_to_chat',
      description: 'Refine text and send to chat',
      inputSchema: { text: z.string(), prompt: z.string().optional() },
    },
    {
      name: 'process_with_prompt',
      description: 'Process text with custom Gemini prompt',
      inputSchema: { text: z.string(), prompt: z.string() },
    },
    {
      name: 'configure_gemini_key',
      description: 'Set Gemini API key (write-only)',
      inputSchema: { apiKey: z.string() },
    },
    { name: 'remove_gemini_key', description: 'Remove Gemini API key', inputSchema: {} },
  ];
}

function buildRecommendationsToolDefinitions(): ToolDefinition[] {
  const confirm = { confirm: z.boolean().optional() };
  return [
    { name: 'recommendations_check', description: 'Check recommendations/skills registry for project', inputSchema: {} },
    { name: 'recommendations_browse', description: 'Browse skills registry data', inputSchema: {} },
    { name: 'recommendations_refresh', description: 'Refresh recommendations cache', inputSchema: {} },
    { name: 'mcpb_list', description: 'List installed MCPB packages', inputSchema: {} },
    { name: 'mcpb_install', description: 'Install MCPB from .mcpb file path', inputSchema: { filePath: z.string().optional() } },
    { name: 'mcpb_uninstall', description: 'Uninstall MCPB package', inputSchema: { serverId: z.string(), ...confirm } },
    { name: 'mcpb_reveal', description: 'Get MCPB package install path', inputSchema: { serverId: z.string() } },
  ];
}

function buildUsageToolDefinitions(): ToolDefinition[] {
  return [
    { name: 'spending_get', description: 'Get Cursor spending snapshot (no token)', inputSchema: {} },
    { name: 'spending_refresh', description: 'Refresh Cursor spending data', inputSchema: {} },
    { name: 'usage_monitor_get', description: 'Get OpenRouter/DeepInfra usage snapshot', inputSchema: {} },
    { name: 'usage_monitor_refresh', description: 'Refresh usage monitor data', inputSchema: {} },
    {
      name: 'configure_openrouter_key',
      description: 'Set OpenRouter API key (write-only)',
      inputSchema: { apiKey: z.string() },
    },
    {
      name: 'configure_deepinfra_key',
      description: 'Set DeepInfra API key (write-only)',
      inputSchema: { apiKey: z.string() },
    },
    { name: 'remove_openrouter_key', description: 'Remove OpenRouter API key', inputSchema: {} },
    { name: 'remove_deepinfra_key', description: 'Remove DeepInfra API key', inputSchema: {} },
  ];
}

function buildSettingsToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'settings_get',
      description: 'Get effective CursorToys setting value',
      inputSchema: { key: z.string() },
    },
    {
      name: 'settings_set',
      description: 'Set CursorToys setting',
      inputSchema: { key: z.string(), value: z.unknown(), global: z.boolean().optional() },
    },
    { name: 'settings_list', description: 'List all CursorToys settings keys', inputSchema: {} },
    { name: 'settings_configure_keys', description: 'Open API keys configuration wizard', inputSchema: {} },
  ];
}

function buildAgentsToolDefinitions(): ToolDefinition[] {
  const confirm = { confirm: z.boolean().optional() };
  const common = { filePath: z.string().optional(), name: z.string().optional() };
  return [
    { name: 'agents_list', description: 'List personal subagents (~/.cursor/agents/)', inputSchema: {} },
    { name: 'agents_read', description: 'Read personal subagent file', inputSchema: common },
    { name: 'agents_create', description: 'Create personal subagent', inputSchema: { name: z.string(), content: z.string().optional() } },
    { name: 'agents_update', description: 'Update personal subagent', inputSchema: { ...common, content: z.string() } },
    { name: 'agents_rename', description: 'Rename personal subagent', inputSchema: { ...common, newName: z.string() } },
    { name: 'agents_delete', description: 'Delete personal subagent', inputSchema: { ...common, ...confirm } },
    { name: 'agents_share', description: 'Share personal subagent as CursorToys link', inputSchema: common },
    { name: 'agents_generate_deeplink', description: 'Generate deeplink for personal subagent', inputSchema: common },
  ];
}

function buildSyncToolDefinitions(): ToolDefinition[] {
  const syncCommon = {
    category: z.enum(['rules', 'skills', 'commands', 'prompts', 'agents', 'hooks']),
    name: z.string(),
    workspacePath: z.string().optional(),
    dryRun: z.boolean().optional(),
    confirm: z.boolean().optional(),
  };
  return [
    {
      name: 'sync_asset_to_workspace',
      description: 'Copy personal global asset to workspace with backup on overwrite',
      inputSchema: syncCommon,
    },
    {
      name: 'sync_asset_to_global',
      description: 'Copy workspace asset to personal global with backup on overwrite',
      inputSchema: syncCommon,
    },
  ];
}

function buildDeepspecToolDefinitions(): ToolDefinition[] {
  const confirm = { confirm: z.boolean().optional() };
  return [
    { name: 'deepspec_list_tasks', description: 'List DeepSpec tasks in drafts/active/archive', inputSchema: {} },
    {
      name: 'deepspec_read_task',
      description: 'Read A-B-C files for a DeepSpec task',
      inputSchema: {
        name: z.string(),
        stage: z.enum(['drafts', 'active', 'archive']).optional(),
      },
    },
    {
      name: 'deepspec_create_task',
      description: 'Create new DeepSpec draft task',
      inputSchema: { name: z.string(), title: z.string().optional(), summary: z.string().optional() },
    },
    { name: 'deepspec_approve', description: 'Move draft to active', inputSchema: { name: z.string() } },
    { name: 'deepspec_complete', description: 'Archive completed task from active', inputSchema: { name: z.string() } },
    {
      name: 'deepspec_discard',
      description: 'Archive draft without implementing',
      inputSchema: { name: z.string(), reason: z.string().optional(), ...confirm },
    },
  ];
}

export const MCP_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'cursortoys_list_commands',
    description: 'List all cursor-toys.* extension commands (use filter to search)',
    inputSchema: { filter: z.string().optional() },
  },
  {
    name: 'cursortoys_execute',
    description: 'Execute any cursor-toys.* command by ID (dispatcher fallback)',
    inputSchema: {
      commandId: z.string().describe('Command ID e.g. cursor-toys.createKanbanCard'),
      args: z.union([z.array(z.unknown()), z.record(z.unknown())]).optional(),
    },
  },
  {
    name: 'mcp_install_skill',
    description: 'Install cursor-toys-mcp agent skill (tools, resources, prompts guide)',
    inputSchema: {
      installPersonal: z.boolean().optional().describe('true = ~/.cursor/skills, false = project skills'),
    },
  },
  {
    name: 'kanban_list',
    description: 'List kanban cards by status or all',
    inputSchema: {
      status: z.enum(['backlog', 'todo', 'doing', 'done', 'all']).optional(),
      isPersonal: z.boolean().optional(),
    },
  },
  {
    name: 'kanban_read',
    description: 'Read a kanban card by path or title',
    inputSchema: {
      filePath: z.string().optional(),
      title: z.string().optional(),
      isPersonal: z.boolean().optional(),
    },
  },
  {
    name: 'kanban_create',
    description: 'Create a kanban card',
    inputSchema: {
      title: z.string(),
      status: z.enum(['backlog', 'todo', 'doing', 'done']).optional(),
      description: z.string().optional(),
      tags: z.array(z.object({ name: z.string(), color: z.string().optional() })).optional(),
      order: z.number().optional(),
      isPersonal: z.boolean().optional(),
    },
  },
  {
    name: 'kanban_update',
    description: 'Update kanban card fields',
    inputSchema: {
      filePath: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.object({ name: z.string(), color: z.string().optional() })).optional(),
      order: z.number().optional(),
    },
  },
  {
    name: 'kanban_move',
    description: 'Move kanban card to another column',
    inputSchema: {
      filePath: z.string().optional(),
      title: z.string().optional(),
      status: z.enum(['backlog', 'todo', 'doing', 'done']),
    },
  },
  {
    name: 'kanban_rename',
    description: 'Rename kanban card file',
    inputSchema: {
      filePath: z.string().optional(),
      title: z.string().optional(),
      newTitle: z.string(),
    },
  },
  {
    name: 'kanban_delete',
    description: 'Delete a kanban card',
    inputSchema: { filePath: z.string().optional(), title: z.string().optional(), ...confirmSchema },
  },
  {
    name: 'kanban_search',
    description: 'Search kanban cards by title, tag, or content',
    inputSchema: { query: z.string(), isPersonal: z.boolean().optional() },
  },
  {
    name: 'kanban_share',
    description: 'Get shareable text for a kanban card',
    inputSchema: { filePath: z.string().optional(), title: z.string().optional() },
  },
  {
    name: 'notepad_list',
    description: 'List all notepads',
    inputSchema: { isPersonal: z.boolean().optional() },
  },
  {
    name: 'notepad_read',
    description: 'Read notepad content',
    inputSchema: { filePath: z.string().optional(), name: z.string().optional(), isPersonal: z.boolean().optional() },
  },
  {
    name: 'notepad_create',
    description: 'Create a notepad',
    inputSchema: { title: z.string(), body: z.string().optional(), isPersonal: z.boolean().optional() },
  },
  {
    name: 'notepad_update',
    description: 'Update notepad content',
    inputSchema: { filePath: z.string().optional(), name: z.string().optional(), content: z.string() },
  },
  {
    name: 'notepad_rename',
    description: 'Rename a notepad',
    inputSchema: { filePath: z.string().optional(), name: z.string().optional(), newTitle: z.string() },
  },
  {
    name: 'notepad_delete',
    description: 'Delete a notepad',
    inputSchema: { filePath: z.string().optional(), name: z.string().optional(), ...confirmSchema },
  },
  {
    name: 'notepad_share',
    description: 'Generate CursorToys shareable link for notepad',
    inputSchema: { filePath: z.string().optional(), name: z.string().optional() },
  },
  {
    name: 'http_list',
    description: 'List HTTP request files in workspace',
    inputSchema: {},
  },
  {
    name: 'http_read',
    description: 'Read HTTP request file',
    inputSchema: { filePath: z.string() },
  },
  {
    name: 'http_create',
    description: 'Create HTTP request file',
    inputSchema: {
      name: z.string().optional(),
      method: z.string().optional(),
      url: z.string().optional(),
      body: z.string().optional(),
    },
  },
  {
    name: 'http_update',
    description: 'Update HTTP request file content',
    inputSchema: { filePath: z.string(), content: z.string() },
  },
  {
    name: 'http_delete',
    description: 'Delete HTTP request file',
    inputSchema: { filePath: z.string(), ...confirmSchema },
  },
  {
    name: 'http_run',
    description: 'Execute HTTP request and return response file content',
    inputSchema: { filePath: z.string() },
  },
  {
    name: 'http_run_tests_file',
    description: 'Run HTTP tests for a single file via cursortoys CLI',
    inputSchema: { filePath: z.string() },
  },
  {
    name: 'http_run_tests_folder',
    description: 'Run HTTP tests for a folder',
    inputSchema: { folderRelativePath: z.string() },
  },
  {
    name: 'http_run_tests_all',
    description: 'Run full HTTP test suite',
    inputSchema: {},
  },
  {
    name: 'http_to_curl',
    description: 'Copy HTTP request as cURL to clipboard',
    inputSchema: { filePath: z.string() },
  },
  {
    name: 'http_list_envs',
    description: 'List project .env environments (keys only for secrets)',
    inputSchema: {},
  },
  {
    name: 'http_get_env',
    description: 'Get environment variables (secrets redacted)',
    inputSchema: { name: z.string().optional() },
  },
  {
    name: 'anchor_list',
    description: 'List all code anchors in workspace',
    inputSchema: {},
  },
  {
    name: 'anchor_add',
    description: 'Add code anchor at file line (0-based)',
    inputSchema: { filePath: z.string(), line: z.number() },
  },
  {
    name: 'anchor_remove',
    description: 'Remove code anchor',
    inputSchema: { filePath: z.string(), line: z.number() },
  },
  {
    name: 'anchor_clear',
    description: 'Clear all code anchors',
    inputSchema: { ...confirmSchema },
  },
  {
    name: 'anchor_list_file',
    description: 'List anchors in a file',
    inputSchema: { filePath: z.string() },
  },
  {
    name: 'anchor_toggle',
    description: 'Toggle anchor at line',
    inputSchema: { filePath: z.string(), line: z.number() },
  },
  {
    name: 'anchor_clear_file',
    description: 'Clear anchors in a file',
    inputSchema: { filePath: z.string() },
  },
  {
    name: 'anchor_next',
    description: 'Next anchor location (file or workspace)',
    inputSchema: {
      filePath: z.string().optional(),
      line: z.number().optional(),
      workspace: z.boolean().optional(),
    },
  },
  {
    name: 'anchor_prev',
    description: 'Previous anchor location',
    inputSchema: {
      filePath: z.string().optional(),
      line: z.number().optional(),
      workspace: z.boolean().optional(),
    },
  },
  {
    name: 'anchor_goto',
    description: 'Get anchor context (optional openInEditor)',
    inputSchema: {
      filePath: z.string(),
      line: z.number(),
      openInEditor: z.boolean().optional(),
    },
  },
  {
    name: 'inline_annotation_list',
    description: 'List inline comment markers grouped by tag (todo, fix, note, etc.)',
    inputSchema: {
      workspaceRoot: z.string().optional().describe('Optional workspace folder root to filter markers'),
    },
  },
  {
    name: 'inline_annotation_list_by_tag',
    description: 'List inline annotations for a single tag',
    inputSchema: {
      tag: z.string(),
      workspaceRoot: z.string().optional(),
    },
  },
  {
    name: 'inline_annotation_list_file',
    description: 'List inline annotations in a source file',
    inputSchema: { filePath: z.string() },
  },
  {
    name: 'inline_annotation_refresh',
    description: 'Rescan workspace and refresh the inline annotation index',
    inputSchema: {},
  },
  {
    name: 'inline_annotation_next',
    description: 'Next inline annotation in workspace order',
    inputSchema: {
      filePath: z.string().optional(),
      line: z.number().optional(),
      openInEditor: z.boolean().optional(),
    },
  },
  {
    name: 'inline_annotation_prev',
    description: 'Previous inline annotation in workspace order',
    inputSchema: {
      filePath: z.string().optional(),
      line: z.number().optional(),
      openInEditor: z.boolean().optional(),
    },
  },
  {
    name: 'inline_annotation_goto',
    description: 'Navigate to an inline annotation (optional openInEditor)',
    inputSchema: {
      filePath: z.string(),
      line: z.number(),
      tag: z.string().optional(),
      openInEditor: z.boolean().optional(),
    },
  },
  {
    name: 'http_run_assertions',
    description: 'Run assertions for HTTP request file',
    inputSchema: { filePath: z.string() },
  },
  {
    name: 'http_create_env',
    description: 'Create project .env template',
    inputSchema: { name: z.string().optional(), template: z.string().optional() },
  },
  {
    name: 'http_get_active_env',
    description: 'Get active HTTP environment name',
    inputSchema: {},
  },
  {
    name: 'http_set_active_env',
    description: 'Set active HTTP environment',
    inputSchema: { name: z.string() },
  },
  {
    name: 'http_install_skill',
    description: 'Install HTTP docs skill in project',
    inputSchema: {},
  },
  ...CURSOR_PET_MCP_TOOL_DEFINITIONS,
  ...buildAssetToolDefinitions(),
  ...buildPersonalToolDefinitions(),
  ...buildHooksToolDefinitions(),
  ...buildPlansToolDefinitions(),
  ...buildShareToolDefinitions(),
  ...buildChatToolDefinitions(),
  ...buildClipboardToolDefinitions(),
  ...buildRefineToolDefinitions(),
  ...buildRecommendationsToolDefinitions(),
  ...buildUsageToolDefinitions(),
  ...buildSettingsToolDefinitions(),
  ...buildDeepspecToolDefinitions(),
  ...buildAgentsToolDefinitions(),
  ...buildSyncToolDefinitions(),
];
