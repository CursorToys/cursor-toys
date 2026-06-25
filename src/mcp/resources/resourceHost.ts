import * as path from 'path';
import * as vscode from 'vscode';
import {
  getBaseFolderName,
  getCommandsPath,
  getExtensionDataFolderName,
  getGlobalCursorRoot,
  getHttpPath,
  getKanbanPath,
  getNotepadsPath,
  getPersonalAgentsPath,
  getPersonalHttpPath,
  getPersonalHttpPaths,
  getPlansPath,
  getPromptsPath,
  getRulesPath,
  getSkillsPath,
  getUserHomePath,
} from '../../utils';
import { listAgents } from '../../agentsManager';
import * as kanban from '../services/kanbanTools';
import * as notepad from '../services/notepadTools';
import * as http from '../services/httpTools';
import * as anchor from '../services/anchorTools';
import * as inlineAnnotation from '../services/inlineAnnotationTools';
import * as cursorPet from '../services/cursorPetTools';
import * as hooks from '../services/hooksTools';
import { buildAssetToolHandlers } from '../services/assetsTools';
import { buildClipboardToolHandlers } from '../services/clipboardTools';
import { buildPlansToolHandlers } from '../services/plansTools';
import type { McpHostContext } from '../types';
import { MCP_RESOURCE_DEFINITIONS } from '../resourceCatalog';
import { filterResourcesForCursorPet, isCursorPetMcpResource } from '../cursorPetMcpCatalog';
import { isCursorPetEnabled } from '../../cursorPet/cursorPetConfig';
import { trackMcpEvent } from '../mcpTelemetry';

