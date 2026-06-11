import * as net from 'net';
import * as fs from 'fs';
import type { IpcMethod, IpcRequest, IpcResponse, McpConnectionInfo } from './types';

/**
 * IPC client used by the MCP stdio subprocess to reach the extension host.
 */
export class McpIpcClient {
  private socket: net.Socket | undefined;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buffer = '';
  private nextId = 1;
  private token = '';

  static loadConnectionInfo(configPath: string): McpConnectionInfo {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as McpConnectionInfo;
    if (!parsed.port || !parsed.token) {
      throw new Error('Invalid MCP connection config');
    }
    return parsed;
  }

  async connect(port: number, token: string): Promise<void> {
    this.token = token;
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
        this.socket = socket;
        resolve();
      });
      socket.on('error', reject);
      socket.on('data', (chunk) => this.onData(chunk.toString('utf8')));
      socket.on('close', () => {
        this.socket = undefined;
        for (const [, pending] of this.pending) {
          pending.reject(new Error('IPC connection closed'));
        }
        this.pending.clear();
      });
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        this.handleResponse(line);
      }
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  private handleResponse(line: string): void {
    let response: IpcResponse;
    try {
      response = JSON.parse(line) as IpcResponse;
    } catch {
      return;
    }
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    this.pending.delete(response.id);
    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  private request(method: IpcMethod, params: IpcRequest['params'] = {}): Promise<unknown> {
    if (!this.socket) {
      return Promise.reject(new Error('IPC not connected'));
    }
    const id = String(this.nextId++);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const payload: IpcRequest = {
        id,
        method,
        params: { ...params, token: this.token },
      };
      this.socket!.write(`${JSON.stringify(payload)}\n`);
    });
  }

  ping(): Promise<unknown> {
    return this.request('ping');
  }

  invokeTool(tool: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request('invokeTool', { tool, args });
  }

  listResources(template?: string): Promise<unknown> {
    return this.request('listResources', { template });
  }

  readResource(uri: string): Promise<unknown> {
    return this.request('readResource', { uri });
  }

  listPrompts(): Promise<unknown> {
    return this.request('listPrompts');
  }

  getPrompt(name: string, promptArgs: Record<string, string> = {}): Promise<unknown> {
    return this.request('getPrompt', { name, promptArgs });
  }

  disconnect(): void {
    this.socket?.destroy();
    this.socket = undefined;
  }
}
