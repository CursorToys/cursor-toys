/**
 * Parses `.deepflow/memory.md` into topics (sections) and session entries.
 */

export type DeepflowMemoryTopicId = 'archived' | 'lessons' | 'other';

export interface DeepflowMemoryArchivedEntry {
  kind: 'archived';
  date: string;
  taskNum: string;
  summary: string;
  ref?: string;
  archiveFolderName?: string;
  rawLine: string;
}

export interface DeepflowMemoryLessonEntry {
  kind: 'lesson';
  text: string;
  rawLine: string;
}

export type DeepflowMemoryEntry = DeepflowMemoryArchivedEntry | DeepflowMemoryLessonEntry;

export interface DeepflowMemoryTopic {
  id: DeepflowMemoryTopicId;
  title: string;
  entries: DeepflowMemoryEntry[];
}

export interface DeepflowMemoryDoc {
  topics: DeepflowMemoryTopic[];
  hasContent: boolean;
}

const ARCHIVED_INDEX_REGEX =
  /^\[(\d{4}-\d{2}-\d{2})\]\s+\[(\d+)\]:\s+(.+?)(?:\.\s+Ref:\s+(\S+))?\s*$/;

const ARCHIVE_REF_FOLDER_REGEX = /specs\/archive\/([\w-]+)\/?$/;

/**
 * Returns a short label for tree display (main point).
 */
export function formatMemoryEntryLabel(entry: DeepflowMemoryEntry): string {
  if (entry.kind === 'archived') {
    const summary = truncate(entry.summary, 72);
    return `[${entry.taskNum}] ${summary}`;
  }
  return truncate(entry.text, 80);
}

/**
 * Optional description shown beside the tree label (e.g. date).
 */
export function formatMemoryEntryDescription(entry: DeepflowMemoryEntry): string | undefined {
  if (entry.kind === 'archived') {
    return entry.date;
  }
  return undefined;
}

/**
 * Parses memory.md content into topics and session entries.
 */
export function parseMemoryMarkdown(content: string): DeepflowMemoryDoc {
  const topics: DeepflowMemoryTopic[] = [];
  let currentTopic: DeepflowMemoryTopic | undefined;
  let lessonBuffer: string[] = [];

  const flushLessonBuffer = (): void => {
    if (!currentTopic || currentTopic.id !== 'lessons' || lessonBuffer.length === 0) {
      lessonBuffer = [];
      return;
    }
    const paragraph = lessonBuffer.join(' ').trim();
    lessonBuffer = [];
    if (!paragraph || paragraph.startsWith('<!--')) {
      return;
    }
    for (const point of splitLessonIntoPoints(paragraph)) {
      currentTopic.entries.push({
        kind: 'lesson',
        text: point,
        rawLine: point,
      });
    }
  };

  const ensureTopic = (title: string): DeepflowMemoryTopic => {
    const id = topicIdFromTitle(title);
    const existing = topics.find((t) => t.id === id);
    if (existing) {
      currentTopic = existing;
      return existing;
    }
    const topic: DeepflowMemoryTopic = { id, title: title.trim(), entries: [] };
    topics.push(topic);
    currentTopic = topic;
    return topic;
  };

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    if (line.startsWith('# ') && !line.startsWith('## ')) {
      flushLessonBuffer();
      continue;
    }

    if (line.startsWith('## ')) {
      flushLessonBuffer();
      const title = line.replace(/^##\s+/, '').trim();
      if (title.length > 0) {
        ensureTopic(title);
      }
      continue;
    }

    if (!currentTopic) {
      continue;
    }

    if (!line || line.startsWith('<!--')) {
      flushLessonBuffer();
      continue;
    }

    if (currentTopic.id === 'archived') {
      const match = line.match(ARCHIVED_INDEX_REGEX);
      if (match) {
        const ref = match[4]?.trim();
        currentTopic.entries.push({
          kind: 'archived',
          date: match[1],
          taskNum: match[2],
          summary: match[3].trim(),
          ref,
          archiveFolderName: ref ? parseArchiveFolderFromRef(ref) : undefined,
          rawLine: rawLine.trim(),
        });
      }
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushLessonBuffer();
      const bullet = line.replace(/^[-*]\s+/, '').trim();
      if (bullet) {
        currentTopic.entries.push({
          kind: 'lesson',
          text: bullet,
          rawLine: rawLine.trim(),
        });
      }
      continue;
    }

    lessonBuffer.push(line);
  }

  flushLessonBuffer();

  const hasContent = topics.some((t) => t.entries.length > 0);
  return { topics, hasContent };
}

function topicIdFromTitle(title: string): DeepflowMemoryTopicId {
  const lower = title.toLowerCase();
  if (lower.includes('archived') || lower.includes('archive')) {
    return 'archived';
  }
  if (lower.includes('lesson')) {
    return 'lessons';
  }
  return 'other';
}

function parseArchiveFolderFromRef(ref: string): string | undefined {
  const match = ref.match(ARCHIVE_REF_FOLDER_REGEX);
  return match?.[1];
}

function splitLessonIntoPoints(paragraph: string): string[] {
  const sentences = paragraph
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length <= 1) {
    return [paragraph];
  }
  if (paragraph.length <= 120) {
    return [paragraph];
  }
  return sentences.slice(0, 5);
}

function truncate(text: string, maxLen: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) {
    return clean;
  }
  return `${clean.slice(0, maxLen - 1)}…`;
}
