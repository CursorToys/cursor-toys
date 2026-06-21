import { z } from 'zod';
import { syncAssetToGlobal, syncAssetToWorkspace } from '../../syncAssetManager';

const SYNC_CATEGORIES = ['rules', 'skills', 'commands', 'prompts', 'agents', 'hooks'] as const;

export function buildSyncToolHandlers(): Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> {
  return {
    sync_asset_to_workspace: syncAssetToWorkspace,
    sync_asset_to_global: syncAssetToGlobal,
  };
}

export function buildSyncToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}> {
  const common = {
    category: z.enum(SYNC_CATEGORIES),
    name: z.string(),
    workspacePath: z.string().optional(),
    dryRun: z.boolean().optional(),
    confirm: z.boolean().optional(),
  };
  return [
    {
      name: 'sync_asset_to_workspace',
      description: 'Copy a personal global asset to the open workspace (.cursor/) with backup on overwrite',
      inputSchema: common,
    },
    {
      name: 'sync_asset_to_global',
      description: 'Copy a workspace asset to personal global (~/.cursor/) with backup on overwrite',
      inputSchema: common,
    },
  ];
}
