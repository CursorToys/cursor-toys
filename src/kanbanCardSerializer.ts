import { FrontmatterMetadata } from './frontmatterParser';

/**
 * Serializes frontmatter metadata and markdown body into a Kanban card file.
 */
export function serializeKanbanCardFile(metadata: FrontmatterMetadata, body: string): string {
  const lines: string[] = ['---'];

  for (const key of Object.keys(metadata)) {
    const value = metadata[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${formatYamlScalar(String(item))}`);
      }
      continue;
    }
    if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
      continue;
    }
    if (typeof value === 'number') {
      lines.push(`${key}: ${value}`);
      continue;
    }
    lines.push(`${key}: ${formatYamlScalar(String(value))}`);
  }

  lines.push('---');
  const trimmedBody = body.trim();
  if (trimmedBody.length > 0) {
    lines.push('', trimmedBody);
  }
  return lines.join('\n');
}

function formatYamlScalar(value: string): string {
  if (value === '' || /[:#\n\r]/.test(value) || value.startsWith('-')) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}
