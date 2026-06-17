import * as path from 'path';

/**
 * Formats a date as YYYY-MM-DD for HTTP request file names.
 */
export function formatHttpRequestDatePrefix(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns the next available base name `YYYY-MM-DD-XX` given existing `.req` file names.
 */
export function nextDateBasedHttpFileBaseName(
  existingFileNames: string[],
  date: Date = new Date()
): string {
  const prefix = formatHttpRequestDatePrefix(date);
  const pattern = new RegExp(`^${prefix.replace(/-/g, '\\-')}-(\\d{2})\\.req$`, 'i');
  let maxSeq = 0;
  for (const name of existingFileNames) {
    const base = path.basename(name);
    const match = base.match(pattern);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }
  return `${prefix}-${String(maxSeq + 1).padStart(2, '0')}`;
}
