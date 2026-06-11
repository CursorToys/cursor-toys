/**
 * Lightweight project feature telemetry (no PII paths).
 */
export type ProjectsTelemetryEvent =
  | 'projects_pin'
  | 'projects_open'
  | 'projects_dashboard_open'
  | 'projects_error';

export function trackProjectsEvent(
  event: ProjectsTelemetryEvent,
  properties?: Record<string, string>
): void {
  const payload = {
    event,
    ...properties,
  };
  // VS Code may collect extension telemetry when enabled by the user.
  console.debug('[CursorToys Projects]', JSON.stringify(payload));
}

export function hashProjectPathKind(pathKind: string): string {
  return pathKind;
}