export interface McpResourceEntry {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

function decodeUriSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function parseCursortoysUri(uri: string): { host: string; segments: string[] } {
  const normalized = uri.replace(/^cursortoys:\/\//, '');
  const parts = normalized.split('/').filter(Boolean);
  return { host: parts[0] ?? '', segments: parts.slice(1) };
}

/**
 * Reads MCP resources for cursortoys:// URIs via extension host services.
 */
export class McpResourceHost {
  private readonly assetHandlers: ReturnType<typeof buildAssetToolHandlers>;
  private readonly planHandlers: ReturnType<typeof buildPlansToolHandlers>;
  private readonly clipboardHandlers: ReturnType<typeof buildClipboardToolHandlers>;

  constructor(_ctx: McpHostContext) {
    this.assetHandlers = buildAssetToolHandlers();
    this.planHandlers = buildPlansToolHandlers();
    this.clipboardHandlers = buildClipboardToolHandlers();
  }

  listStaticResources(): McpResourceEntry[] {
    const defs = filterResourcesForCursorPet(MCP_RESOURCE_DEFINITIONS, isCursorPetEnabled());
    return defs.filter((d) => d.kind === 'static').map((d) => ({
      uri: d.uri,
      name: d.name,
      description: d.description,
      mimeType: d.mimeType,
    }));
  }

  async listResources(template?: string): Promise<McpResourceEntry[]> {
    const entries: McpResourceEntry[] = [...this.listStaticResources()];

    if (!template || template.includes('kanban/{status}')) {
      for (const status of ['backlog', 'todo', 'doing', 'done'] as const) {
        entries.push({
          uri: `cursortoys://kanban/${status}`,
          name: `kanban-${status}`,
          description: `Kanban column: ${status}`,
          mimeType: 'application/json',
        });
      }
    }

    if (!template || template.includes('kanban/card/{path}')) {
      const listed = (await kanban.kanbanList({ status: 'all' })) as {
        cards?: Array<{ filePath: string; title: string }>;
      };
      for (const card of listed.cards ?? []) {
        entries.push({
          uri: `cursortoys://kanban/card/${encodeURIComponent(card.filePath)}`,
          name: card.title,
          description: 'Kanban card',
          mimeType: 'text/markdown',
        });
      }
    }

    if (!template || template.includes('notepad/{name}')) {
      const listed = (await notepad.notepadList({})) as { notepads?: Array<{ name: string }> };
      for (const np of listed.notepads ?? []) {
        entries.push({
          uri: `cursortoys://notepad/${encodeURIComponent(np.name)}`,
          name: np.name,
          description: 'Notepad',
          mimeType: 'text/markdown',
        });
      }
    }

    if (!template || template.includes('http/{path}') || template.includes('http/personal/{path}')) {
      const listed = (await http.httpList()) as {
        files?: Array<{ filePath: string; scope?: string }>;
      };
      for (const file of listed.files ?? []) {
        const filePath = file.filePath;
        const uri =
          file.scope === 'personal'
            ? `cursortoys://http/personal/${encodeURIComponent(filePath)}`
            : `cursortoys://http/${encodeURIComponent(filePath)}`;
        entries.push({
          uri,
          name: path.basename(filePath),
          description: file.scope === 'personal' ? 'Personal HTTP request file' : 'HTTP request file',
          mimeType: 'text/plain',
        });
      }
    }

    if (!template || template.includes('assets/{type}')) {
      for (const type of ['commands', 'rules', 'prompts', 'skills'] as const) {
        entries.push({
          uri: `cursortoys://assets/${type}`,
          name: `${type}-index`,
          description: `Project ${type} index`,
          mimeType: 'application/json',
        });
      }
    }

    if (!template || template.includes('personal/{type}')) {
      for (const type of ['rules', 'skills', 'commands', 'prompts', 'agents', 'hooks'] as const) {
        entries.push({
          uri: `cursortoys://personal/${type}`,
          name: `personal-${type}`,
          description: `Personal ${type} index`,
          mimeType: 'application/json',
        });
      }
    }

    if (!template || template.includes('inline-annotations/{tag}')) {
      try {
        const listed = (await inlineAnnotation.inlineAnnotationList({})) as {
          tags?: string[];
        };
        for (const tag of listed.tags ?? []) {
          entries.push({
            uri: `cursortoys://inline-annotations/${encodeURIComponent(tag)}`,
            name: `inline-${tag}`,
            description: `Inline annotations: ${tag}`,
            mimeType: 'application/json',
          });
        }
      } catch {
        // Service may be unavailable during early activation
      }
    }

    return entries;
  }

  async readResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
    trackMcpEvent('mcp_resource_read', { uri: uri.split('/').slice(0, 3).join('/') });

    if (isCursorPetMcpResource(uri) && !isCursorPetEnabled()) {
      throw new Error('Cursor Pet MCP resources require cursorToys.cursorPet.enabled in CursorToys settings.');
    }

    const { host, segments } = parseCursortoysUri(uri);
    let mimeType = 'application/json';
    let text = '';

    switch (host) {
      case 'config':
        text = JSON.stringify(this.buildConfigSnapshot(), null, 2);
        break;
      case 'kanban':
        if (segments[0] === 'card' && segments[1]) {
          const filePath = decodeUriSegment(segments.slice(1).join('/'));
          const data = await kanban.kanbanRead({ filePath });
          mimeType = 'text/markdown';
          text = JSON.stringify(data, null, 2);
        } else if (segments[0]) {
          const data = await kanban.kanbanList({ status: segments[0] });
          text = JSON.stringify(data, null, 2);
        } else {
          throw new Error('Invalid kanban resource URI');
        }
        break;
      case 'notepad': {
        const name = decodeUriSegment(segments.join('/'));
        const data = await notepad.notepadRead({ name });
        mimeType = 'text/markdown';
        text = JSON.stringify(data, null, 2);
        break;
      }
      case 'http': {
        let filePath: string;
        if (segments[0] === 'personal' && segments.length > 1) {
          filePath = decodeUriSegment(segments.slice(1).join('/'));
        } else {
          filePath = decodeUriSegment(segments.join('/'));
        }
        const data = await http.httpRead({ filePath });
        mimeType = 'text/plain';
        text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        break;
      }
      case 'env': {
        const name = decodeUriSegment(segments.join('/')) || undefined;
        const data = await http.httpGetEnv({ name });
        text = JSON.stringify(data, null, 2);
        break;
      }
      case 'anchors':
        if (segments.length === 0) {
          const data = await anchor.anchorList();
          text = JSON.stringify(data, null, 2);
        } else {
          const filePath = decodeUriSegment(segments.join('/'));
          const data = await anchor.anchorListFile({ filePath });
          text = JSON.stringify(data, null, 2);
        }
        break;
      case 'inline-annotations':
        if (segments.length === 0) {
          const data = await inlineAnnotation.inlineAnnotationList({});
          text = JSON.stringify(data, null, 2);
        } else if (segments[0] === 'file' && segments[1]) {
          const filePath = decodeUriSegment(segments.slice(1).join('/'));
          const data = await inlineAnnotation.inlineAnnotationListFile({ filePath });
          text = JSON.stringify(data, null, 2);
        } else {
          const tag = decodeUriSegment(segments.join('/'));
          const data = await inlineAnnotation.inlineAnnotationListByTag({ tag });
          text = JSON.stringify(data, null, 2);
        }
        break;
      case 'cursor-pet': {
        const data = await cursorPet.cursorPetStatus();
        text = JSON.stringify(data, null, 2);
        break;
      }
      case 'assets': {
        const type = segments[0] as 'commands' | 'rules' | 'prompts' | 'skills';
        const handler = this.assetHandlers[`${type}_list`];
        const data = handler ? await handler({}) : [];
        text = JSON.stringify(data, null, 2);
        break;
      }
      case 'asset': {
        const type = segments[0] as 'commands' | 'rules' | 'prompts' | 'skills';
        const name = decodeUriSegment(segments.slice(1).join('/'));
        const handler = this.assetHandlers[`${type}_read`];
        const data = handler ? await handler({ name }) : null;
        mimeType = 'text/markdown';
        text = JSON.stringify(data, null, 2);
        break;
      }
      case 'plan': {
        const name = decodeUriSegment(segments.join('/'));
        const data = await this.planHandlers.plan_read({ name });
        mimeType = 'text/markdown';
        text = JSON.stringify(data, null, 2);
        break;
      }
      case 'hooks': {
        const data = await hooks.hooksList({});
        text = JSON.stringify(data, null, 2);
        break;
      }
      case 'personal': {
        const type = segments[0];
        if (type === 'agents') {
          text = JSON.stringify(await listAgents(), null, 2);
          break;
        }
        if (type === 'hooks') {
          text = JSON.stringify(await hooks.hooksList({ isPersonal: true }), null, 2);
          break;
        }
        if (['commands', 'rules', 'prompts', 'skills'].includes(type ?? '')) {
          const handler = this.assetHandlers[`${type}_list`];
          const data = handler ? await handler({ isPersonal: true }) : [];
          text = JSON.stringify(data, null, 2);
          break;
        }
        throw new Error(`Unknown personal resource type: ${type}`);
      }
      case 'clipboard': {
        if (segments[0] !== 'history') {
          throw new Error('Unsupported clipboard resource');
        }
        const data = await this.clipboardHandlers.clipboard_history_list({});
        text = JSON.stringify(data, null, 2);
        break;
      }
      default:
        throw new Error(`Unknown resource URI: ${uri}`);
    }

    return {
      contents: [{ uri, mimeType, text }],
    };
  }

  private buildConfigSnapshot(): Record<string, unknown> {
    const config = vscode.workspace.getConfiguration('cursorToys');
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const baseFolder = getBaseFolderName();
    const globalRoot = getGlobalCursorRoot();
    return {
      workspacePath: workspacePath ?? null,
      extensionDataFolder: getExtensionDataFolderName(),
      baseFolder,
      globalCursorPath: config.get<string>('globalCursorPath', ''),
      paths: {
        globalCursorRoot: globalRoot,
        agents: getPersonalAgentsPath(),
        kanban: getKanbanPath(workspacePath),
        notepads: getNotepadsPath(workspacePath),
        http: workspacePath ? getHttpPath(workspacePath) : null,
        personalHttp: getPersonalHttpPath(),
        personalHttpPaths: getPersonalHttpPaths(),
        commands: getCommandsPath(workspacePath),
        rules: getRulesPath(workspacePath),
        prompts: getPromptsPath(workspacePath),
        skills: getSkillsPath(workspacePath),
        plans: getPlansPath(workspacePath),
        personalHome: getUserHomePath(),
      },
      mcp: {
        enabled: config.get<boolean>('mcp.enabled', false),
        autoRegister: config.get<boolean>('mcp.autoRegister', true),
        auditLogEnabled: config.get<boolean>('mcp.auditLogEnabled', false),
      },
      inlineAnnotations: {
        enabled: config.get<boolean>('inlineAnnotations.enabled', true),
        highlightComments: config.get<boolean>('inlineAnnotations.highlightComments', true),
        tags: config.get<string[]>('inlineAnnotations.tags', []),
        scanIncludePaths: config.get<string[]>('inlineAnnotations.scanIncludePaths', []),
      },
      cursorPet: {
        enabled: config.get<boolean>('cursorPet.enabled', false),
      },
    };
  }
}
