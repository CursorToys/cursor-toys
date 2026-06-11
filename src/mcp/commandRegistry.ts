import * as fs from 'fs';
import * as path from 'path';
import type { CommandInfo } from './types';

interface PackageCommandContribution {
  command: string;
  title: string;
  category?: string;
}

/**
 * Loads all cursor-toys commands from package.json contributes.
 */
export function loadCommandsFromPackageJson(extensionPath: string): CommandInfo[] {
  const packageJsonPath = path.join(extensionPath, 'package.json');
  const raw = fs.readFileSync(packageJsonPath, 'utf8');
  const pkg = JSON.parse(raw) as {
    contributes?: { commands?: PackageCommandContribution[] };
  };
  const commands = pkg.contributes?.commands ?? [];
  return commands
    .filter((c) => c.command.startsWith('cursor-toys.'))
    .map((c) => ({
      id: c.command,
      title: c.title,
      category: c.category,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Filters commands by optional substring (id or title).
 */
export function filterCommands(commands: CommandInfo[], filter?: string): CommandInfo[] {
  if (!filter?.trim()) {
    return commands;
  }
  const q = filter.trim().toLowerCase();
  return commands.filter(
    (c) => c.id.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
  );
}

/**
 * Maps MCP-friendly tool prefixes to primary command IDs where a 1:1 mapping exists.
 */
export const TOOL_TO_COMMAND_HINTS: Record<string, string> = {
  'kanban_create': 'cursor-toys.createKanbanCard',
  'notepad_create': 'cursor-toys.createNotepad',
  'http_create': 'cursor-toys.newHttpRequest',
  'import_shareable': 'cursor-toys.import',
  'generate_tree': 'cursor-toys.generateTree',
  'chat_send': 'cursor-toys.sendToChat',
  'chat_send_selection': 'cursor-toys.sendSelectionToChat',
};
