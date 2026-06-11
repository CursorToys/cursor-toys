/**
 * MCP prompt catalog — no vscode imports (used by stdio subprocess).
 */
import { z } from 'zod';

export interface McpPromptDefinition {
  name: string;
  description: string;
  argsSchema?: Record<string, z.ZodTypeAny>;
}

export const MCP_PROMPT_DEFINITIONS: McpPromptDefinition[] = [
  {
    name: 'kanban-workflow',
    description: 'Read backlog, move cards, and create tasks via Kanban MCP tools',
    argsSchema: {
      focus: z.string().optional().describe('Optional status column or card title to focus on'),
    },
  },
  {
    name: 'http-test-suite',
    description: 'Create, run, and interpret HTTP request tests in the workspace',
    argsSchema: {
      folder: z.string().optional().describe('Optional HTTP folder relative path'),
    },
  },
  {
    name: 'project-inventory',
    description: 'Inventory commands, rules, prompts, skills, hooks, and plans',
  },
  {
    name: 'share-and-import',
    description: 'Share or import CursorToys assets via deeplinks, bundles, or Gist',
    argsSchema: {
      assetType: z.string().optional().describe('command, rule, prompt, skill, plan, hooks, etc.'),
    },
  },
  {
    name: 'anchor-navigation',
    description: 'Use code anchors to review and navigate the workspace',
    argsSchema: {
      filePath: z.string().optional().describe('Optional file to focus anchor navigation'),
    },
  },
  {
    name: 'notepad-scratchpad',
    description: 'Create or update notepads during an agent session',
    argsSchema: {
      name: z.string().optional().describe('Notepad name to open or create'),
    },
  },
];
