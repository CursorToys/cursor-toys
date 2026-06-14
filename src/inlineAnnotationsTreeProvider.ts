import * as path from 'path';
import * as vscode from 'vscode';
import { InlineAnnotationService } from './inlineAnnotationService';
import { InlineAnnotationMarker } from './inlineAnnotationStore';
import { isInlineAnnotationsEnabled } from './inlineAnnotationsConfig';
import { sortInlineAnnotationTags } from './inlineAnnotationTags';

class InlineAnnotationTagItem extends vscode.TreeItem {
  constructor(
    public readonly tag: string,
    markerCount: number
  ) {
    super(tag.toUpperCase(), vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${markerCount}`;
    this.iconPath = iconForTag(tag);
    this.contextValue = 'inlineAnnotationTag';
  }
}

class InlineAnnotationFileItem extends vscode.TreeItem {
  constructor(
    public readonly tag: string,
    public readonly filePath: string,
    markerCount: number
  ) {
    super(path.basename(filePath), vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${markerCount}`;
    this.tooltip = filePath;
    this.iconPath = vscode.ThemeIcon.File;
    this.contextValue = 'inlineAnnotationFile';
  }
}

class InlineAnnotationLineItem extends vscode.TreeItem {
  constructor(public readonly marker: InlineAnnotationMarker) {
    super(`Line ${marker.line + 1}`, vscode.TreeItemCollapsibleState.None);
    this.description = marker.preview;
    this.tooltip = `${marker.filePath}:${marker.line + 1}\n${marker.preview}`;
    this.iconPath = iconForTag(marker.tag);
    this.contextValue = 'inlineAnnotationLine';
    this.command = {
      command: 'cursor-toys.goToInlineAnnotation',
      title: 'Go to Inline Annotation',
      arguments: [marker.filePath, marker.line, marker.tag],
    };
  }
}

function iconForTag(tag: string): vscode.ThemeIcon {
  switch (tag) {
    case 'todo':
      return new vscode.ThemeIcon('checklist');
    case 'note':
      return new vscode.ThemeIcon('note');
    case 'fix':
      return new vscode.ThemeIcon('wrench');
    case 'bug':
      return new vscode.ThemeIcon('bug');
    case 'hack':
      return new vscode.ThemeIcon('zap');
    case 'warn':
      return new vscode.ThemeIcon('warning');
    case 'idea':
      return new vscode.ThemeIcon('lightbulb');
    case 'refactor':
      return new vscode.ThemeIcon('tools');
    case 'review':
      return new vscode.ThemeIcon('eye');
    case 'test':
      return new vscode.ThemeIcon('beaker');
    default:
      return new vscode.ThemeIcon('comment');
  }
}

/**
 * TreeDataProvider for inline annotations grouped by tag, file, and line.
 */
export class InlineAnnotationsTreeProvider
  implements vscode.TreeDataProvider<InlineAnnotationTagItem | InlineAnnotationFileItem | InlineAnnotationLineItem>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    InlineAnnotationTagItem | InlineAnnotationFileItem | InlineAnnotationLineItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly service: InlineAnnotationService) {
    service.index.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(
    element: InlineAnnotationTagItem | InlineAnnotationFileItem | InlineAnnotationLineItem
  ): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: InlineAnnotationTagItem | InlineAnnotationFileItem | InlineAnnotationLineItem
  ): Thenable<(InlineAnnotationTagItem | InlineAnnotationFileItem | InlineAnnotationLineItem)[]> {
    if (!isInlineAnnotationsEnabled()) {
      return Promise.resolve([]);
    }

    if (!element) {
      return Promise.resolve(this.getTagItems());
    }

    if (element instanceof InlineAnnotationTagItem) {
      return Promise.resolve(this.getFileItems(element.tag));
    }

    if (element instanceof InlineAnnotationFileItem) {
      return Promise.resolve(this.getLineItems(element.tag, element.filePath));
    }

    return Promise.resolve([]);
  }

  private getTagItems(): InlineAnnotationTagItem[] {
    const grouped = this.service.index.getGroupedByTag();
    const tags = sortInlineAnnotationTags(grouped.keys());

    return tags.map((tag) => new InlineAnnotationTagItem(tag, grouped.get(tag)?.length ?? 0));
  }

  private getFileItems(tag: string): InlineAnnotationFileItem[] {
    const markers = this.service.index.getByTag(tag);
    const byFile = new Map<string, InlineAnnotationMarker[]>();

    for (const marker of markers) {
      const list = byFile.get(marker.filePath) ?? [];
      list.push(marker);
      byFile.set(marker.filePath, list);
    }

    const items: InlineAnnotationFileItem[] = [];
    for (const [filePath, fileMarkers] of byFile.entries()) {
      items.push(new InlineAnnotationFileItem(tag, filePath, fileMarkers.length));
    }

    return items.sort((a, b) => a.filePath.localeCompare(b.filePath));
  }

  private getLineItems(tag: string, filePath: string): InlineAnnotationLineItem[] {
    return this.service.index
      .getByTag(tag)
      .filter((marker) => marker.filePath === filePath)
      .map((marker) => new InlineAnnotationLineItem(marker));
  }
}
