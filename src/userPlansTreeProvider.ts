import * as vscode from 'vscode';
import * as path from 'path';
import { getPlansPath, getPersonalPlansPaths, isPlanFile, getBaseFolderName } from './utils';

/**
 * Represents a tree item (can be a category, folder or a file)
 */
export type TreeItemType = 'category' | 'folder' | 'file';

/**
 * Represents a plan file or folder in the tree view
 */
export interface PlanFileItem {
  uri: vscode.Uri;
  fileName: string;
  filePath: string;
  type: TreeItemType;
  folderPath?: string; // Relative folder path for grouping
  isPersonal?: boolean; // Whether this is from personal folder
  children?: PlanFileItem[]; // Children for folder/category items
}

/**
 * Tree data provider for user plans folder with drag and drop support
 */
export class UserPlansTreeProvider implements vscode.TreeDataProvider<PlanFileItem>, vscode.TreeDragAndDropController<PlanFileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<PlanFileItem | undefined | null | void> = new vscode.EventEmitter<PlanFileItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<PlanFileItem | undefined | null | void> = this._onDidChangeTreeData.event;

  // Drag and drop support
  dropMimeTypes = ['application/vnd.code.tree.cursor-deeplink.userPlans'];
  dragMimeTypes = ['text/uri-list'];

  /**
   * Refreshes the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Gets the tree item for a given element
   */
  getTreeItem(element: PlanFileItem): vscode.TreeItem {
    if (element.type === 'category') {
      // Category item (Personal or Workspace)
      const treeItem = new vscode.TreeItem(
        element.fileName,
        vscode.TreeItemCollapsibleState.Expanded
      );
      treeItem.iconPath = new vscode.ThemeIcon('folder');
      treeItem.contextValue = 'planCategory';
      return treeItem;
    } else if (element.type === 'folder') {
      // Folder item
      const treeItem = new vscode.TreeItem(
        element.fileName,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      treeItem.iconPath = vscode.ThemeIcon.Folder;
      treeItem.contextValue = 'userPlanFolder';
      return treeItem;
    } else {
      // File item
      const treeItem = new vscode.TreeItem(element.fileName, vscode.TreeItemCollapsibleState.None);
      treeItem.command = {
        command: 'cursor-toys.openPlan',
        title: 'Open Plan',
        arguments: [element.uri]
      };
      treeItem.contextValue = 'userPlanFile';
      treeItem.iconPath = new vscode.ThemeIcon('lightbulb');
      return treeItem;
    }
  }

  /**
   * Recursively reads directory contents and finds all plan files
   * @param basePath The base plans folder path (e.g., workspace/.cursor/plans/)
   * @param currentPath The current directory being processed
   * @returns Array of PlanFileItem with relative paths in fileName
   */
  private async readDirectoryRecursive(
    basePath: string,
    currentPath: string
  ): Promise<PlanFileItem[]> {
    const planFiles: PlanFileItem[] = [];
    const currentUri = vscode.Uri.file(currentPath);

    try {
      // Read directory contents
      const entries = await vscode.workspace.fs.readDirectory(currentUri);

      for (const [name, type] of entries) {
        const itemPath = path.join(currentPath, name);

        if (type === vscode.FileType.File) {
          // Check if file has .plan.md extension
          if (isPlanFile(itemPath)) {
            // Calculate relative path from basePath
            const relativePath = path.relative(basePath, itemPath);
            // Get the folder path (directory part of relative path)
            const folderPath = path.dirname(relativePath);
            // Normalize path separators for cross-platform compatibility
            const normalizedFolderPath = folderPath === '.' ? '' : folderPath.replace(/\\/g, '/');
            
            const fileUri = vscode.Uri.file(itemPath);
            planFiles.push({
              uri: fileUri,
              fileName: path.basename(itemPath), // Just the file name, not the full path
              filePath: itemPath,
              type: 'file',
              folderPath: normalizedFolderPath
            });
          }
        } else if (type === vscode.FileType.Directory) {
          // Recursively search in subdirectories
          const subFiles = await this.readDirectoryRecursive(basePath, itemPath);
          planFiles.push(...subFiles);
        }
      }
    } catch (error) {
      // Handle errors (permission denied, etc.) silently for subdirectories
      console.error(`Error reading directory ${currentPath}:`, error);
    }

    return planFiles;
  }


  /**
   * Groups files by folder path and creates a hierarchical structure
   * @param files Array of plan files with folderPath information
   * @returns Array of folder items with their children
   */
  private groupFilesByFolder(files: PlanFileItem[]): PlanFileItem[] {
    // Group files by folder path
    const folderMap = new Map<string, PlanFileItem[]>();
    
    for (const file of files) {
      const folder = file.folderPath || ''; // Root folder if empty
      if (!folderMap.has(folder)) {
        folderMap.set(folder, []);
      }
      folderMap.get(folder)!.push(file);
    }

    const result: PlanFileItem[] = [];

    // Sort folder keys (root first, then alphabetically)
    const sortedFolders = Array.from(folderMap.keys()).sort((a, b) => {
      if (a === '' && b !== '') return -1; // Root first
      if (a !== '' && b === '') return 1;
      return a.localeCompare(b);
    });

    for (const folderPath of sortedFolders) {
      const filesInFolder = folderMap.get(folderPath)!;
      
      // Sort files alphabetically
      filesInFolder.sort((a, b) => a.fileName.localeCompare(b.fileName));

      if (folderPath === '') {
        // Root folder - add files directly
        result.push(...filesInFolder);
      } else {
        // Create folder item
        const folderName = path.basename(folderPath);
        const folderLabel = `${folderName}`;
        
        result.push({
          uri: vscode.Uri.file(''), // Dummy URI for folder
          fileName: folderLabel,
          filePath: folderPath,
          type: 'folder',
          folderPath: folderPath,
          children: filesInFolder
        });
      }
    }

    return result;
  }

  /**
   * Gets the children of the tree (categories, folders and files)
   */
  async getChildren(element?: PlanFileItem): Promise<PlanFileItem[]> {
    // If element is a category or folder, return its children
    if (element && (element.type === 'category' || element.type === 'folder')) {
      return element.children || [];
    }

    // If element is a file, no children
    if (element && element.type === 'file') {
      return [];
    }
    
    // Root level - get categories (Personal and Workspace)
    const items: PlanFileItem[] = [];

    // Personal plans
    const personalPlansPaths = getPersonalPlansPaths();
    let personalPlans: PlanFileItem[] = [];
    
    for (const folderPath of personalPlansPaths) {
      const folderUri = vscode.Uri.file(folderPath);

      // Check if folder exists
      try {
        await vscode.workspace.fs.stat(folderUri);
      } catch {
        // Folder doesn't exist, skip it
        continue;
      }

      // Recursively read all plan files from this folder
      const planFiles = await this.readDirectoryRecursive(
        folderPath,
        folderPath
      );

      // Mark files as personal
      planFiles.forEach(file => {
        file.isPersonal = true;
      });

      personalPlans.push(...planFiles);
    }

    // Group personal plans by their subfolders
    if (personalPlans.length > 0) {
      const groupedPersonalPlans = this.groupFilesByFolder(personalPlans);
      items.push({
        uri: vscode.Uri.file(''), // Dummy URI for category
        fileName: 'Personal (~/.cursor)',
        filePath: '',
        type: 'category',
        isPersonal: true,
        children: groupedPersonalPlans
      });
    }

    // Workspace plans
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const workspacePath = workspaceFolder.uri.fsPath;
      const workspacePlansPath = getPlansPath(workspacePath, false);
      const folderUri = vscode.Uri.file(workspacePlansPath);

      // Check if folder exists
      try {
        await vscode.workspace.fs.stat(folderUri);
        
        // Recursively read all plan files from workspace
        const planFiles = await this.readDirectoryRecursive(
          workspacePlansPath,
          workspacePlansPath
        );

        // Mark files as workspace (not personal)
        planFiles.forEach(file => {
          file.isPersonal = false;
        });

        // Group files by their subfolders
        const groupedItems = this.groupFilesByFolder(planFiles);
        
        // Add workspace category
        const workspaceName = workspaceFolder.name || 'Project';
        items.push({
          uri: vscode.Uri.file(''), // Dummy URI for category
          fileName: `${workspaceName} (workspace)`,
          filePath: workspacePlansPath,
          type: 'category',
          isPersonal: false,
          children: groupedItems
        });
      } catch {
        // Folder doesn't exist, skip it
      }
    }

    // If no plans exist, return empty
    if (items.length === 0) {
      return [];
    }

    return items;
  }

  /**
   * Handle drag operation - called when user starts dragging an item
   */
  async handleDrag(source: readonly PlanFileItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    // Only allow dragging files, not folders
    const files = source.filter(item => item.type === 'file' && item.uri.scheme === 'file');
    if (files.length === 0) {
      return;
    }

    // Store the dragged items in the data transfer
    dataTransfer.set(
      'application/vnd.code.tree.cursor-deeplink.userPlans',
      new vscode.DataTransferItem(files)
    );
  }

  /**
   * Handle drop operation - called when user drops an item
   */
  async handleDrop(target: PlanFileItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    // Get the dragged items
    const transferItem = dataTransfer.get('application/vnd.code.tree.cursor-deeplink.userPlans');
    if (!transferItem) {
      return;
    }

    const draggedItems: PlanFileItem[] = transferItem.value;
    if (!draggedItems || draggedItems.length === 0) {
      return;
    }

    // Determine the target folder
    let targetFolderPath: string;

    if (!target) {
      // Dropped on root - shouldn't happen but handle it
      vscode.window.showErrorMessage('Cannot drop files on root. Please drop on a folder.');
      return;
    }

    if (target.type === 'category') {
      // Dropped on a category - determine base path based on category
      const draggedItem = draggedItems[0];
      const draggedBasePath = this.getBasePath(draggedItem.filePath);
      
      // Use the category's base path
      if (target.isPersonal) {
        const personalPlansPaths = getPersonalPlansPaths();
        targetFolderPath = personalPlansPaths[0] || draggedBasePath;
      } else {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
          targetFolderPath = getPlansPath(workspaceFolder.uri.fsPath, false);
        } else {
          targetFolderPath = draggedBasePath;
        }
      }
    } else if (target.type === 'folder') {
      // Dropped on a folder
      const draggedItem = draggedItems[0];
      const draggedBasePath = this.getBasePath(draggedItem.filePath);
      
      // Extract the actual folder path
      const folderName = target.fileName.replace('📁 ', '');
      targetFolderPath = path.join(draggedBasePath, target.folderPath || folderName);
    } else {
      // Dropped on a file - move to the same folder as the target file
      const targetDir = path.dirname(target.filePath);
      targetFolderPath = targetDir;
    }

    // Move each dragged file
    for (const item of draggedItems) {
      try {
        const sourceUri = item.uri;
        const fileName = path.basename(item.filePath);
        const targetUri = vscode.Uri.file(path.join(targetFolderPath, fileName));

        // Check if target already exists
        try {
          await vscode.workspace.fs.stat(targetUri);
          const overwrite = await vscode.window.showWarningMessage(
            `File "${fileName}" already exists in the target folder. Overwrite?`,
            'Yes', 'No'
          );
          if (overwrite !== 'Yes') {
            continue;
          }
        } catch {
          // File doesn't exist, proceed
        }

        // Move the file
        await vscode.workspace.fs.rename(sourceUri, targetUri, { overwrite: true });
        vscode.window.showInformationMessage(`Moved "${fileName}" successfully!`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to move "${item.fileName}": ${error}`);
      }
    }

    // Refresh the tree view
    this.refresh();
  }

  /**
   * Get the base plans path from a file path
   * @param filePath Full file path
   * @returns Base plans path (.cursor/plans or workspace/.cursor/plans)
   */
  private getBasePath(filePath: string): string {
    // Check personal plans paths first
    const personalPlansPaths = getPersonalPlansPaths();
    for (const basePath of personalPlansPaths) {
      if (filePath.startsWith(basePath)) {
        return basePath;
      }
    }
    
    // Check workspace plans path
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const workspacePath = workspaceFolder.uri.fsPath;
      const plansPath = getPlansPath(workspacePath, false);
      
      if (filePath.startsWith(plansPath)) {
        return plansPath;
      }
    }
    
    return '';
  }
}

