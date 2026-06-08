import * as vscode from 'vscode';
import {
  CURSOR_TOYS_MENU_ITEMS,
  MenuUsageMap,
  sortMenuItemsByUsage,
} from './cursorToysCommandPaletteCore';

const USAGE_STORAGE_KEY = 'cursorToys.commandPalette.usage';

interface CursorToysMenuPick extends vscode.QuickPickItem {
  id: string;
  commandId: string;
}

function getUsageMap(context: vscode.ExtensionContext): MenuUsageMap {
  return context.globalState.get<MenuUsageMap>(USAGE_STORAGE_KEY, {});
}

async function recordMenuUsage(context: vscode.ExtensionContext, itemId: string): Promise<void> {
  const usage = getUsageMap(context);
  const existing = usage[itemId];
  usage[itemId] = {
    count: (existing?.count ?? 0) + 1,
    lastUsed: Date.now(),
  };
  await context.globalState.update(USAGE_STORAGE_KEY, usage);
}

/**
 * Opens the CursorToys Command Palette (Quick Pick) sorted by most-used actions.
 */
export async function showCursorToysCommandPalette(
  context: vscode.ExtensionContext
): Promise<void> {
  const usage = getUsageMap(context);
  const sortedItems = sortMenuItemsByUsage(CURSOR_TOYS_MENU_ITEMS, usage);

  const picks: CursorToysMenuPick[] = sortedItems.map((item) => ({
    label: item.label,
    description: item.description,
    detail: item.detail,
    id: item.id,
    commandId: item.commandId,
  }));

  const selected = await vscode.window.showQuickPick(picks, {
    placeHolder: 'CursorToys Command Palette',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!selected) {
    return;
  }

  await recordMenuUsage(context, selected.id);
  await vscode.commands.executeCommand(selected.commandId);
}
