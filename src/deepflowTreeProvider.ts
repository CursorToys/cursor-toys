import * as vscode from 'vscode';
import {
  AbcFileKind,
  ABC_FILE_NAMES,
  deepflowSpecsExist,
  DEEPFLOW_STAGES,
  DeepFlowStage,
  getDeepflowMemoryUri,
  getDeepflowRootUri,
  getDeepflowSpecsUri,
  getStageLabel,
  getWorkspaceFolderUri,
  listExistingAbcFiles,
  listTasksInStage,
} from './deepflowPaths';
import { deepflowFileTreeItemId } from './deepflowFileOps';
import {
  DeepflowMemoryEntry,
  DeepflowMemoryTopic,
  DeepflowMemoryTopicId,
  formatMemoryEntryDescription,
  formatMemoryEntryLabel,
} from './deepflowMemoryParser';
import { readDeepflowMemoryDoc } from './deepflowMemory';

export type DeepFlowEmptyReason = 'noWorkspace' | 'needsInit';

export type DeepFlowItemType =
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

export interface DeepFlowTreeItem {
  type: DeepFlowItemType;
  label: string;
  emptyReason?: DeepFlowEmptyReason;
  deepflowRootUri?: vscode.Uri;
  memoryTopicId?: DeepflowMemoryTopicId;
  memoryEntry?: DeepflowMemoryEntry;
  memoryTopic?: DeepflowMemoryTopic;
  stage?: DeepFlowStage;
  taskId?: string;
  taskFolderUri?: vscode.Uri;
  abcKind?: AbcFileKind;
  fileUri?: vscode.Uri;
}

/**
 * Tree data provider for DeepFlow specs under `.deepflow/specs`.
 */
