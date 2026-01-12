import * as vscode from 'vscode';
import * as path from 'path';
import { getPromptsPath, isAllowedExtension, getPersonalPromptsPaths } from './utils';

/**
 * Represents a tree item (can be a category, folder or a file)
 */
export type TreeItemType = 'category' | 'folder' | 'file';

/**
 * Represents a prompt file or folder in the tree view
 */
export interface PromptFileItem {
  uri: vscode.Uri;
  fileName: string;
  filePath: string;
  type: TreeItemType;
  folderPath?: string; // Relative folder path for grouping
  isPersonal?: boolean; // Whether this is from personal folder
  children?: PromptFileItem[]; // Children for folder/category items
}

/**
 * Tree data provider for user prompts folder with drag and drop support
 */
export class UserPromptsTreeProvider implements vscode.TreeDataProvider<PromptFileItem>, vscode.TreeDragAndDropController<PromptFileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<PromptFileItem | undefined | null | void> = new vscode.EventEmitter<PromptFileItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<PromptFileItem | undefined | null | void> = this._onDidChangeTreeData.event;

  // Drag and drop support
  dropMimeTypes = ['application/vnd.code.tree.cursor-deeplink.userPrompts'];
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
  getTreeItem(element: PromptFileItem): vscode.TreeItem {
    if (element.type === 'category') {
      // Category item (Personal or Workspace)
      const treeItem = new vscode.TreeItem(
        element.fileName,
        vscode.TreeItemCollapsibleState.Expanded
      );
      treeItem.iconPath = new vscode.ThemeIcon('folder');
      treeItem.contextValue = 'promptCategory';
      return treeItem;
    } else if (element.type === 'folder') {
      // Folder item
      const treeItem = new vscode.TreeItem(
        element.fileName,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      treeItem.iconPath = vscode.ThemeIcon.Folder;
      treeItem.contextValue = 'userPromptFolder';
      return treeItem;
    } else {
      // File item
      const treeItem = new vscode.TreeItem(element.fileName, vscode.TreeItemCollapsibleState.None);
      treeItem.resourceUri = element.uri;
      treeItem.command = {
        command: 'cursor-toys.openUserPrompt',
        title: 'Open Prompt',
        arguments: [element.uri]
      };
      treeItem.contextValue = 'userPromptFile';
      treeItem.iconPath = vscode.ThemeIcon.File;
      return treeItem;
    }
  }

  /**
   * Recursively reads directory contents and finds all prompt files
   * @param basePath The base prompts folder path (e.g., ~/.cursor/prompts/)
   * @param currentPath The current directory being processed
   * @param allowedExtensions Array of allowed file extensions
   * @returns Array of PromptFileItem with relative paths in fileName
   */
  private async readDirectoryRecursive(
    basePath: string,
    currentPath: string,
    allowedExtensions: string[]
  ): Promise<PromptFileItem[]> {
    const promptFiles: PromptFileItem[] = [];
    const currentUri = vscode.Uri.file(currentPath);

    try {
      // Read directory contents
      const entries = await vscode.workspace.fs.readDirectory(currentUri);

      for (const [name, type] of entries) {
        const itemPath = path.join(currentPath, name);

        if (type === vscode.FileType.File) {
          // Check if extension is allowed
          if (isAllowedExtension(itemPath, allowedExtensions)) {
            // Calculate relative path from basePath
            const relativePath = path.relative(basePath, itemPath);
            // Get the folder path (directory part of relative path)
            const folderPath = path.dirname(relativePath);
            // Normalize path separators for cross-platform compatibility
            const normalizedFolderPath = folderPath === '.' ? '' : folderPath.replace(/\\/g, '/');
            
            const fileUri = vscode.Uri.file(itemPath);
            promptFiles.push({
              uri: fileUri,
              fileName: path.basename(itemPath), // Just the file name, not the full path
              filePath: itemPath,
              type: 'file',
              folderPath: normalizedFolderPath
            });
          }
        } else if (type === vscode.FileType.Directory) {
          // Recursively search in subdirectories
          const subFiles = await this.readDirectoryRecursive(basePath, itemPath, allowedExtensions);
          promptFiles.push(...subFiles);
        }
      }
    } catch (error) {
      // Handle errors (permission denied, etc.) silently for subdirectories
      console.error(`Error reading directory ${currentPath}:`, error);
    }

    return promptFiles;
  }

  /**
   * Groups files by folder path and creates a hierarchical structure
   * @param files Array of prompt files with folderPath information
   * @param sourceFolder Source folder name (cursor) for labeling
   * @returns Array of folder items with their children
   */
  private groupFilesByFolder(files: PromptFileItem[], sourceFolder: string): PromptFileItem[] {
    // Group files by folder path
    const folderMap = new Map<string, PromptFileItem[]>();
    
    for (const file of files) {
      const folder = file.folderPath || ''; // Root folder if empty
      if (!folderMap.has(folder)) {
        folderMap.set(folder, []);
      }
      folderMap.get(folder)!.push(file);
    }

    const result: PromptFileItem[] = [];

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
  async getChildren(element?: PromptFileItem): Promise<PromptFileItem[]> {
    // If element is a category or folder, return its children
    if (element && (element.type === 'category' || element.type === 'folder')) {
      return element.children || [];
    }

    // If element is a file, no children
    if (element && element.type === 'file') {
      return [];
    }
    
    // Root level - get categories (Personal and Workspace)
    const items: PromptFileItem[] = [];

    // Get allowed extensions from configuration
    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);

    // Personal prompts
    const personalPromptsPaths = getPersonalPromptsPaths();
    let personalPrompts: PromptFileItem[] = [];
    
    for (const folderPath of personalPromptsPaths) {
      const folderUri = vscode.Uri.file(folderPath);

      // Check if folder exists
      try {
        await vscode.workspace.fs.stat(folderUri);
      } catch {
        // Folder doesn't exist, skip it
        continue;
      }

      // Recursively read all prompt files from this folder
      const promptFiles = await this.readDirectoryRecursive(
        folderPath,
        folderPath,
        allowedExtensions
      );

      // Mark files as personal
      promptFiles.forEach(file => {
        file.isPersonal = true;
      });

      personalPrompts.push(...promptFiles);
    }

    // Group personal prompts by their subfolders
    if (personalPrompts.length > 0) {
      const groupedPersonalPrompts = this.groupFilesByFolder(personalPrompts, 'cursor');
      items.push({
        uri: vscode.Uri.file(''), // Dummy URI for category
        fileName: 'Personal (~/.cursor)',
        filePath: '',
        type: 'category',
        isPersonal: true,
        children: groupedPersonalPrompts
      });
    }

    // Workspace prompts
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const workspacePath = workspaceFolder.uri.fsPath;
      const workspacePromptsPath = getPromptsPath(workspacePath, false);
      const folderUri = vscode.Uri.file(workspacePromptsPath);

      // Check if folder exists
      try {
        await vscode.workspace.fs.stat(folderUri);
        
        // Recursively read all prompt files from workspace
        const promptFiles = await this.readDirectoryRecursive(
          workspacePromptsPath,
          workspacePromptsPath,
          allowedExtensions
        );

        // Mark files as workspace (not personal)
        promptFiles.forEach(file => {
          file.isPersonal = false;
        });

        // Group files by their subfolders
        const groupedItems = this.groupFilesByFolder(promptFiles, 'cursor');
        
        // Add workspace category
        const workspaceName = workspaceFolder.name || 'Project';
        items.push({
          uri: vscode.Uri.file(''), // Dummy URI for category
          fileName: `${workspaceName} (workspace)`,
          filePath: workspacePromptsPath,
          type: 'category',
          isPersonal: false,
          children: groupedItems
        });
      } catch {
        // Folder doesn't exist, skip it
      }
    }

    // If no prompts exist, return empty
    if (items.length === 0) {
      return [];
    }

    return items;
  }

  /**
   * Handle drag operation - called when user starts dragging an item
   */
  async handleDrag(source: readonly PromptFileItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    // Only allow dragging files, not folders
    const files = source.filter(item => item.type === 'file' && item.uri.scheme === 'file');
    if (files.length === 0) {
      return;
    }

    // Store the dragged items in the data transfer
    dataTransfer.set(
      'application/vnd.code.tree.cursor-deeplink.userPrompts',
      new vscode.DataTransferItem(files)
    );
  }

  /**
   * Handle drop operation - called when user drops an item
   */
  async handleDrop(target: PromptFileItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    // Get the dragged items
    const transferItem = dataTransfer.get('application/vnd.code.tree.cursor-deeplink.userPrompts');
    if (!transferItem) {
      return;
    }

    const draggedItems: PromptFileItem[] = transferItem.value;
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
        const personalPromptsPaths = getPersonalPromptsPaths();
        targetFolderPath = personalPromptsPaths[0] || draggedBasePath;
      } else {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
          targetFolderPath = getPromptsPath(workspaceFolder.uri.fsPath, false);
        } else {
          targetFolderPath = draggedBasePath;
        }
      }
    } else if (target.type === 'folder') {
      // Dropped on a folder
      const draggedItem = draggedItems[0];
      const draggedBasePath = this.getBasePath(draggedItem.filePath);
      
      // Extract the actual folder path
      const folderName = target.fileName;
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
   * Get the base prompts path from a file path
   * @param filePath Full file path
   * @returns Base prompts path (.cursor/prompts or workspace/.cursor/prompts)
   */
  private getBasePath(filePath: string): string {
    // Check personal prompts paths first
    const personalPromptsPaths = getPersonalPromptsPaths();
    for (const basePath of personalPromptsPaths) {
      if (filePath.startsWith(basePath)) {
        return basePath;
      }
    }
    
    // Check workspace prompts path
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const workspacePath = workspaceFolder.uri.fsPath;
      const promptsPath = getPromptsPath(workspacePath, false);
      
      if (filePath.startsWith(promptsPath)) {
        return promptsPath;
      }
    }
    
    return '';
  }
}

