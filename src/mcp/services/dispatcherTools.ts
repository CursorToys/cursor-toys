import * as vscode from 'vscode';
import { filterCommands, loadCommandsFromPackageJson } from '../commandRegistry';

/**
 * Lists all extension commands available via cursortoys_execute.
 */
export function cursortoysListCommands(
  extensionPath: string,
  args: Record<string, unknown>
): unknown {
  const commands = loadCommandsFromPackageJson(extensionPath);
  const filter = args.filter as string | undefined;
  return {
    count: filterCommands(commands, filter).length,
    commands: filterCommands(commands, filter),
  };
}

/**
 * Executes a cursor-toys.* command by ID.
 */
export async function cursortoysExecute(args: Record<string, unknown>): Promise<unknown> {
  const commandId = String(args.commandId ?? '').trim();
  if (!commandId) {
    throw new Error('commandId is required');
  }
  if (!commandId.startsWith('cursor-toys.')) {
    throw new Error('commandId must start with cursor-toys.');
  }
  const commandArgs = Array.isArray(args.args)
    ? args.args
    : args.args !== undefined
      ? [args.args]
      : [];
  const result = await vscode.commands.executeCommand(commandId, ...commandArgs);
  return { commandId, result: result ?? null };
}