export class DeepFlowTreeProvider implements vscode.TreeDataProvider<DeepFlowTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DeepFlowTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: DeepFlowTreeItem): vscode.TreeItem {
    if (element.type === 'empty') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      if (element.emptyReason === 'needsInit') {
        item.description = 'Install skill if needed, then /deepflow initialize';
        item.iconPath = new vscode.ThemeIcon('sparkle');
        item.contextValue = 'deepflowEmptyNeedInit';
        item.command = {
          command: 'cursor-toys.deepflow.initialize',
          title: 'Initialize DeepFlow',
          arguments: [element],
        };
      } else {
        item.description = 'Open a folder in the workspace';
        item.iconPath = new vscode.ThemeIcon('info');
        item.contextValue = 'deepflowEmptyNoWorkspace';
      }
      return item;
    }

    if (element.type === 'memoryRoot') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.contextValue = 'deepflowMemoryRoot';
      item.iconPath = new vscode.ThemeIcon('database');
      item.description = 'Topics & sessions';
      return item;
    }

    if (element.type === 'memoryTopic') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.contextValue = 'deepflowMemoryTopic';
      item.iconPath = memoryTopicIcon(element.memoryTopicId!);
      const count = element.memoryTopic?.entries.length ?? 0;
      item.description = count > 0 ? `${count}` : undefined;
      return item;
    }

    if (element.type === 'memoryTopicEmpty') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon('info');
      item.contextValue = 'deepflowMemoryTopicEmpty';
      return item;
    }

    if (element.type === 'memoryEntry' && element.memoryEntry) {
      const entry = element.memoryEntry;
      const item = new vscode.TreeItem(
        formatMemoryEntryLabel(entry),
        vscode.TreeItemCollapsibleState.None
      );
      item.description = formatMemoryEntryDescription(entry);
      item.contextValue = 'deepflowMemoryEntry';
      item.iconPath =
        entry.kind === 'archived'
          ? new vscode.ThemeIcon('history')
          : new vscode.ThemeIcon('lightbulb-autofix');
      item.command = {
        command: 'cursor-toys.deepflow.openMemoryEntry',
        title: 'Open',
        arguments: [element],
      };
      return item;
    }

    if (element.type === 'memoryFile' && element.fileUri) {
      const item = new vscode.TreeItem('memory.md', vscode.TreeItemCollapsibleState.None);
      item.resourceUri = element.fileUri;
      item.contextValue = 'deepflowMemoryFile';
      item.iconPath = new vscode.ThemeIcon('notebook');
      item.command = {
        command: 'cursor-toys.deepflow.openMemory',
        title: 'Open memory.md',
        arguments: [element.fileUri.toString()],
      };
      return item;
    }

    if (element.type === 'stage') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.contextValue = `deepflowStage${capitalizeStage(element.stage!)}`;
      item.iconPath = stageIcon(element.stage!);
      return item;
    }

    if (element.type === 'stageEmpty') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.description = 'No tasks in this stage';
      item.iconPath = new vscode.ThemeIcon('info');
      item.contextValue = 'deepflowStageEmpty';
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
      item.id = deepflowFileTreeItemId(element.fileUri);
      item.command = {
        command: 'cursor-toys.deepflow.openAbcFile',
        title: 'Open',
        arguments: [element.fileUri.toString()],
      };
    }
    item.contextValue = 'deepflowAbcFile';
    item.iconPath = abcIcon(element.abcKind!);
    return item;
  }

  async getChildren(element?: DeepFlowTreeItem): Promise<DeepFlowTreeItem[]> {
    const root = getDeepflowRootUri();
    if (!root) {
      return [
        {
          type: 'empty',
          label: 'Open a workspace folder to use DeepFlow',
          emptyReason: 'noWorkspace',
        },
      ];
    }

    const hasSpecs = await deepflowSpecsExist(root);
    if (!hasSpecs) {
      return [
        {
          type: 'empty',
          label: 'Initialize DeepFlow',
          emptyReason: 'needsInit',
        },
      ];
    }

    const specsUri = getDeepflowSpecsUri(root);

    if (!element) {
      const stages = DEEPFLOW_STAGES.map((stage) => ({
        type: 'stage' as const,
        label: getStageLabel(stage),
        stage,
      }));
      return [
        {
          type: 'memoryRoot' as const,
          label: 'Memory',
          deepflowRootUri: root,
        },
        ...stages,
      ];
    }

    if (element.type === 'memoryRoot' && element.deepflowRootUri) {
      return buildMemoryChildren(element.deepflowRootUri);
    }

    if (element.type === 'memoryTopic' && element.memoryTopic) {
      const topic = element.memoryTopic;
      if (topic.entries.length === 0) {
        return [
          {
            type: 'memoryTopicEmpty' as const,
            label: getMemoryTopicEmptyLabel(topic.id),
            deepflowRootUri: element.deepflowRootUri,
            memoryTopicId: topic.id,
            memoryTopic: topic,
          },
        ];
      }
      return topic.entries.map((entry, index) => ({
        type: 'memoryEntry' as const,
        label: formatMemoryEntryLabel(entry),
        deepflowRootUri: element.deepflowRootUri,
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
      const tasks = await listTasksInStage(specsUri, element.stage);
      if (tasks.length === 0) {
        return [
          {
            type: 'stageEmpty',
            label: getStageEmptyLabel(element.stage),
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
    }

    if (element.type === 'stageEmpty') {
      return [];
    }

    if (element.type === 'task' && element.taskFolderUri) {
      const files = await listExistingAbcFiles(element.taskFolderUri);
      if (files.length === 0) {
        return [
          {
            type: 'stageEmpty',
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
    }

    return [];
  }
}

function getStageEmptyLabel(stage: DeepFlowStage): string {
  switch (stage) {
    case 'drafts':
      return 'No draft tasks';
    case 'active':
      return 'No tasks in development';
    case 'archive':
      return 'No archived tasks';
  }
}

function capitalizeStage(stage: DeepFlowStage): string {
  if (stage === 'active') {
    return 'Active';
  }
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

function taskContextValue(stage: DeepFlowStage): string {
  switch (stage) {
    case 'drafts':
      return 'deepflowTaskDraft';
    case 'active':
      return 'deepflowTaskActive';
    case 'archive':
      return 'deepflowTaskArchive';
  }
}

function stageIcon(stage: DeepFlowStage): vscode.ThemeIcon {
  switch (stage) {
    case 'drafts':
      return new vscode.ThemeIcon('layers');
    case 'active':
      return new vscode.ThemeIcon('debug-start');
    case 'archive':
      return new vscode.ThemeIcon('archive');
  }
}

function taskIcon(stage: DeepFlowStage): vscode.ThemeIcon {
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
  arg?: DeepFlowTreeItem | vscode.Uri
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
 * Creates a RelativePattern for DeepFlow specs watcher in the workspace.
 */
export function createDeepflowWatcherPattern(): vscode.RelativePattern | undefined {
  const folder = getWorkspaceFolderUri();
  const root = getDeepflowRootUri(folder);
  if (!root) {
    return undefined;
  }
  return new vscode.RelativePattern(root, '{specs/**,memory.md,AGENTS.md}');
}

async function buildMemoryChildren(root: vscode.Uri): Promise<DeepFlowTreeItem[]> {
  const memoryUri = getDeepflowMemoryUri(root);
  const doc = await readDeepflowMemoryDoc(root);

  let topicItems: DeepFlowTreeItem[] = (doc?.topics ?? []).map((topic) => ({
    type: 'memoryTopic' as const,
    label: topic.title,
    deepflowRootUri: root,
    memoryTopicId: topic.id,
    memoryTopic: topic,
  }));

  if (topicItems.length === 0) {
    topicItems = [
      {
        type: 'memoryTopic',
        label: 'Archived Tasks',
        deepflowRootUri: root,
        memoryTopicId: 'archived',
        memoryTopic: { id: 'archived', title: 'Archived Tasks', entries: [] },
      },
      {
        type: 'memoryTopic',
        label: 'Lessons',
        deepflowRootUri: root,
        memoryTopicId: 'lessons',
        memoryTopic: { id: 'lessons', title: 'Lessons', entries: [] },
      },
    ];
  }

  const memoryFile: DeepFlowTreeItem = {
    type: 'memoryFile',
    label: 'memory.md',
    deepflowRootUri: root,
    fileUri: memoryUri,
  };

  return [...topicItems, memoryFile];
}

function getMemoryTopicEmptyLabel(topicId: DeepflowMemoryTopicId): string {
  switch (topicId) {
    case 'archived':
      return 'No archived tasks indexed yet';
    case 'lessons':
      return 'No lessons recorded yet';
    default:
      return 'No entries in this topic';
  }
}

function memoryTopicIcon(topicId: DeepflowMemoryTopicId): vscode.ThemeIcon {
  switch (topicId) {
    case 'archived':
      return new vscode.ThemeIcon('archive');
    case 'lessons':
      return new vscode.ThemeIcon('mortar-board');
    default:
      return new vscode.ThemeIcon('folder');
  }
}
