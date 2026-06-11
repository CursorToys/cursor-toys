import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';

const DEEPSPEC_EXTENSION_ID = 'godrix.deepspec';
const ABC_FILES = ['APPROACH.md', 'BUSINESS_CONTEXT.md', 'COMPLETION_REPORT.md'] as const;

function getDeepSpecRoot(): string | null {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!ws) {
    return null;
  }
  return path.join(ws, '.deepspec');
}

function listTaskFolders(stage: 'drafts' | 'active' | 'archive'): string[] {
  const root = getDeepSpecRoot();
  if (!root) {
    return [];
  }
  const stagePath = path.join(root, 'specs', stage);
  try {
    return fs
      .readdirSync(stagePath, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function taskPath(stage: 'drafts' | 'active' | 'archive', name: string): string {
  return path.join(getDeepSpecRoot()!, 'specs', stage, name);
}

function readFileIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function isDeepSpecAvailable(): boolean {
  return Boolean(vscode.extensions.getExtension(DEEPSPEC_EXTENSION_ID));
}

export function buildDeepspecToolHandlers(): Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> {
  return {
    deepspec_list_tasks: async () => {
      const root = getDeepSpecRoot();
      if (!root) {
        throw new Error('No workspace or .deepspec folder');
      }
      return {
        extensionInstalled: isDeepSpecAvailable(),
        deepspecRoot: root,
        drafts: listTaskFolders('drafts'),
        active: listTaskFolders('active'),
        archive: listTaskFolders('archive'),
      };
    },
    deepspec_read_task: async (args) => {
      const name = String(args.name ?? '').trim();
      const stage = (args.stage as 'drafts' | 'active' | 'archive') ?? 'active';
      if (!name) {
        throw new Error('name is required');
      }
      const folder = taskPath(stage, name);
      const files: Record<string, string | null> = {};
      for (const f of ABC_FILES) {
        files[f] = readFileIfExists(path.join(folder, f));
      }
      return { name, stage, folder, files };
    },
    deepspec_create_task: async (args) => {
      const name = String(args.name ?? '').trim();
      if (!name) {
        throw new Error('name is required');
      }
      const folder = taskPath('drafts', name);
      if (fs.existsSync(folder)) {
        throw new Error(`Task already exists in drafts: ${name}`);
      }
      fs.mkdirSync(folder, { recursive: true });
      const title = String(args.title ?? name);
      const summary = String(args.summary ?? 'Pending implementation.');
      fs.writeFileSync(
        path.join(folder, 'BUSINESS_CONTEXT.md'),
        `# [B] BUSINESS CONTEXT — ${name}\n\n## Problem Statement\n\n${summary}\n`,
        'utf8'
      );
      fs.writeFileSync(
        path.join(folder, 'APPROACH.md'),
        `# [A] APPROACH — ${name}\n\n## Summary\n\n${summary}\n\n## Execution Plan (atomic steps)\n\n1. TBD\n`,
        'utf8'
      );
      fs.writeFileSync(
        path.join(folder, 'COMPLETION_REPORT.md'),
        `# [C] COMPLETION REPORT — ${name}\n\n**Status:** \`[PENDING]\`\n`,
        'utf8'
      );
      return { created: true, name, title, folder };
    },
    deepspec_approve: async (args) => {
      const name = String(args.name ?? '').trim();
      if (!name) {
        throw new Error('name is required');
      }
      const from = taskPath('drafts', name);
      const to = taskPath('active', name);
      if (!fs.existsSync(from)) {
        throw new Error(`Draft not found: ${name}`);
      }
      fs.renameSync(from, to);
      const reportPath = path.join(to, 'COMPLETION_REPORT.md');
      const content = readFileIfExists(reportPath) ?? '';
      fs.writeFileSync(
        reportPath,
        content.replace('[PENDING]', '[IN PROGRESS]'),
        'utf8'
      );
      return { approved: true, name, stage: 'active' };
    },
    deepspec_complete: async (args) => {
      const name = String(args.name ?? '').trim();
      if (!name) {
        throw new Error('name is required');
      }
      const from = taskPath('active', name);
      const to = taskPath('archive', name);
      if (!fs.existsSync(from)) {
        throw new Error(`Active task not found: ${name}`);
      }
      fs.renameSync(from, to);
      const reportPath = path.join(to, 'COMPLETION_REPORT.md');
      let content = readFileIfExists(reportPath) ?? '';
      content = content.replace('[IN PROGRESS]', '[DONE]').replace('[IN REVIEW]', '[DONE]');
      fs.writeFileSync(reportPath, content, 'utf8');
      return { completed: true, name, stage: 'archive' };
    },
    deepspec_discard: async (args) => {
      const name = String(args.name ?? '').trim();
      if (!name) {
        throw new Error('name is required');
      }
      const from = taskPath('drafts', name);
      const to = taskPath('archive', name);
      if (!fs.existsSync(from)) {
        throw new Error(`Draft not found: ${name}`);
      }
      fs.renameSync(from, to);
      const reportPath = path.join(to, 'COMPLETION_REPORT.md');
      let content = readFileIfExists(reportPath) ?? '';
      content = content.replace('[PENDING]', '[DISCARDED]');
      fs.writeFileSync(reportPath, content, 'utf8');
      return { discarded: true, name, reason: args.reason ?? null };
    },
  };
}

export function buildDeepspecToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}> {
  const confirm = { confirm: z.boolean().optional() };
  return [
    { name: 'deepspec_list_tasks', description: 'List DeepSpec tasks in drafts/active/archive', inputSchema: {} },
    {
      name: 'deepspec_read_task',
      description: 'Read A-B-C files for a DeepSpec task',
      inputSchema: {
        name: z.string(),
        stage: z.enum(['drafts', 'active', 'archive']).optional(),
      },
    },
    {
      name: 'deepspec_create_task',
      description: 'Create new DeepSpec draft task',
      inputSchema: { name: z.string(), title: z.string().optional(), summary: z.string().optional() },
    },
    { name: 'deepspec_approve', description: 'Move draft to active', inputSchema: { name: z.string() } },
    { name: 'deepspec_complete', description: 'Archive completed task from active', inputSchema: { name: z.string() } },
    {
      name: 'deepspec_discard',
      description: 'Archive draft without implementing',
      inputSchema: { name: z.string(), reason: z.string().optional(), ...confirm },
    },
  ];
}
