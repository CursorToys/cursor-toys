import * as vscode from 'vscode';
import {
  AbcFileKind,
  ABC_FILE_NAMES,
  deepspecSpecsExist,
  DEEPSPEC_TREE_STAGES,
  DeepSpecTreeStage,
  getAllWorkspaceFolderUris,
  getDeepspecMemoryUri,
  getDeepspecRootUri,
  getDeepspecSpecsUri,
  getStageLabel,
  getWorkspaceFolderFromDeepspecRoot,
  isMultiRootWorkspace,
  listExistingAbcFiles,
  listTasksForTreeStage,
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
  | 'workspaceRoot'
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
  workspaceFolderUri?: vscode.Uri;
  deepspecRootUri?: vscode.Uri;
  memoryTopicId?: DeepspecMemoryTopicId;
  memoryEntry?: DeepspecMemoryEntry;
  memoryTopic?: DeepspecMemoryTopic;
  stage?: DeepSpecTreeStage;
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
      if (parent.type === 'workspaceRoot' && parent.workspaceFolderUri) {
        return `ws:${parent.workspaceFolderUri.fsPath}`;
      }
      if (parent.type === 'memoryRoot' && parent.deepspecRootUri) {
        return `memory:${parent.deepspecRootUri.fsPath}`;
      }
      if (parent.type === 'stage' && parent.stage && parent.deepspecRootUri) {
        return `stage:${parent.deepspecRootUri.fsPath}:${parent.stage}`;
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
    if (element.type === 'workspaceRoot') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.contextValue = 'deepspecWorkspaceRoot';
      item.iconPath = new vscode.ThemeIcon('root-folder');
      item.description = 'Workspace folder';
      return item;
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
      } else if (element.stage === 'active' || element.stage === 'review') {
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
      item.description =
        element.stage === 'review'
          ? 'awaiting your review'
          : element.stage === 'active'
            ? 'in development'
            : undefined;
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

    const workspaceFolders = getAllWorkspaceFolderUris();
    if (workspaceFolders.length === 0) {
      return [
        {
          type: 'empty',
          label: 'Open a workspace folder to use DeepSpec',
          emptyReason: 'noWorkspace',
        },
      ];
    }

    if (!element) {
      if (isMultiRootWorkspace()) {
        return this.nodeLoader.resolveChildren(undefined, async () =>
          workspaceFolders.map((folder) => ({
            type: 'workspaceRoot' as const,
            label: vscode.workspace.getWorkspaceFolder(folder)?.name ?? pathBasename(folder.fsPath),
            workspaceFolderUri: folder,
            deepspecRootUri: getDeepspecRootUri(folder)!,
          }))
        );
      }

      const folder = workspaceFolders[0];
      const root = getDeepspecRootUri(folder);
      if (!root) {
        return [];
      }
      return this.nodeLoader.resolveChildren(undefined, () =>
        buildDeepspecRootChildren(root, folder)
      );
    }

    if (element.type === 'workspaceRoot' && element.workspaceFolderUri && element.deepspecRootUri) {
      return this.nodeLoader.resolveChildren(element, () =>
        buildDeepspecRootChildren(element.deepspecRootUri!, element.workspaceFolderUri!)
      );
    }

    const root = element.deepspecRootUri ?? getDeepspecRootUri(element.workspaceFolderUri);
    if (!root) {
      return [];
    }

    const specsUri = getDeepspecSpecsUri(root);

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
        const tasks = await listTasksForTreeStage(specsUri, element.stage!);
        if (tasks.length === 0) {
          return [
            {
              type: 'stageEmpty' as const,
              label: getStageEmptyLabel(element.stage!),
              stage: element.stage,
              deepspecRootUri: root,
              workspaceFolderUri:
                element.workspaceFolderUri ?? getWorkspaceFolderFromDeepspecRoot(root),
            },
          ];
        }
        return tasks.map((t) => ({
          type: 'task' as const,
          label: t.taskId,
          stage: element.stage,
          taskId: t.taskId,
          taskFolderUri: t.folderUri,
          deepspecRootUri: root,
          workspaceFolderUri: element.workspaceFolderUri ?? getWorkspaceFolderFromDeepspecRoot(root),
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
          deepspecRootUri: root,
          workspaceFolderUri: element.workspaceFolderUri ?? getWorkspaceFolderFromDeepspecRoot(root),
        }));
      });
    }

    return [];
  }
}

function getStageEmptyLabel(stage: DeepSpecTreeStage): string {
  switch (stage) {
    case 'drafts':
      return 'No draft tasks';
    case 'active':
      return 'No tasks in development';
    case 'review':
      return 'No tasks awaiting review';
    case 'archive':
      return 'No archived tasks';
  }
}

