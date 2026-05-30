import * as vscode from 'vscode';
import {
  AbcFileKind,
  ABC_FILE_NAMES,
  deepspecSpecsExist,
  DEEPSPEC_STAGES,
  DeepSpecStage,
  getDeepspecMemoryUri,
  getDeepspecRootUri,
  getDeepspecSpecsUri,
  getStageLabel,
  getWorkspaceFolderUri,
  listExistingAbcFiles,
  listTasksInStage,
} from './deepspecPaths';
import { deepspecFileTreeItemId } from './deepspecFileOps';
import {
  DeepspecMemoryEntry,
  DeepspecMemoryTopic,
  DeepspecMemoryTopicId,
  formatMemoryEntryDescription,
  formatMemoryEntryLabel,
} from './deepspecMemoryParser';
import { readDeepspecMemoryDoc } from './deepspecMemory';
import {
  isTreeLoadingPlaceholder,
  renderLoadingTreeItem,
  TreeLoadCoordinator,
  TreeLoadingPlaceholder,
} from './treeLoading';

export type DeepSpecEmptyReason = 'noWorkspace' | 'needsInit';

export type DeepSpecItemType =
  | 'empty'
  | 'memoryRoot'
  | 'memoryTopic'
  | 'memoryTopicEmpty'
  | 'memoryEntry'
  | 'memoryFile'
  | 'stage'
  | 'stageEmpty'
  | 'task'
  | 'abcFile';

export type DeepSpecTreeElement = DeepSpecTreeItem | TreeLoadingPlaceholder;

export interface DeepSpecTreeItem {
  type: DeepSpecItemType;
  label: string;
  emptyReason?: DeepSpecEmptyReason;
  deepspecRootUri?: vscode.Uri;
  memoryTopicId?: DeepspecMemoryTopicId;
  memoryEntry?: DeepspecMemoryEntry;
  memoryTopic?: DeepspecMemoryTopic;
  stage?: DeepSpecStage;
  /** Number of tasks in this stage (set on stage nodes). */
  taskCount?: number;
  taskId?: string;
  taskFolderUri?: vscode.Uri;
  abcKind?: AbcFileKind;
  fileUri?: vscode.Uri;
}

/**
 * Tree data provider for DeepSpec specs under `.deepspec/specs`.
 */
