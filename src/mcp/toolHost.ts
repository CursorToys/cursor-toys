import * as vscode from 'vscode';
import type { McpHostContext } from './types';
import { appendMcpAuditLog } from './auditLog';
import { trackMcpToolCall } from './mcpTelemetry';
import {
  checkRateLimit,
  redactSecretsDeep,
  requireConfirmForDestructive,
} from './security';
import * as kanban from './services/kanbanTools';
import * as notepad from './services/notepadTools';
import * as http from './services/httpTools';
import * as anchor from './services/anchorTools';
import * as inlineAnnotation from './services/inlineAnnotationTools';
import { cursortoysExecute, cursortoysListCommands } from './services/dispatcherTools';
import { buildAssetToolHandlers } from './services/assetsTools';
import { buildPersonalToolHandlers } from './services/personalTools';
import { buildHooksToolHandlers } from './services/hooksTools';
import { buildPlansToolHandlers } from './services/plansTools';
import { buildShareToolHandlers } from './services/shareTools';
import { buildChatToolHandlers } from './services/chatTools';
import { buildClipboardToolHandlers } from './services/clipboardTools';
import { buildRefineToolHandlers } from './services/refineTools';
import { buildRecommendationsToolHandlers } from './services/recommendationsTools';
import { buildUsageToolHandlers } from './services/usageTools';
import { buildSettingsToolHandlers } from './services/settingsTools';
import { buildDeepspecToolHandlers } from './services/deepspecTools';
import { buildMcpSkillToolHandlers } from './services/mcpSkillTools';
import { buildAgentsToolHandlers } from './services/agentsTools';
import { buildSyncToolHandlers } from './services/syncTools';

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

const STATIC_HANDLERS: Record<string, ToolHandler> = {
  ...buildAssetToolHandlers(),
  ...buildPersonalToolHandlers(),
  ...buildHooksToolHandlers(),
  ...buildPlansToolHandlers(),
  ...buildAgentsToolHandlers(),
  ...buildSyncToolHandlers(),
  ...buildChatToolHandlers(),
  ...buildClipboardToolHandlers(),
  ...buildDeepspecToolHandlers(),
  kanban_list: kanban.kanbanList,
  kanban_read: kanban.kanbanRead,
  kanban_create: kanban.kanbanCreate,
  kanban_update: kanban.kanbanUpdate,
  kanban_move: kanban.kanbanMove,
  kanban_rename: kanban.kanbanRename,
  kanban_delete: kanban.kanbanDelete,
  kanban_search: kanban.kanbanSearch,
  kanban_share: kanban.kanbanShare,
  notepad_list: notepad.notepadList,
  notepad_read: notepad.notepadRead,
  notepad_create: notepad.notepadCreate,
  notepad_update: notepad.notepadUpdate,
  notepad_rename: notepad.notepadRename,
  notepad_delete: notepad.notepadDelete,
  notepad_share: notepad.notepadShare,
  http_list: () => http.httpList(),
  http_read: http.httpRead,
  http_create: http.httpCreate,
  http_update: http.httpUpdate,
  http_delete: http.httpDelete,
  http_run: http.httpRun,
  http_run_assertions: http.httpRunAssertions,
  http_run_tests_file: http.httpRunTestsFile,
  http_run_tests_folder: http.httpRunTestsFolder,
  http_run_tests_all: () => http.httpRunTestsAll(),
  http_to_curl: http.httpToCurl,
  http_list_envs: () => http.httpListEnvs(),
  http_get_env: http.httpGetEnv,
  http_create_env: http.httpCreateEnv,
  http_get_active_env: () => http.httpGetActiveEnv(),
  http_set_active_env: http.httpSetActiveEnv,
  http_install_skill: () => http.httpInstallSkill(),
  anchor_list: () => anchor.anchorList(),
  anchor_list_file: anchor.anchorListFile,
  anchor_add: anchor.anchorAdd,
  anchor_remove: anchor.anchorRemove,
  anchor_toggle: anchor.anchorToggle,
  anchor_clear: () => anchor.anchorClear(),
  anchor_clear_file: anchor.anchorClearFile,
  anchor_next: anchor.anchorNext,
  anchor_prev: anchor.anchorPrev,
  anchor_goto: anchor.anchorGoto,
  inline_annotation_list: inlineAnnotation.inlineAnnotationList,
  inline_annotation_list_by_tag: inlineAnnotation.inlineAnnotationListByTag,
  inline_annotation_list_file: inlineAnnotation.inlineAnnotationListFile,
  inline_annotation_refresh: () => inlineAnnotation.inlineAnnotationRefresh(),
  inline_annotation_next: inlineAnnotation.inlineAnnotationNext,
  inline_annotation_prev: inlineAnnotation.inlineAnnotationPrev,
  inline_annotation_goto: inlineAnnotation.inlineAnnotationGoto,
};

function buildContextualHandlers(ctx: McpHostContext): Record<string, ToolHandler> {
  return {
    ...buildShareToolHandlers(ctx),
    ...buildRefineToolHandlers(ctx),
    ...buildRecommendationsToolHandlers(ctx),
    ...buildUsageToolHandlers(ctx),
    ...buildSettingsToolHandlers(ctx),
    ...buildMcpSkillToolHandlers(ctx),
  };
}

/**
 * Routes MCP tool invocations to typed handlers or the command dispatcher.
 */
export class McpToolHost {
  private readonly handlers: Record<string, ToolHandler>;

  constructor(private readonly ctx: McpHostContext) {
    this.handlers = { ...STATIC_HANDLERS, ...buildContextualHandlers(ctx) };
  }

  async invoke(tool: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowDestructiveWithoutConfirm = config.get<boolean>(
      'mcp.allowDestructiveWithoutConfirm',
      false
    );

    const started = Date.now();
    try {
      checkRateLimit(tool);
      requireConfirmForDestructive(tool, args, allowDestructiveWithoutConfirm);

      let result: unknown;
      if (tool === 'cursortoys_list_commands') {
        result = await cursortoysListCommands(this.ctx.extensionPath, args);
      } else if (tool === 'cursortoys_execute') {
        result = await cursortoysExecute(args);
      } else {
        const handler = this.handlers[tool];
        if (!handler) {
          throw new Error(
            `Unknown tool "${tool}". Use cursortoys_list_commands or cursortoys_execute for other extension commands.`
          );
        }
        result = await handler(args);
      }

      const redacted = redactSecretsDeep(result);
      const durationMs = Date.now() - started;
      trackMcpToolCall(tool, true, durationMs);
      appendMcpAuditLog({ tool, ok: true, durationMs });
      return redacted;
    } catch (err) {
      const durationMs = Date.now() - started;
      const message = err instanceof Error ? err.message : String(err);
      trackMcpToolCall(tool, false, durationMs, message);
      appendMcpAuditLog({ tool, ok: false, durationMs, error: message });
      throw err;
    }
  }
}
