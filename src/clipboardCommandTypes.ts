/**
 * Types for persisted command clipboard entries.
 */

export type ClipboardCommandScope = 'global' | 'workspace' | 'project';

export interface ClipboardCommandEntry {
  id: string;
  label: string;
  text: string;
  scope: ClipboardCommandScope;
  pinned?: boolean;
  folder?: string;
  createdAt: string;
}

export interface ClipboardCommandFile {
  version: 1;
  entry: ClipboardCommandEntry;
}
