/**
 * All documented Cursor hook events (20).
 */
export const ALL_HOOK_EVENTS = [
  'sessionStart',
  'sessionEnd',
  'beforeSubmitPrompt',
  'afterAgentResponse',
  'afterAgentThought',
  'beforeReadFile',
  'afterFileEdit',
  'beforeMCPExecution',
  'afterMCPExecution',
  'beforeShellExecution',
  'afterShellExecution',
  'subagentStart',
  'subagentStop',
  'preToolUse',
  'postToolUse',
  'postToolUseFailure',
  'stop',
  'preCompact',
  'beforeTabFileRead',
  'afterTabFileEdit',
] as const;

export type HookEventName = (typeof ALL_HOOK_EVENTS)[number];

const HOOK_STUB_TEMPLATE = `#!/bin/bash
# Input: JSON via stdin. Exit 0 = success, 2 = block (before* hooks only).
cat > /dev/null
echo '{}'
exit 0
`;

/**
 * Converts a hook script basename (kebab-case) to a Cursor hook event (camelCase).
 * Example: after-file-edit.sh -> afterFileEdit
 */
export function hookEventFromScriptBasename(basename: string): string | null {
  const name = basename.replace(/\.(sh|js|ts)$/i, '');
  const parts = name.split('-').filter(Boolean);
  if (!parts.length) {
    return null;
  }
  const camel =
    parts[0] +
    parts
      .slice(1)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('');
  return ALL_HOOK_EVENTS.includes(camel as HookEventName) ? camel : null;
}

/**
 * Builds the default stub filename for a hook event.
 */
export function hookStubFilename(event: HookEventName): string {
  const kebab = event.replace(/([A-Z])/g, '-$1').replace(/^-/, '').toLowerCase();
  return `${kebab}.sh`;
}

/**
 * Returns default stub script content for a hook event.
 */
export function hookStubContent(_event: HookEventName): string {
  return HOOK_STUB_TEMPLATE;
}

/**
 * Validates hook script filename pattern.
 */
export function isValidHookScriptName(name: string): boolean {
  return /^[a-zA-Z0-9_.-]+\.(sh|js|ts)$/.test(name);
}
