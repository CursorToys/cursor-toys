import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getPersonalHooksPath, hooksFileExists, parseHooksFile } from '../hooksManager';
import { ALL_HOOK_EVENTS } from '../hookScriptUtils';
import { CURSOR_PET_BRIDGE_HOOK_EVENTS } from './cursorPetActivity';
import {
  CURSOR_PET_BRIDGE_SCRIPT,
  CURSOR_PET_FEED_SCRIPT,
  stripCursorPetHookEntries,
} from './cursorPetHookEntries';

const BRIDGE_SCRIPT_NAME = CURSOR_PET_BRIDGE_SCRIPT;
const FEED_SCRIPT_NAME = CURSOR_PET_FEED_SCRIPT;

export const CURSOR_PET_BRIDGE_EVENTS = [...CURSOR_PET_BRIDGE_HOOK_EVENTS];

function getPersonalHooksDir(): string {
  return path.join(path.dirname(getPersonalHooksPath()), 'hooks');
}

function bridgeCommandRef(): string {
  return `node ./hooks/${BRIDGE_SCRIPT_NAME}`;
}

/**
 * Returns true when the cursor pet bridge script is registered for at least one event.
 */
export async function isCursorPetBridgeInstalled(): Promise<boolean> {
  const hooksPath = getPersonalHooksPath();
  if (!(await hooksFileExists(hooksPath))) {
    return false;
  }
  const config = await parseHooksFile(hooksPath);
  if (!config) {
    return false;
  }
  const commandRef = bridgeCommandRef();
  return Object.values(config.hooks).some((entries) =>
    (entries ?? []).some((entry) => entry.command.startsWith(commandRef))
  );
}

/**
 * Installs the cursor pet hook bridge script and registers it on documented events.
 */
export async function installCursorPetHookBridge(): Promise<{ installed: boolean; events: string[] }> {
  const hooksPath = getPersonalHooksPath();
  const hooksDir = getPersonalHooksDir();
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(hooksDir));

  const extensionUri = vscode.extensions.getExtension('godrix.cursor-toys')?.extensionUri;
  if (!extensionUri) {
    throw new Error('CursorToys extension URI is not available');
  }

  const sourceUri = vscode.Uri.joinPath(extensionUri, 'resources', 'cursor-pet', BRIDGE_SCRIPT_NAME);
  const feedSourceUri = vscode.Uri.joinPath(extensionUri, 'resources', 'cursor-pet', FEED_SCRIPT_NAME);
  const targetPath = path.join(hooksDir, BRIDGE_SCRIPT_NAME);
  const feedTargetPath = path.join(hooksDir, FEED_SCRIPT_NAME);
  const sourceBytes = await vscode.workspace.fs.readFile(sourceUri);
  const feedBytes = await vscode.workspace.fs.readFile(feedSourceUri);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(targetPath), sourceBytes);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(feedTargetPath), feedBytes);

  if (!(await hooksFileExists(hooksPath))) {
    const hooks: Record<string, Array<{ command: string }>> = {};
    for (const event of ALL_HOOK_EVENTS) {
      hooks[event] = [];
    }
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(hooksPath),
      Buffer.from(JSON.stringify({ version: 1, hooks }, null, 2), 'utf8')
    );
  }

  const config = await parseHooksFile(hooksPath);
  if (!config) {
    throw new Error('Failed to parse personal hooks.json');
  }

  const commandRef = bridgeCommandRef();
  const registered: string[] = [];

  for (const event of CURSOR_PET_BRIDGE_EVENTS) {
    if (!ALL_HOOK_EVENTS.includes(event as (typeof ALL_HOOK_EVENTS)[number])) {
      continue;
    }
    const withEvent = `${commandRef} ${event}`;
    config.hooks[event] = (config.hooks[event] ?? []).filter(
      (entry) => !entry.command.startsWith(commandRef)
    );
    config.hooks[event].push({ command: withEvent });
    registered.push(event);
  }

  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(hooksPath),
    Buffer.from(JSON.stringify(config, null, 2), 'utf8')
  );

  return { installed: true, events: registered };
}

/**
 * Removes Cursor Pet hook registrations and bundled hook scripts from the personal hooks folder.
 */
export async function uninstallCursorPetHookBridge(): Promise<{
  removed: boolean;
  removedCount: number;
}> {
  const hooksPath = getPersonalHooksPath();
  let removedCount = 0;

  if (await hooksFileExists(hooksPath)) {
    const config = await parseHooksFile(hooksPath);
    if (config) {
      const result = stripCursorPetHookEntries(config);
      removedCount = result.removedCount;
      if (removedCount > 0) {
        await vscode.workspace.fs.writeFile(
          vscode.Uri.file(hooksPath),
          Buffer.from(JSON.stringify(result.config, null, 2), 'utf8')
        );
      }
    }
  }

  const hooksDir = getPersonalHooksDir();
  for (const scriptName of [BRIDGE_SCRIPT_NAME, FEED_SCRIPT_NAME]) {
    const scriptPath = path.join(hooksDir, scriptName);
    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(scriptPath), { useTrash: false });
    } catch {
      // Script may not exist
    }
  }

  return { removed: removedCount > 0, removedCount };
}

/**
 * Reads new activity lines from the NDJSON bridge file starting at byte offset.
 */
export async function readActivityTail(
  filePath: string,
  offset: number
): Promise<{ lines: string[]; nextOffset: number }> {
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size <= offset) {
      return { lines: [], nextOffset: offset };
    }
    const handle = await fs.promises.open(filePath, 'r');
    try {
      const length = stat.size - offset;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, offset);
      const text = buffer.toString('utf8');
      const lines = text.split('\n').filter((line) => line.trim().length > 0);
      return { lines, nextOffset: stat.size };
    } finally {
      await handle.close();
    }
  } catch {
    return { lines: [], nextOffset: offset };
  }
}
