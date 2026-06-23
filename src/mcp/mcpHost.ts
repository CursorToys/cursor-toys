import * as vscode from 'vscode';
import { isCursorPetEnabled } from '../cursorPet/cursorPetConfig';
import { McpIpcServer } from './ipcServer';
import {
  registerMcpServerInCursorConfig,
  removeMcpConnectionInfo,
  unregisterMcpServerFromCursorConfig,
  writeMcpConnectionInfo,
} from './mcpConfig';
import { McpPromptHost } from './prompts/promptHost';
import { McpResourceHost } from './resources/resourceHost';
import type { McpConnectionInfo, McpHostContext } from './types';
import type { McpToolHost } from './toolHost';

let ipcServer: McpIpcServer | undefined;
let toolHost: McpToolHost | undefined;
let resourceHost: McpResourceHost | undefined;
let promptHost: McpPromptHost | undefined;

function isMcpEnabled(): boolean {
  return vscode.workspace.getConfiguration('cursorToys').get<boolean>('mcp.enabled', false);
}

function isAutoRegister(): boolean {
  return vscode.workspace.getConfiguration('cursorToys').get<boolean>('mcp.autoRegister', true);
}

function buildConnectionInfoWithFeatures(base: McpConnectionInfo): McpConnectionInfo {
  return {
    ...base,
    features: {
      cursorPet: isCursorPetEnabled(),
    },
  };
}

function refreshMcpConnectionFeatures(): void {
  if (!ipcServer) {
    return;
  }
  writeMcpConnectionInfo(buildConnectionInfoWithFeatures(ipcServer.getConnectionInfo()));
}

/**
 * Starts the MCP IPC bridge and optionally registers in mcp.json.
 */
export async function startMcpHost(context: vscode.ExtensionContext): Promise<void> {
  await stopMcpHost();

  if (!isMcpEnabled()) {
    if (isAutoRegister()) {
      try {
        unregisterMcpServerFromCursorConfig();
      } catch {
        // ignore invalid mcp.json
      }
    }
    return;
  }

  const hostContext: McpHostContext = {
    extensionPath: context.extensionPath,
    extensionContext: context,
  };
  const { McpToolHost: ToolHost } = await import('./toolHost');
  toolHost = new ToolHost(hostContext);
  resourceHost = new McpResourceHost(hostContext);
  promptHost = new McpPromptHost();
  ipcServer = new McpIpcServer();

  const info = await ipcServer.start({
    invokeTool: async (tool, args) => {
      if (!toolHost) {
        throw new Error('MCP tool host not initialized');
      }
      return toolHost.invoke(tool, args);
    },
    listResources: async (template) => {
      if (!resourceHost) {
        throw new Error('MCP resource host not initialized');
      }
      return resourceHost.listResources(template);
    },
    readResource: async (uri) => {
      if (!resourceHost) {
        throw new Error('MCP resource host not initialized');
      }
      return resourceHost.readResource(uri);
    },
    listPrompts: async () => {
      if (!promptHost) {
        throw new Error('MCP prompt host not initialized');
      }
      return promptHost.listPrompts();
    },
    getPrompt: async (name, args) => {
      if (!promptHost) {
        throw new Error('MCP prompt host not initialized');
      }
      return promptHost.getPrompt(name, args);
    },
  });

  writeMcpConnectionInfo(buildConnectionInfoWithFeatures(info));

  if (isAutoRegister()) {
    try {
      registerMcpServerInCursorConfig(context.extensionPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      void vscode.window.showWarningMessage(`CursorToys MCP: could not update mcp.json: ${message}`);
    }
  }
}

/**
 * Stops the MCP IPC bridge and cleans up connection info.
 */
export async function stopMcpHost(): Promise<void> {
  ipcServer?.stop();
  ipcServer = undefined;
  toolHost = undefined;
  resourceHost = undefined;
  promptHost = undefined;
  removeMcpConnectionInfo();
}

/**
 * Registers MCP host lifecycle and config listeners on extension context.
 */
export function registerMcpHost(context: vscode.ExtensionContext): void {
  void startMcpHost(context).catch((err) => {
    console.error('[CursorToys] MCP host failed to start:', err);
  });

  context.subscriptions.push({
    dispose: () => {
      void stopMcpHost();
      if (!isMcpEnabled()) {
        unregisterMcpServerFromCursorConfig();
      }
    },
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('cursorToys.mcp')) {
        void startMcpHost(context);
      }
      if (e.affectsConfiguration('cursorToys.cursorPet.enabled')) {
        refreshMcpConnectionFeatures();
      }
    })
  );
}