function capitalizeStage(stage: DeepSpecTreeStage): string {
  switch (stage) {
    case 'drafts':
      return 'Drafts';
    case 'active':
      return 'Active';
    case 'review':
      return 'Review';
    case 'archive':
      return 'Archive';
  }
}

function taskContextValue(stage: DeepSpecTreeStage): string {
  switch (stage) {
    case 'drafts':
      return 'deepspecTaskDraft';
    case 'active':
      return 'deepspecTaskActive';
    case 'review':
      return 'deepspecTaskReview';
    case 'archive':
      return 'deepspecTaskArchive';
  }
}

function stageIcon(stage: DeepSpecTreeStage, taskCount: number): vscode.ThemeIcon {
  switch (stage) {
    case 'drafts':
      return new vscode.ThemeIcon('layers');
    case 'active':
      return taskCount > 0
        ? new vscode.ThemeIcon('debug-start')
        : new vscode.ThemeIcon('circle-outline');
    case 'review':
      return taskCount > 0
        ? new vscode.ThemeIcon('eye')
        : new vscode.ThemeIcon('circle-outline');
    case 'archive':
      return new vscode.ThemeIcon('archive');
  }
}

function taskIcon(stage: DeepSpecTreeStage): vscode.ThemeIcon {
  switch (stage) {
    case 'drafts':
      return new vscode.ThemeIcon('lightbulb');
    case 'active':
      return new vscode.ThemeIcon('debug-start');
    case 'review':
      return new vscode.ThemeIcon('eye');
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
 * Resolves workspace folder URI from a tree command argument.
 */
export function resolveWorkspaceFolderFromTreeItem(
  arg?: DeepSpecTreeItem | vscode.Uri
): vscode.Uri | undefined {
  if (!arg) {
    return getAllWorkspaceFolderUris()[0];
  }
  if (arg instanceof vscode.Uri) {
    return vscode.workspace.getWorkspaceFolder(arg)?.uri ?? getAllWorkspaceFolderUris()[0];
  }
  if (arg.workspaceFolderUri) {
    return arg.workspaceFolderUri;
  }
  if (arg.deepspecRootUri) {
    return getWorkspaceFolderFromDeepspecRoot(arg.deepspecRootUri);
  }
  if (arg.taskFolderUri) {
    return vscode.workspace.getWorkspaceFolder(arg.taskFolderUri)?.uri;
  }
  if (arg.fileUri) {
    return vscode.workspace.getWorkspaceFolder(arg.fileUri)?.uri;
  }
  return getAllWorkspaceFolderUris()[0];
}

/**
 * Creates file watcher patterns for every workspace `.deepspec` root.
 */
export function createDeepspecWatcherPatterns(): vscode.RelativePattern[] {
  return getAllWorkspaceFolderUris()
    .map((folder) => {
      const root = getDeepspecRootUri(folder);
      if (!root) {
        return undefined;
      }
      return new vscode.RelativePattern(root, '{specs/**,memory.md,AGENTS.md}');
    })
    .filter((pattern): pattern is vscode.RelativePattern => pattern !== undefined);
}

/**
 * @deprecated Prefer {@link createDeepspecWatcherPatterns}.
 */
export function createDeepspecWatcherPattern(): vscode.RelativePattern | undefined {
  return createDeepspecWatcherPatterns()[0];
}

async function buildDeepspecRootChildren(
  root: vscode.Uri,
  workspaceFolder: vscode.Uri
): Promise<DeepSpecTreeItem[]> {
  const hasSpecs = await deepspecSpecsExist(root);
  if (!hasSpecs) {
    return [
      {
        type: 'empty',
        label: 'Initialize DeepSpec',
        emptyReason: 'needsInit',
        deepspecRootUri: root,
        workspaceFolderUri: workspaceFolder,
      },
    ];
  }

  const specsUri = getDeepspecSpecsUri(root);
  const stages: DeepSpecTreeItem[] = [];
  for (const stage of DEEPSPEC_TREE_STAGES) {
    const tasks = await listTasksForTreeStage(specsUri, stage);
    stages.push({
      type: 'stage',
      label: getStageLabel(stage),
      stage,
      taskCount: tasks.length,
      deepspecRootUri: root,
      workspaceFolderUri: workspaceFolder,
    });
  }

  return [
    {
      type: 'memoryRoot',
      label: 'Memory',
      deepspecRootUri: root,
      workspaceFolderUri: workspaceFolder,
    },
    ...stages,
  ];
}

function pathBasename(fsPath: string): string {
  const parts = fsPath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || fsPath;
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
