/**
 * Lightweight MCP telemetry (no PII, respects user opt-out via VS Code telemetry level).
 */

export type McpTelemetryEvent = 'mcp_tool_call' | 'mcp_tool_error' | 'mcp_resource_read' | 'mcp_prompt_get';

export function trackMcpEvent(
  event: McpTelemetryEvent,
  properties?: Record<string, string | number | boolean>
): void {
  const payload = {
    event,
    ...properties,
  };
  console.debug('[CursorToys MCP]', JSON.stringify(payload));
}

export function trackMcpToolCall(
  tool: string,
  ok: boolean,
  durationMs: number,
  errorMessage?: string
): void {
  trackMcpEvent(ok ? 'mcp_tool_call' : 'mcp_tool_error', {
    tool,
    ok,
    durationMs,
    ...(errorMessage ? { error: errorMessage.slice(0, 120) } : {}),
  });
}
