import * as net from 'net';
import * as crypto from 'crypto';
import type { IpcRequest, IpcResponse, McpConnectionInfo, McpIpcRouter } from './types';

/**
 * TCP IPC server on localhost for MCP subprocess ↔ extension host communication.
 */
export class McpIpcServer {
  private server: net.Server | undefined;
  private token = '';
  private port = 0;

  getConnectionInfo(): McpConnectionInfo {
    return {
      port: this.port,
      token: this.token,
      updatedAt: new Date().toISOString(),
    };
  }

  async start(router: McpIpcRouter): Promise<McpConnectionInfo> {
    this.token = crypto.randomBytes(24).toString('hex');

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        let buffer = '';

        socket.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          let newlineIndex = buffer.indexOf('\n');
          while (newlineIndex >= 0) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (line.length > 0) {
              void this.handleLine(line, socket, router);
            }
            newlineIndex = buffer.indexOf('\n');
          }
        });
      });

      this.server.on('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server?.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to bind MCP IPC server'));
          return;
        }
        this.port = address.port;
        resolve(this.getConnectionInfo());
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
    this.port = 0;
    this.token = '';
  }

  private async handleLine(line: string, socket: net.Socket, router: McpIpcRouter): Promise<void> {
    let request: IpcRequest;
    try {
      request = JSON.parse(line) as IpcRequest;
    } catch {
      this.send(socket, { id: 'unknown', error: { code: 'PARSE_ERROR', message: 'Invalid JSON' } });
      return;
    }

    if (!this.validateToken(request.params?.token)) {
      this.send(socket, { id: request.id, error: { code: 'UNAUTHORIZED', message: 'Invalid IPC token' } });
      return;
    }

    try {
      if (request.method === 'ping') {
        this.send(socket, { id: request.id, result: { ok: true } });
        return;
      }

      if (request.method === 'invokeTool') {
        const tool = request.params?.tool;
        const args = request.params?.args ?? {};
        if (!tool) {
          this.send(socket, {
            id: request.id,
            error: { code: 'INVALID_REQUEST', message: 'Missing tool name' },
          });
          return;
        }
        const result = await router.invokeTool(tool, args);
        this.send(socket, { id: request.id, result });
        return;
      }

      if (request.method === 'listResources') {
        const result = await router.listResources(request.params?.template);
        this.send(socket, { id: request.id, result });
        return;
      }

      if (request.method === 'readResource') {
        const uri = request.params?.uri;
        if (!uri) {
          this.send(socket, {
            id: request.id,
            error: { code: 'INVALID_REQUEST', message: 'Missing resource URI' },
          });
          return;
        }
        const result = await router.readResource(uri);
        this.send(socket, { id: request.id, result });
        return;
      }

      if (request.method === 'listPrompts') {
        const result = await router.listPrompts();
        this.send(socket, { id: request.id, result });
        return;
      }

      if (request.method === 'getPrompt') {
        const name = request.params?.name;
        if (!name) {
          this.send(socket, {
            id: request.id,
            error: { code: 'INVALID_REQUEST', message: 'Missing prompt name' },
          });
          return;
        }
        const result = await router.getPrompt(name, request.params?.promptArgs ?? {});
        this.send(socket, { id: request.id, result });
        return;
      }

      this.send(socket, {
        id: request.id,
        error: { code: 'UNKNOWN_METHOD', message: `Unknown method: ${request.method}` },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.send(socket, { id: request.id, error: { code: 'IPC_ERROR', message } });
    }
  }

  private send(socket: net.Socket, response: IpcResponse): void {
    socket.write(`${JSON.stringify(response)}\n`);
  }

  validateToken(provided: string | undefined): boolean {
    return Boolean(provided && provided === this.token);
  }
}
