#!/usr/bin/env node
/**
 * MCP stdio entry point — started by Cursor via mcp.json.
 * Forwards tool, resource, and prompt requests to the extension host over TCP IPC.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpIpcClient } from './ipcClient';
import { MCP_PROMPT_DEFINITIONS } from './promptCatalog';
import { MCP_RESOURCE_DEFINITIONS } from './resourceCatalog';
import { MCP_TOOL_DEFINITIONS } from './toolSchemaCatalog';

async function main(): Promise<void> {
  const configPath = process.env.CURSORTOYS_IPC_CONFIG;
  if (!configPath) {
    console.error('CURSORTOYS_IPC_CONFIG is not set. Enable cursorToys.mcp.enabled and reload the extension.');
    process.exit(1);
  }

  const client = new McpIpcClient();
  let connected = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const info = McpIpcClient.loadConnectionInfo(configPath);
      await client.connect(info.port, info.token);
      await client.ping();
      connected = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!connected) {
    console.error(
      'Could not connect to CursorToys extension host. Open Cursor/VS Code with CursorToys enabled (cursorToys.mcp.enabled).'
    );
    process.exit(1);
  }

  const server = new McpServer(
    { name: 'cursor-toys', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  for (const def of MCP_TOOL_DEFINITIONS) {
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.inputSchema,
      },
      async (args: Record<string, unknown>) => {
        const result = await client.invokeTool(def.name, args ?? {});
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );
  }

  for (const def of MCP_RESOURCE_DEFINITIONS) {
    if (def.kind === 'static') {
      server.registerResource(
        def.name,
        def.uri,
        { description: def.description, mimeType: def.mimeType },
        async (uri) => {
          const result = (await client.readResource(uri.href)) as {
            contents: Array<{ uri: string; mimeType: string; text: string }>;
          };
          const item = result.contents[0];
          return {
            contents: [
              {
                uri: item.uri,
                mimeType: item.mimeType,
                text: item.text,
              },
            ],
          };
        }
      );
      continue;
    }

    const template = new ResourceTemplate(def.uriTemplate, {
      list: async () => {
        const items = (await client.listResources(def.uriTemplate)) as Array<{
          uri: string;
          name: string;
          description?: string;
          mimeType?: string;
        }>;
        return {
          resources: items.map((item) => ({
            uri: item.uri,
            name: item.name,
            description: item.description,
            mimeType: item.mimeType,
          })),
        };
      },
    });

    server.registerResource(
      def.name,
      template,
      { description: def.description, mimeType: def.mimeType },
      async (uri) => {
        const result = (await client.readResource(uri.href)) as {
          contents: Array<{ uri: string; mimeType: string; text: string }>;
        };
        const item = result.contents[0];
        return {
          contents: [
            {
              uri: item.uri,
              mimeType: item.mimeType,
              text: item.text,
            },
          ],
        };
      }
    );
  }

  for (const def of MCP_PROMPT_DEFINITIONS) {
    server.registerPrompt(
      def.name,
      {
        description: def.description,
        argsSchema: def.argsSchema,
      },
      async (args) => {
        const stringArgs: Record<string, string> = {};
        for (const [key, value] of Object.entries(args ?? {})) {
          if (value !== undefined && value !== null) {
            stringArgs[key] = String(value);
          }
        }
        const result = (await client.getPrompt(def.name, stringArgs)) as {
          description?: string;
          messages: Array<{ role: string; content: { type: string; text: string } }>;
        };
        return {
          description: result.description,
          messages: result.messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: { type: 'text' as const, text: m.content.text },
          })),
        };
      }
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
