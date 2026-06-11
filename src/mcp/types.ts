/**
 * Shared MCP IPC and tool types.
 */

export type IpcMethod =
  | 'ping'
  | 'invokeTool'
  | 'listResources'
  | 'readResource'
  | 'listPrompts'
  | 'getPrompt';

export interface IpcRequest {
  id: string;
  method: IpcMethod;
  params?: {
    token?: string;
    tool?: string;
    args?: Record<string, unknown>;
    template?: string;
    uri?: string;
    name?: string;
    promptArgs?: Record<string, string>;
  };
}

export interface McpIpcRouter {
  invokeTool(tool: string, args: Record<string, unknown>): Promise<unknown>;
  listResources(template?: string): Promise<unknown>;
  readResource(uri: string): Promise<unknown>;
  listPrompts(): Promise<unknown>;
  getPrompt(name: string, args: Record<string, string>): Promise<unknown>;
}

export interface IpcResponse {
  id: string;
  result?: unknown;
  error?: { code: string; message: string };
}

export interface McpConnectionInfo {
  port: number;
  token: string;
  updatedAt: string;
}

export interface McpToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface CommandInfo {
  id: string;
  title: string;
  category?: string;
}

export type McpHostContext = {
  extensionPath: string;
  extensionContext: import('vscode').ExtensionContext;
};
