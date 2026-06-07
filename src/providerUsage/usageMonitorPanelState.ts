export type UsageMonitorPanelState = 'empty' | 'openRouterOnly' | 'deepInfraOnly' | 'both';

export interface UsageMonitorKeyFlags {
  openRouter: boolean;
  deepInfra: boolean;
}

/**
 * Determines which conditional UI layout the usage monitor panel should render.
 */
export function resolveUsageMonitorPanelState(flags: UsageMonitorKeyFlags): UsageMonitorPanelState {
  if (flags.openRouter && flags.deepInfra) {
    return 'both';
  }
  if (flags.openRouter) {
    return 'openRouterOnly';
  }
  if (flags.deepInfra) {
    return 'deepInfraOnly';
  }
  return 'empty';
}
