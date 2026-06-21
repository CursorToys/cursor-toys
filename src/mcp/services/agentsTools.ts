import { z } from 'zod';
import {
  createAgent,
  deleteAgent,
  generateAgentDeeplink,
  listAgents,
  readAgent,
  renameAgent,
  shareAgent,
  updateAgent,
} from '../../agentsManager';

export function buildAgentsToolHandlers(): Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> {
  return {
    agents_list: listAgents,
    agents_read: readAgent,
    agents_create: createAgent,
    agents_update: updateAgent,
    agents_rename: renameAgent,
    agents_delete: deleteAgent,
    agents_share: shareAgent,
    agents_generate_deeplink: generateAgentDeeplink,
  };
}

export function buildAgentsToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}> {
  const confirm = { confirm: z.boolean().optional() };
  const common = { filePath: z.string().optional(), name: z.string().optional() };
  return [
    { name: 'agents_list', description: 'List personal subagents (~/.cursor/agents/)', inputSchema: {} },
    { name: 'agents_read', description: 'Read personal subagent file', inputSchema: common },
    {
      name: 'agents_create',
      description: 'Create personal subagent',
      inputSchema: { name: z.string(), content: z.string().optional() },
    },
    { name: 'agents_update', description: 'Update personal subagent', inputSchema: { ...common, content: z.string() } },
    { name: 'agents_rename', description: 'Rename personal subagent', inputSchema: { ...common, newName: z.string() } },
    { name: 'agents_delete', description: 'Delete personal subagent', inputSchema: { ...common, ...confirm } },
    { name: 'agents_share', description: 'Share personal subagent as CursorToys link', inputSchema: common },
    { name: 'agents_generate_deeplink', description: 'Generate deeplink for personal subagent', inputSchema: common },
  ];
}
