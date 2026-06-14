import * as path from 'path';
import * as vscode from 'vscode';
import { InlineAnnotationService } from '../../inlineAnnotationService';
import { getInlineAnnotationsSettings } from '../../inlineAnnotationsConfig';
import { sortInlineAnnotationTags } from '../../inlineAnnotationTags';

function getService(): InlineAnnotationService {
  const service = InlineAnnotationService.getInstance();
  if (!service) {
    throw new Error('Inline annotation service is not active');
  }
  return service;
}

function resolveFilePath(filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return path.resolve(filePath);
  }
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspacePath) {
    throw new Error('No workspace folder open');
  }
  return path.resolve(workspacePath, filePath);
}

function filterByWorkspaceRoot<T extends { filePath: string }>(
  items: T[],
  workspaceRoot?: string
): T[] {
  if (!workspaceRoot) {
    return items;
  }
  const root = path.resolve(workspaceRoot);
  return items.filter(
    (item) =>
      path.resolve(item.filePath) === root ||
      path.resolve(item.filePath).startsWith(`${root}${path.sep}`)
  );
}

function toMarkerRow(marker: {
  id: string;
  tag: string;
  filePath: string;
  line: number;
  column: number;
  preview: string;
}) {
  return {
    id: marker.id,
    tag: marker.tag,
    filePath: marker.filePath,
    fileName: path.basename(marker.filePath),
    line: marker.line,
    column: marker.column,
    preview: marker.preview,
  };
}

export async function inlineAnnotationList(args: Record<string, unknown>): Promise<unknown> {
  const settings = getInlineAnnotationsSettings();
  if (!settings.enabled) {
    return { enabled: false, tags: [], markers: [], total: 0 };
  }

  const service = getService();
  const workspaceRoot = args.workspaceRoot as string | undefined;
  const markers = filterByWorkspaceRoot(service.index.getAllSorted(), workspaceRoot).map(toMarkerRow);
  const grouped: Record<string, typeof markers> = {};

  for (const tag of sortInlineAnnotationTags(markers.map((marker) => marker.tag))) {
    grouped[tag] = markers.filter((marker) => marker.tag === tag);
  }

  return {
    enabled: true,
    total: markers.length,
    tags: Object.keys(grouped),
    grouped,
    markers,
    settings: {
      tags: settings.tags,
      highlightComments: settings.highlightComments,
      scanIncludePaths: settings.scanIncludePaths,
    },
  };
}

export async function inlineAnnotationListByTag(args: Record<string, unknown>): Promise<unknown> {
  const tag = (args.tag as string | undefined)?.trim().toLowerCase();
  if (!tag) {
    throw new Error('tag is required');
  }

  const service = getService();
  const workspaceRoot = args.workspaceRoot as string | undefined;
  const markers = filterByWorkspaceRoot(
    service.index.getByTag(tag).map(toMarkerRow),
    workspaceRoot
  );

  return { tag, count: markers.length, markers };
}

export async function inlineAnnotationListFile(args: Record<string, unknown>): Promise<unknown> {
  const filePath = args.filePath as string | undefined;
  if (!filePath) {
    throw new Error('filePath is required');
  }

  const resolved = resolveFilePath(filePath);
  const service = getService();
  const markers = service.index
    .getAllSorted()
    .filter((marker) => path.resolve(marker.filePath) === resolved)
    .map(toMarkerRow);

  return { filePath: resolved, count: markers.length, markers };
}

export async function inlineAnnotationRefresh(): Promise<unknown> {
  const service = getService();
  await service.rescanWorkspace();
  service.refreshOpenDocuments();
  return { refreshed: true, total: service.index.getAllSorted().length };
}

export async function inlineAnnotationNext(args: Record<string, unknown>): Promise<unknown> {
  const service = getService();
  const filePath = args.filePath as string | undefined;
  const line = (args.line as number | undefined) ?? -1;
  const currentFilePath = filePath ? resolveFilePath(filePath) : vscode.window.activeTextEditor?.document.uri.fsPath ?? '';
  const next = service.index.getNextMarker(currentFilePath, line);

  if (!next) {
    return { found: false };
  }

  if (args.openInEditor === true) {
    await service.index.goToMarker(next);
  }

  return { found: true, ...next };
}

export async function inlineAnnotationPrev(args: Record<string, unknown>): Promise<unknown> {
  const service = getService();
  const filePath = args.filePath as string | undefined;
  const line = (args.line as number | undefined) ?? Number.MAX_SAFE_INTEGER;
  const currentFilePath = filePath ? resolveFilePath(filePath) : vscode.window.activeTextEditor?.document.uri.fsPath ?? '';
  const prev = service.index.getPrevMarker(currentFilePath, line);

  if (!prev) {
    return { found: false };
  }

  if (args.openInEditor === true) {
    await service.index.goToMarker(prev);
  }

  return { found: true, ...prev };
}

export async function inlineAnnotationGoto(args: Record<string, unknown>): Promise<unknown> {
  const filePath = args.filePath as string | undefined;
  const line = args.line as number | undefined;
  if (!filePath || line === undefined) {
    throw new Error('filePath and line are required (0-based line index)');
  }

  const resolved = resolveFilePath(filePath);
  const service = getService();
  const target = { filePath: resolved, line, tag: (args.tag as string | undefined) ?? '' };

  if (args.openInEditor === true) {
    await service.index.goToMarker(target);
  }

  return { ...target, opened: args.openInEditor === true };
}
