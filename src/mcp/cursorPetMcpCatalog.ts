/**
 * Cursor Pet MCP surface catalog — no vscode imports (stdio + extension host).
 */
import { z } from 'zod';
import type { McpPromptDefinition } from './promptCatalog';
import type { McpResourceDef } from './resourceCatalog';

export interface CursorPetMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}

export const CURSOR_PET_MCP_PROMPT_NAME = 'cursor-pet-care';
export const CURSOR_PET_MCP_RESOURCE_URI = 'cursortoys://cursor-pet';

export const CURSOR_PET_MCP_TOOL_NAMES = [
  'cursor_pet_status',
  'cursor_pet_select_egg',
  'cursor_pet_feed',
  'cursor_pet_play',
  'cursor_pet_reset',
  'cursor_pet_refresh',
  'cursor_pet_install_hooks',
  'cursor_pet_open',
  'cursor_pet_clean',
  'cursor_pet_medicine',
  'cursor_pet_discipline',
  'cursor_pet_lights_off',
  'cursor_pet_treat',
] as const;

export type CursorPetMcpToolName = (typeof CURSOR_PET_MCP_TOOL_NAMES)[number];

export const CURSOR_PET_MCP_TOOL_DEFINITIONS: CursorPetMcpToolDefinition[] = [
  {
    name: 'cursor_pet_status',
    description: 'Get Cursor Pet state and vitals',
    inputSchema: {},
  },
  {
    name: 'cursor_pet_select_egg',
    description: 'Select an egg skin to start incubation (ember, mist, moss)',
    inputSchema: { egg: z.enum(['ember', 'mist', 'moss']) },
  },
  {
    name: 'cursor_pet_feed',
    description: 'How to feed the pet organically via editor code activity (read-only guidance)',
    inputSchema: {},
  },
  {
    name: 'cursor_pet_play',
    description: 'Play with the pet (+happiness). Use when joy or attention is needed.',
    inputSchema: {
      weight: z.number().positive().optional().describe('Activity weight multiplier (default 1)'),
    },
  },
  {
    name: 'cursor_pet_reset',
    description: 'Reset Cursor Pet after death and return to egg selection',
    inputSchema: {},
  },
  {
    name: 'cursor_pet_refresh',
    description: 'Refresh Cursor Pet view model snapshot',
    inputSchema: {},
  },
  {
    name: 'cursor_pet_install_hooks',
    description: 'Install Cursor Pet activity hook bridge scripts',
    inputSchema: {},
  },
  {
    name: 'cursor_pet_open',
    description: 'Open the Cursor Pet webview panel',
    inputSchema: {},
  },
  {
    name: 'cursor_pet_clean',
    description: 'Clean poop/mess from the pet scene (Tamagotchi hygiene)',
    inputSchema: {},
  },
  {
    name: 'cursor_pet_medicine',
    description: 'Give medicine when the pet is sick (skull icon / care.sick)',
    inputSchema: {},
  },
  {
    name: 'cursor_pet_discipline',
    description: 'Discipline the pet during a tantrum (increases training)',
    inputSchema: {},
  },
  {
    name: 'cursor_pet_lights_off',
    description: 'Turn off lights when the pet is sleeping at night',
    inputSchema: {},
  },
  {
    name: 'cursor_pet_treat',
    description: 'Give a treat (+happiness fast; overuse causes sickness)',
    inputSchema: {
      weight: z.number().positive().optional().describe('Treat weight multiplier (default 1)'),
    },
  },
];

export function isCursorPetMcpTool(name: string): name is CursorPetMcpToolName {
  return (CURSOR_PET_MCP_TOOL_NAMES as readonly string[]).includes(name);
}

export function isCursorPetMcpResource(uri: string): boolean {
  return uri === CURSOR_PET_MCP_RESOURCE_URI || uri.startsWith(`${CURSOR_PET_MCP_RESOURCE_URI}/`);
}

export function isCursorPetMcpPrompt(name: string): boolean {
  return name === CURSOR_PET_MCP_PROMPT_NAME;
}

export function filterToolsForCursorPet<T extends { name: string }>(
  defs: T[],
  cursorPetEnabled: boolean
): T[] {
  if (cursorPetEnabled) {
    return defs;
  }
  return defs.filter((d) => !isCursorPetMcpTool(d.name));
}

export function filterResourcesForCursorPet(
  defs: McpResourceDef[],
  cursorPetEnabled: boolean
): McpResourceDef[] {
  if (cursorPetEnabled) {
    return defs;
  }
  return defs.filter((d) => {
    if (d.kind === 'static') {
      return !isCursorPetMcpResource(d.uri);
    }
    return true;
  });
}

export function filterPromptsForCursorPet(
  defs: McpPromptDefinition[],
  cursorPetEnabled: boolean
): McpPromptDefinition[] {
  if (cursorPetEnabled) {
    return defs;
  }
  return defs.filter((d) => !isCursorPetMcpPrompt(d.name));
}