export class DeepSpecTreeProvider implements vscode.TreeDataProvider<DeepSpecTreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DeepSpecTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly nodeLoader = new TreeLoadCoordinator<DeepSpecTreeItem, DeepSpecTreeItem>(
    (parent) => this._onDidChangeTreeData.fire(parent),
    (parent) => {
      if (!parent) {
        return '__deepspec_root__';
      }
      if (parent.type === 'memoryRoot' && parent.deepspecRootUri) {
        return `memory:${parent.deepspecRootUri.fsPath}`;
      }
      if (parent.type === 'stage' && parent.stage) {
        return `stage:${parent.stage}`;
      }
      if (parent.type === 'task' && parent.taskFolderUri) {
        return `task:${parent.taskFolderUri.fsPath}`;
      }
      return `deepspec:${parent.type}:${parent.label}`;
    }
  );

  refresh(): void {
    this.nodeLoader.clear();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: DeepSpecTreeElement): vscode.TreeItem {
    if (isTreeLoadingPlaceholder(element)) {
      return renderLoadingTreeItem(element);
    }
    if (element.type === 'empty') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      if (element.emptyReason === 'needsInit') {
        item.description = 'Install skill if needed, then /deepspec initialize';
        item.iconPath = new vscode.ThemeIcon('sparkle');
        item.contextValue = 'deepspecEmptyNeedInit';
        item.command = {
          command: 'cursor-toys.deepspec.initialize',
          title: 'Initialize DeepSpec',
          arguments: [element],
        };
      } else {
        item.description = 'Open a folder in the workspace';
        item.iconPath = new vscode.ThemeIcon('info');
        item.contextValue = 'deepspecEmptyNoWorkspace';
      }
      return item;
    }

    if (element.type === 'memoryRoot') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.contextValue = 'deepspecMemoryRoot';
      item.iconPath = new vscode.ThemeIcon('database');
      item.description = 'Topics & sessions';
      return item;
    }

    if (element.type === 'memoryTopic') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.contextValue = 'deepspecMemoryTopic';
      item.iconPath = memoryTopicIcon(element.memoryTopicId!);
      const count = element.memoryTopic?.entries.length ?? 0;
      item.description = count > 0 ? `${count}` : undefined;
      return item;
    }

    if (element.type === 'memoryTopicEmpty') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon('info');
      item.contextValue = 'deepspecMemoryTopicEmpty';
      return item;
    }

    if (element.type === 'memoryEntry' && element.memoryEntry) {
      const entry = element.memoryEntry;
      const item = new vscode.TreeItem(
        formatMemoryEntryLabel(entry),
        vscode.TreeItemCollapsibleState.None
      );
      item.description = formatMemoryEntryDescription(entry);
      item.contextValue = 'deepspecMemoryEntry';
      item.iconPath =
        entry.kind === 'archived'
          ? new vscode.ThemeIcon('history')
          : new vscode.ThemeIcon('lightbulb-autofix');
      item.command = {
        command: 'cursor-toys.deepspec.openMemoryEntry',
        title: 'Open',
        arguments: [element],
      };
      return item;
    }

    if (element.type === 'memoryFile' && element.fileUri) {
      const item = new vscode.TreeItem('memory.md', vscode.TreeItemCollapsibleState.None);
      item.resourceUri = element.fileUri;
      item.contextValue = 'deepspecMemoryFile';
      item.iconPath = new vscode.ThemeIcon('notebook');
      item.command = {
        command: 'cursor-toys.deepspec.openMemory',
        title: 'Open memory.md',
        arguments: [element.fileUri.toString()],
      };
      return item;
    }

    if (element.type === 'stage') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.contextValue = `deepspecStage${capitalizeStage(element.stage!)}`;
      const count = element.taskCount ?? 0;
      item.iconPath = stageIcon(element.stage!, count);
      if (count > 0) {
        item.description = `${count}`;
      } else if (element.stage === 'active') {
        item.description = 'idle';
      }
      return item;
    }

    if (element.type === 'stageEmpty') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.description = 'No tasks in this stage';
      item.iconPath = new vscode.ThemeIcon('info');
      item.contextValue = 'deepspecStageEmpty';
      return item;
    }

    if (element.type === 'task') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.contextValue = taskContextValue(element.stage!);
      item.iconPath = taskIcon(element.stage!);
      item.description = element.stage === 'active' ? 'in development' : undefined;
      return item;
    }

    const fileName = element.abcKind ? ABC_FILE_NAMES[element.abcKind] : element.label;
    const item = new vscode.TreeItem(fileName, vscode.TreeItemCollapsibleState.None);
    if (element.fileUri) {
      item.resourceUri = element.fileUri;
      item.id = deepspecFileTreeItemId(element.fileUri);
      item.command = {
        command: 'cursor-toys.deepspec.openReview',
        title: 'Review',
        arguments: [element],
      };
    }
    item.contextValue = 'deepspecAbcFile';
    item.iconPath = abcIcon(element.abcKind!);
    return item;
  }

  async getChildren(element?: DeepSpecTreeElement): Promise<DeepSpecTreeElement[]> {
    if (isTreeLoadingPlaceholder(element)) {
      return [];
    }

    const root = getDeepspecRootUri();
    if (!root) {
      return [
        {
          type: 'empty',
          label: 'Open a workspace folder to use DeepSpec',
          emptyReason: 'noWorkspace',
        },
      ];
    }

    const specsUri = getDeepspecSpecsUri(root);

    if (!element) {
      return this.nodeLoader.resolveChildren(undefined, async () => {
        const hasSpecs = await deepspecSpecsExist(root);
        if (!hasSpecs) {
          return [
            {
              type: 'empty' as const,
              label: 'Initialize DeepSpec',
              emptyReason: 'needsInit' as const,
            },
          ];
        }

        const stages: DeepSpecTreeItem[] = [];
        for (const stage of DEEPSPEC_STAGES) {
          const tasks = await listTasksInStage(specsUri, stage);
          stages.push({
            type: 'stage',
            label: getStageLabel(stage),
            stage,
            taskCount: tasks.length,
          });
        }
        return [
          {
            type: 'memoryRoot' as const,
            label: 'Memory',
            deepspecRootUri: root,
          },
          ...stages,
        ];
      });
    }

    if (element.type === 'memoryRoot' && element.deepspecRootUri) {
      return this.nodeLoader.resolveChildren(element, () =>
        buildMemoryChildren(element.deepspecRootUri!)
      );
    }

    if (element.type === 'memoryTopic' && element.memoryTopic) {
      const topic = element.memoryTopic;
      if (topic.entries.length === 0) {
        return [
          {
            type: 'memoryTopicEmpty' as const,
            label: getMemoryTopicEmptyLabel(topic.id),
            deepspecRootUri: element.deepspecRootUri,
            memoryTopicId: topic.id,
            memoryTopic: topic,
          },
        ];
      }
      return topic.entries.map((entry, index) => ({
        type: 'memoryEntry' as const,
        label: formatMemoryEntryLabel(entry),
        deepspecRootUri: element.deepspecRootUri,
        memoryTopicId: topic.id,
        memoryTopic: topic,
        memoryEntry: entry,
        taskId: entry.kind === 'archived' ? `mem-${topic.id}-${index}` : undefined,
      }));
    }

    if (element.type === 'memoryTopicEmpty' || element.type === 'memoryEntry') {
      return [];
    }

    if (element.type === 'stage' && element.stage) {
      return this.nodeLoader.resolveChildren(element, async () => {
        const tasks = await listTasksInStage(specsUri, element.stage!);
        if (tasks.length === 0) {
          return [
            {
              type: 'stageEmpty' as const,
              label: getStageEmptyLabel(element.stage!),
              stage: element.stage,
            },
          ];
        }
        return tasks.map((t) => ({
          type: 'task' as const,
          label: t.taskId,
          stage: element.stage,
          taskId: t.taskId,
          taskFolderUri: t.folderUri,
        }));
      });
    }

    if (element.type === 'stageEmpty') {
      return [];
    }

    if (element.type === 'task' && element.taskFolderUri) {
      return this.nodeLoader.resolveChildren(element, async () => {
        const files = await listExistingAbcFiles(element.taskFolderUri!);
        if (files.length === 0) {
          return [
            {
              type: 'stageEmpty' as const,
              label: 'No A-B-C spec files',
              stage: element.stage,
              taskId: element.taskId,
              taskFolderUri: element.taskFolderUri,
            },
          ];
        }
        return files.map((f) => ({
          type: 'abcFile' as const,
          label: ABC_FILE_NAMES[f.kind],
          stage: element.stage,
          taskId: element.taskId,
          taskFolderUri: element.taskFolderUri,
          abcKind: f.kind,
          fileUri: f.uri,
        }));
      });
    }

    return [];
  }
}

