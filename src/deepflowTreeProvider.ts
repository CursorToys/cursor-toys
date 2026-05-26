import * as vscode from 'vscode';
import {
  AbcFileKind,
  ABC_FILE_NAMES,
  deepflowSpecsExist,
  DEEPFLOW_STAGES,
  DeepFlowStage,
  getDeepflowRootUri,
  getDeepflowSpecsUri,
  getStageLabel,
  getWorkspaceFolderUri,
  listExistingAbcFiles,
  listTasksInStage,
} from './deepflowPaths';
import { deepflowFileTreeItemId } from './deepflowFileOps';

export type DeepFlowEmptyReason = 'noWorkspace' | 'needsInit';

export type DeepFlowItemType = 'empty' | 'stage' | 'stageEmpty' | 'task' | 'abcFile';

export interface DeepFlowTreeItem {
  type: DeepFlowItemType;
  label: string;
  emptyReason?: DeepFlowEmptyReason;
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
      return DEEPFLOW_STAGES.map((stage) => ({
        type: 'stage' as const,
        label: getStageLabel(stage),
        stage,
      }));
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
  return new vscode.RelativePattern(root, 'specs/**');
}
