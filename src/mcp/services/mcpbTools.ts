import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { getMcpbRoot, installMcpbPackage, uninstallMcpbPackage } from '../../mcpbInstaller';
import type { McpHostContext } from '../types';

async function listMcpbPackages(): Promise<Array<{ serverId: string; packagePath: string; label: string }>> {
  const mcpbRoot = getMcpbRoot();
  const packages: Array<{ serverId: string; packagePath: string; label: string }> = [];
  try {
    const entries = await fs.promises.readdir(mcpbRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const packagePath = path.join(mcpbRoot, entry.name);
      const manifestPath = path.join(packagePath, 'manifest.json');
      let label = entry.name;
      try {
        const raw = await fs.promises.readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(raw) as { name?: string; display_name?: string };
        label = manifest.display_name ?? manifest.name ?? entry.name;
      } catch {
        // use folder name
      }
      packages.push({ serverId: entry.name, packagePath, label });
    }
  } catch {
    // empty
  }
  return packages.sort((a, b) => a.label.localeCompare(b.label));
}

export function buildMcpbToolHandlers(
  _ctx: McpHostContext
): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  return {
    mcpb_list: async () => {
      const packages = await listMcpbPackages();
      return { root: getMcpbRoot(), packages };
    },
    mcpb_install: async (args) => {
      const filePath = args.filePath as string | undefined;
      const ok = await installMcpbPackage(filePath);
      return { installed: ok };
    },
    mcpb_uninstall: async (args) => {
      const serverId = String(args.serverId ?? '');
      if (!serverId) {
        throw new Error('serverId is required');
      }
      const ok = await uninstallMcpbPackage(serverId);
      return { uninstalled: ok };
    },
    mcpb_reveal: async (args) => {
      const serverId = String(args.serverId ?? '');
      const packages = await listMcpbPackages();
      const pkg = packages.find((p) => p.serverId === serverId);
      if (!pkg) {
        throw new Error(`MCPB package not found: ${serverId}`);
      }
      return { serverId, packagePath: pkg.packagePath };
    },
  };
}

export function buildMcpbToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}> {
  const confirm = { confirm: z.boolean().optional() };
  return [
    { name: 'mcpb_list', description: 'List installed MCPB packages', inputSchema: {} },
    { name: 'mcpb_install', description: 'Install MCPB from .mcpb file path', inputSchema: { filePath: z.string().optional() } },
    { name: 'mcpb_uninstall', description: 'Uninstall MCPB package', inputSchema: { serverId: z.string(), ...confirm } },
    { name: 'mcpb_reveal', description: 'Get MCPB package install path', inputSchema: { serverId: z.string() } },
  ];
}