function getStageEmptyLabel(stage: DeepSpecStage): string {
  switch (stage) {
    case 'drafts':
      return 'No draft tasks';
    case 'active':
      return 'No tasks in development';
    case 'archive':
      return 'No archived tasks';
  }
}

function capitalizeStage(stage: DeepSpecStage): string {
  if (stage === 'active') {
    return 'Active';
  }
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

function taskContextValue(stage: DeepSpecStage): string {
  switch (stage) {
    case 'drafts':
      return 'deepspecTaskDraft';
    case 'active':
      return 'deepspecTaskActive';
    case 'archive':
      return 'deepspecTaskArchive';
  }
}

function stageIcon(stage: DeepSpecStage, taskCount: number): vscode.ThemeIcon {
  switch (stage) {
    case 'drafts':
      return new vscode.ThemeIcon('layers');
    case 'active':
      return taskCount > 0
        ? new vscode.ThemeIcon('debug-start')
        : new vscode.ThemeIcon('circle-outline');
    case 'archive':
      return new vscode.ThemeIcon('archive');
  }
}

function taskIcon(stage: DeepSpecStage): vscode.ThemeIcon {
  switch (stage) {
    case 'drafts':
      return new vscode.ThemeIcon('lightbulb');
    case 'active':
      return new vscode.ThemeIcon('debug-start');
    case 'archive':
      return new vscode.ThemeIcon('check');
  }
}

function abcIcon(kind: AbcFileKind): vscode.ThemeIcon {
  switch (kind) {
    case 'APPROACH':
      return new vscode.ThemeIcon('book');
    case 'BUSINESS_CONTEXT':
      return new vscode.ThemeIcon('target');
    case 'COMPLETION_REPORT':
      return new vscode.ThemeIcon('output');
  }
}

/**
 * Resolves a task folder URI from a command argument.
 */
export function getTaskFolderUriFromArg(
  arg?: DeepSpecTreeItem | vscode.Uri
): vscode.Uri | undefined {
  if (!arg) {
    return undefined;
  }
  if (arg instanceof vscode.Uri) {
    return arg;
  }
  return arg.taskFolderUri;
}

/**
 * Creates a RelativePattern for DeepSpec specs watcher in the workspace.
 */
export function createDeepspecWatcherPattern(): vscode.RelativePattern | undefined {
  const folder = getWorkspaceFolderUri();
  const root = getDeepspecRootUri(folder);
  if (!root) {
    return undefined;
  }
  return new vscode.RelativePattern(root, '{specs/**,memory.md,AGENTS.md}');
}

async function buildMemoryChildren(root: vscode.Uri): Promise<DeepSpecTreeItem[]> {
  const memoryUri = getDeepspecMemoryUri(root);
  const doc = await readDeepspecMemoryDoc(root);

  let topicItems: DeepSpecTreeItem[] = (doc?.topics ?? []).map((topic) => ({
    type: 'memoryTopic' as const,
    label: topic.title,
    deepspecRootUri: root,
    memoryTopicId: topic.id,
    memoryTopic: topic,
  }));

  if (topicItems.length === 0) {
    topicItems = [
      {
        type: 'memoryTopic',
        label: 'Archived Tasks',
        deepspecRootUri: root,
        memoryTopicId: 'archived',
        memoryTopic: { id: 'archived', title: 'Archived Tasks', entries: [] },
      },
      {
        type: 'memoryTopic',
        label: 'Lessons',
        deepspecRootUri: root,
        memoryTopicId: 'lessons',
        memoryTopic: { id: 'lessons', title: 'Lessons', entries: [] },
      },
    ];
  }

  const memoryFile: DeepSpecTreeItem = {
    type: 'memoryFile',
    label: 'memory.md',
    deepspecRootUri: root,
    fileUri: memoryUri,
  };

  return [...topicItems, memoryFile];
}

function getMemoryTopicEmptyLabel(topicId: DeepspecMemoryTopicId): string {
  switch (topicId) {
    case 'archived':
      return 'No archived tasks indexed yet';
    case 'lessons':
      return 'No lessons recorded yet';
    default:
      return 'No entries in this topic';
  }
}

function memoryTopicIcon(topicId: DeepspecMemoryTopicId): vscode.ThemeIcon {
  switch (topicId) {
    case 'archived':
      return new vscode.ThemeIcon('archive');
    case 'lessons':
      return new vscode.ThemeIcon('mortar-board');
    default:
      return new vscode.ThemeIcon('folder');
  }
}
