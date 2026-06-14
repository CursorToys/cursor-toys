/**
 * Default tags indexed from inline comments, in preferred display order.
 */
export const INLINE_ANNOTATION_TAG_ORDER = [
  'todo',
  'fix',
  'note',
  'bug',
  'hack',
  'warn',
  'idea',
  'refactor',
  'review',
  'test',
] as const;

export const DEFAULT_INLINE_ANNOTATION_TAGS: readonly string[] = INLINE_ANNOTATION_TAG_ORDER;

export const DEFAULT_INLINE_ANNOTATION_TAG_COLORS: Readonly<Record<string, string>> = {
  todo: '#FFCC0040',
  fix: '#F4433640',
  note: '#2196F340',
  bug: '#E91E6340',
  hack: '#FF980040',
  warn: '#FF572240',
  idea: '#9C27B040',
  refactor: '#673AB740',
  review: '#00BCD440',
  test: '#4CAF5040',
};

const TAG_ORDER_INDEX = new Map<string, number>(
  INLINE_ANNOTATION_TAG_ORDER.map((tag, index) => [tag, index])
);

/**
 * Sorts tags for tree and Control Panel grouping (known tags first, then alphabetical).
 */
export function sortInlineAnnotationTags(tags: Iterable<string>): string[] {
  const unique = new Set<string>();
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();
    if (normalized) {
      unique.add(normalized);
    }
  }

  return Array.from(unique).sort((a, b) => {
    const indexA = TAG_ORDER_INDEX.get(a) ?? Number.MAX_SAFE_INTEGER;
    const indexB = TAG_ORDER_INDEX.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (indexA !== indexB) {
      return indexA - indexB;
    }
    return a.localeCompare(b);
  });
}

/**
 * Returns display index for a tag (lower = higher priority).
 */
export function getInlineAnnotationTagSortIndex(tag: string): number {
  return TAG_ORDER_INDEX.get(tag.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
}
