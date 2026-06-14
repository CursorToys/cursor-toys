import * as vscode from 'vscode';
import type { ControlSettingsItem } from '../cursorToysSettingsTreeProvider';

const STORAGE_KEY = 'controlPanelItemOrder';

export type ControlPanelOrderMap = Record<string, string[]>;

/**
 * Reads saved Control panel item order from extension global state.
 */
export function getControlPanelOrder(context: vscode.ExtensionContext): ControlPanelOrderMap {
  return context.globalState.get<ControlPanelOrderMap>(STORAGE_KEY, {});
}

/**
 * Persists Control panel item order for a scope (section key).
 */
export async function saveControlPanelOrderScope(
  context: vscode.ExtensionContext,
  scope: string,
  orderedIds: string[]
): Promise<void> {
  const current = getControlPanelOrder(context);
  current[scope] = orderedIds;
  await context.globalState.update(STORAGE_KEY, current);
}

/**
 * Reorders items by saved id list; unknown ids keep their relative order at the end.
 */
export function applyItemOrder<T extends { id: string }>(
  items: T[],
  scope: string,
  orderMap: ControlPanelOrderMap
): T[] {
  const order = orderMap[scope];
  if (!order?.length) {
    return items;
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  const sorted: T[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (item) {
      sorted.push(item);
      byId.delete(id);
    }
  }
  for (const item of byId.values()) {
    sorted.push(item);
  }
  return sorted;
}

/**
 * Applies saved order to settings tree siblings at each level.
 */
export function orderSettingsTree(
  items: ControlSettingsItem[],
  scope: string,
  orderMap: ControlPanelOrderMap
): ControlSettingsItem[] {
  return applyItemOrder(items, scope, orderMap).map((item) => ({
    ...item,
    children: item.children?.length
      ? orderSettingsTree(item.children, `${scope}/${item.id}`, orderMap)
      : undefined,
  }));
}
