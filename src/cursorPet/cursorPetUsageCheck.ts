import * as vscode from 'vscode';
import { fetchConsolidatedUsage } from '../cursorUsage';

/**
 * Returns true when Cursor plan usage appears fully exhausted.
 */
export async function isCursorPlanExhausted(): Promise<boolean> {
  const manualToken = (
    vscode.workspace.getConfiguration('cursorToys').get<string>('spending.sessionToken', '') || ''
  ).trim();
  const data = await fetchConsolidatedUsage(manualToken);
  const plan = data?.planUsage;
  if (!plan) {
    return false;
  }
  const auto = plan.autoPercentUsed ?? 0;
  const api = plan.apiPercentUsed ?? 0;
  if (auto >= 100 && api >= 100) {
    return true;
  }
  if (auto >= 100 && api <= 0) {
    return true;
  }
  return false;
}
