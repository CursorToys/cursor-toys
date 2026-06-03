/**
 * In-memory ring buffer for clipboard history (newest first).
 */

export type ClipboardCaptureSource = 'copy' | 'cut';

export interface ClipboardRingEntry {
  text: string;
  timestamp: number;
  source: ClipboardCaptureSource;
}

export interface ClipboardRingBufferOptions {
  maxEntries: number;
  maxEntryChars: number;
}

const DEFAULT_MAX_ENTRIES = 30;
const DEFAULT_MAX_ENTRY_CHARS = 100_000;

/**
 * Ring buffer with consecutive deduplication and size limits.
 */
export class ClipboardRingBuffer {
  private entries: ClipboardRingEntry[] = [];
  private readonly maxEntries: number;
  private readonly maxEntryChars: number;

  constructor(options?: Partial<ClipboardRingBufferOptions>) {
    this.maxEntries = Math.max(1, options?.maxEntries ?? DEFAULT_MAX_ENTRIES);
    this.maxEntryChars = Math.max(1, options?.maxEntryChars ?? DEFAULT_MAX_ENTRY_CHARS);
  }

  /**
   * Adds text to the buffer. Returns false if text exceeds maxEntryChars.
   * Skips push when identical to the newest entry (consecutive dedupe).
   */
  push(text: string, source: ClipboardCaptureSource): boolean {
    if (text.length > this.maxEntryChars) {
      return false;
    }
    if (text.length === 0) {
      return true;
    }
    const newest = this.entries[0];
    if (newest && newest.text === text) {
      return true;
    }
    this.entries.unshift({
      text,
      timestamp: Date.now(),
      source,
    });
    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }
    return true;
  }

  getEntries(): readonly ClipboardRingEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
  }

  get size(): number {
    return this.entries.length;
  }
}
