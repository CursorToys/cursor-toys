import { sortInlineAnnotationTags } from './inlineAnnotationTags';

/**
 * Indexed marker with absolute file path.
 */
export interface InlineAnnotationMarker {
  id: string;
  tag: string;
  filePath: string;
  line: number;
  column: number;
  preview: string;
}

export interface InlineAnnotationNavigationTarget {
  filePath: string;
  line: number;
  tag: string;
}

/**
 * Pure in-memory store for inline annotation markers.
 */
export class InlineAnnotationStore {
  private markers = new Map<string, InlineAnnotationMarker>();
  private readonly changeListeners = new Set<() => void>();

  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private notifyChange(): void {
    for (const listener of this.changeListeners) {
      listener();
    }
  }

  replaceFileMarkers(filePath: string, markers: InlineAnnotationMarker[]): void {
    for (const [id, marker] of this.markers.entries()) {
      if (marker.filePath === filePath) {
        this.markers.delete(id);
      }
    }

    for (const marker of markers) {
      this.markers.set(marker.id, marker);
    }

    this.notifyChange();
  }

  removeFile(filePath: string): void {
    let changed = false;
    for (const [id, marker] of this.markers.entries()) {
      if (marker.filePath === filePath) {
        this.markers.delete(id);
        changed = true;
      }
    }
    if (changed) {
      this.notifyChange();
    }
  }

  replaceAll(markers: InlineAnnotationMarker[]): void {
    this.markers.clear();
    for (const marker of markers) {
      this.markers.set(marker.id, marker);
    }
    this.notifyChange();
  }

  clear(): void {
    if (this.markers.size === 0) {
      return;
    }
    this.markers.clear();
    this.notifyChange();
  }

  getAllSorted(): InlineAnnotationMarker[] {
    return Array.from(this.markers.values()).sort(compareMarkers);
  }

  getTags(): string[] {
    const tags = new Set<string>();
    for (const marker of this.markers.values()) {
      tags.add(marker.tag);
    }
    return sortInlineAnnotationTags(tags);
  }

  getByTag(tag: string): InlineAnnotationMarker[] {
    const normalized = tag.toLowerCase();
    return this.getAllSorted().filter((marker) => marker.tag === normalized);
  }

  getGroupedByTag(): Map<string, InlineAnnotationMarker[]> {
    const grouped = new Map<string, InlineAnnotationMarker[]>();
    for (const marker of this.getAllSorted()) {
      const list = grouped.get(marker.tag) ?? [];
      list.push(marker);
      grouped.set(marker.tag, list);
    }
    return grouped;
  }

  getNextMarker(currentFilePath: string, currentLine: number): InlineAnnotationNavigationTarget | undefined {
    const sorted = this.getAllSorted();
    if (sorted.length === 0) {
      return undefined;
    }

    for (const marker of sorted) {
      if (compareMarkerPosition(marker, currentFilePath, currentLine) > 0) {
        return toNavigationTarget(marker);
      }
    }

    return toNavigationTarget(sorted[0]);
  }

  getPrevMarker(currentFilePath: string, currentLine: number): InlineAnnotationNavigationTarget | undefined {
    const sorted = this.getAllSorted();
    if (sorted.length === 0) {
      return undefined;
    }

    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const marker = sorted[index];
      if (compareMarkerPosition(marker, currentFilePath, currentLine) < 0) {
        return toNavigationTarget(marker);
      }
    }

    return toNavigationTarget(sorted[sorted.length - 1]);
  }
}

function compareMarkers(a: InlineAnnotationMarker, b: InlineAnnotationMarker): number {
  const fileCompare = a.filePath.localeCompare(b.filePath);
  if (fileCompare !== 0) {
    return fileCompare;
  }
  if (a.line !== b.line) {
    return a.line - b.line;
  }
  return a.tag.localeCompare(b.tag);
}

function compareMarkerPosition(
  marker: InlineAnnotationMarker,
  currentFilePath: string,
  currentLine: number
): number {
  const fileCompare = marker.filePath.localeCompare(currentFilePath);
  if (fileCompare !== 0) {
    return fileCompare;
  }
  return marker.line - currentLine;
}

function toNavigationTarget(marker: InlineAnnotationMarker): InlineAnnotationNavigationTarget {
  return {
    filePath: marker.filePath,
    line: marker.line,
    tag: marker.tag,
  };
}
