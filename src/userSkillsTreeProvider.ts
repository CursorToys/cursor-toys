import * as vscode from 'vscode';
import * as path from 'path';
import { getSkillsPath, getPersonalSkillsPaths, isSkillFolder, getBaseFolderName } from './utils';

/**
 * Represents a tree item (can be a category, folder or a file)
 */
export type SkillTreeItemType = 'category' | 'folder' | 'file';

/**
 * Represents a skill folder or file in the tree view
 */
export interface SkillFileItem {
  uri: vscode.Uri;
  fileName: string;
  filePath: string;
  type: SkillTreeItemType;
  folderPath?: string; // Relative folder path for grouping
  isPersonal?: boolean; // Whether this is from personal folder
  children?: SkillFileItem[]; // Children for folder/category items
}

/**
 * Tree data provider for user skills folder with drag and drop support
 */
export class UserSkillsTreeProvider implements vscode.TreeDataProvider<SkillFileItem>, vscode.TreeDragAndDropController<SkillFileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SkillFileItem | undefined | null | void> = new vscode.EventEmitter<SkillFileItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SkillFileItem | undefined | null | void> = this._onDidChangeTreeData.event;

  // Drag and drop support
  dropMimeTypes = ['application/vnd.code.tree.cursor-deeplink.userSkills'];
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
  getTreeItem(element: SkillFileItem): vscode.TreeItem {
    if (element.type === 'category') {
      // Category item (Personal or Workspace)
      const treeItem = new vscode.TreeItem(
        element.fileName,
        vscode.TreeItemCollapsibleState.Expanded
      );
      treeItem.iconPath = new vscode.ThemeIcon('folder');
      treeItem.contextValue = 'skillCategory';
      return treeItem;
    } else if (element.type === 'folder') {
      // Skill folder item
      const treeItem = new vscode.TreeItem(
        element.fileName,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      treeItem.iconPath = vscode.ThemeIcon.Folder;
      treeItem.contextValue = 'userSkillFolder';
      return treeItem;
    } else {
      // SKILL.md file item
      const treeItem = new vscode.TreeItem(element.fileName, vscode.TreeItemCollapsibleState.None);
      treeItem.resourceUri = element.uri;
      treeItem.command = {
        command: 'cursor-toys.openSkill',
        title: 'Open Skill',
        arguments: [element.uri]
      };
      treeItem.contextValue = 'userSkillFile';
      treeItem.iconPath = new vscode.ThemeIcon('book');
      return treeItem;
    }
  }

  /**
   * Recursively reads directory contents and finds all skill folders (folders containing SKILL.md)
   * @param basePath The base skills folder path (e.g., workspace/.cursor/skills/)
   * @param currentPath The current directory being processed
   * @returns Array of SkillFileItem representing skill folders and their SKILL.md files
   */
  private async readDirectoryRecursive(
    basePath: string,
    currentPath: string
  ): Promise<SkillFileItem[]> {
    const skillItems: SkillFileItem[] = [];
    const currentUri = vscode.Uri.file(currentPath);

    try {
      // Read directory contents
      const entries = await vscode.workspace.fs.readDirectory(currentUri);

      for (const [name, type] of entries) {
        const itemPath = path.join(currentPath, name);

        if (type === vscode.FileType.Directory) {
          // Check if this directory is a skill folder (contains SKILL.md)
          const isSkill = await isSkillFolder(itemPath);
          
          if (isSkill) {
            // This is a skill folder - create item for it
            const skillFilePath = path.join(itemPath, 'SKILL.md');
            const skillFileUri = vscode.Uri.file(skillFilePath);
            
            // Calculate relative path from basePath
            const relativePath = path.relative(basePath, itemPath);
            // Get the folder path (directory part of relative path)
            const folderPath = path.dirname(relativePath);
            // Normalize path separators for cross-platform compatibility
            const normalizedFolderPath = folderPath === '.' ? '' : folderPath.replace(/\\/g, '/');
            
            // Create the skill folder item with SKILL.md as child
            skillItems.push({
              uri: vscode.Uri.file(itemPath), // URI to the skill folder
              fileName: name, // Skill folder name
              filePath: itemPath,
              type: 'folder',
              folderPath: normalizedFolderPath,
              children: [{
                uri: skillFileUri,
                fileName: 'SKILL.md',
                filePath: skillFilePath,
                type: 'file',
                folderPath: relativePath
              }]
            });
          } else {
            // Not a skill folder, recursively search in subdirectories
            const subItems = await this.readDirectoryRecursive(basePath, itemPath);
            skillItems.push(...subItems);
          }
        }
      }
    } catch (error) {
      // Handle errors (permission denied, etc.) silently for subdirectories
      console.error(`Error reading directory ${currentPath}:`, error);
    }

    return skillItems;
  }

  /**
   * Groups skill folders by folder path and creates a hierarchical structure
   * @param items Array of skill folder items with folderPath information
   * @returns Array of folder items with their children
   */
  private groupSkillsByFolder(items: SkillFileItem[]): SkillFileItem[] {
    // Group items by folder path
    const folderMap = new Map<string, SkillFileItem[]>();
    
    for (const item of items) {
      const folder = item.folderPath || ''; // Root folder if empty
      if (!folderMap.has(folder)) {
        folderMap.set(folder, []);
      }
      folderMap.get(folder)!.push(item);
    }

    const result: SkillFileItem[] = [];

    // Sort folder keys (root first, then alphabetically)
    const sortedFolders = Array.from(folderMap.keys()).sort((a, b) => {
      if (a === '' && b !== '') return -1; // Root first
      if (a !== '' && b === '') return 1;
      return a.localeCompare(b);
    });

    for (const folderPath of sortedFolders) {
      const itemsInFolder = folderMap.get(folderPath)!;
      
      // Sort items alphabetically
      itemsInFolder.sort((a, b) => a.fileName.localeCompare(b.fileName));

      if (folderPath === '') {
        // Root folder - add items directly
        result.push(...itemsInFolder);
      } else {
        // Create folder item
        const folderName = path.basename(folderPath);
        
        result.push({
          uri: vscode.Uri.file(''), // Dummy URI for folder
          fileName: folderName,
          filePath: folderPath,
          type: 'folder',
          folderPath: folderPath,
          children: itemsInFolder
        });
      }
    }

    return result;
  }

  /**
   * Gets the children of the tree (categories, folders and files)
   */
  async getChildren(element?: SkillFileItem): Promise<SkillFileItem[]> {
    // If element is a category or folder, return its children
    if (element && (element.type === 'category' || element.type === 'folder')) {
      return element.children || [];
    }

    // If element is a file, no children
    if (element && element.type === 'file') {
      return [];
    }
    
    // Root level - get categories (Personal and Workspace)
    const items: SkillFileItem[] = [];

    // Personal skills
    const personalSkillsPaths = getPersonalSkillsPaths();
    let personalSkills: SkillFileItem[] = [];
    
    for (const folderPath of personalSkillsPaths) {
      const folderUri = vscode.Uri.file(folderPath);

      // Check if folder exists
      try {
        await vscode.workspace.fs.stat(folderUri);
      } catch {
        // Folder doesn't exist, skip it
        continue;
      }

      // Recursively read all skill folders from this folder
      const skillItems = await this.readDirectoryRecursive(
        folderPath,
        folderPath
      );

      // Mark items as personal
      skillItems.forEach(item => {
        item.isPersonal = true;
        if (item.children) {
          item.children.forEach(child => {
            child.isPersonal = true;
          });
        }
      });

      personalSkills.push(...skillItems);
    }

    // Group personal skills by their subfolders
    if (personalSkills.length > 0) {
      const groupedPersonalSkills = this.groupSkillsByFolder(personalSkills);
      items.push({
        uri: vscode.Uri.file(''), // Dummy URI for category
        fileName: 'Personal (~/.cursor)',
        filePath: '',
        type: 'category',
        isPersonal: true,
        children: groupedPersonalSkills
      });
    }

    // Workspace skills
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const workspacePath = workspaceFolder.uri.fsPath;
      const workspaceSkillsPath = getSkillsPath(workspacePath, false);
      const folderUri = vscode.Uri.file(workspaceSkillsPath);

      // Check if folder exists
      try {
        await vscode.workspace.fs.stat(folderUri);
        
        // Recursively read all skill folders from workspace
        const skillItems = await this.readDirectoryRecursive(
          workspaceSkillsPath,
          workspaceSkillsPath
        );

        // Mark items as workspace (not personal)
        skillItems.forEach(item => {
          item.isPersonal = false;
          if (item.children) {
            item.children.forEach(child => {
              child.isPersonal = false;
            });
          }
        });

        // Group items by their subfolders
        const groupedItems = this.groupSkillsByFolder(skillItems);
        
        // Add workspace category
        const workspaceName = workspaceFolder.name || 'Project';
        items.push({
          uri: vscode.Uri.file(''), // Dummy URI for category
          fileName: `${workspaceName} (workspace)`,
          filePath: workspaceSkillsPath,
          type: 'category',
          isPersonal: false,
          children: groupedItems
        });
      } catch {
        // Folder doesn't exist, skip it
      }
    }

    // If no skills exist, return empty
    if (items.length === 0) {
      return [];
    }

    return items;
  }

  /**
   * Handle drag operation - called when user starts dragging an item
   */
  async handleDrag(source: readonly SkillFileItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    // Allow dragging skill folders (type === 'folder' with children) or SKILL.md files
    const draggableItems = source.filter(item => 
      (item.type === 'folder' && item.children) || 
      (item.type === 'file' && item.uri.scheme === 'file')
    );
    
    if (draggableItems.length === 0) {
      return;
    }

    // Store the dragged items in the data transfer
    dataTransfer.set(
      'application/vnd.code.tree.cursor-deeplink.userSkills',
      new vscode.DataTransferItem(draggableItems)
    );
  }

  /**
   * Handle drop operation - called when user drops an item
   */
  async handleDrop(target: SkillFileItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    // Get the dragged items
    const transferItem = dataTransfer.get('application/vnd.code.tree.cursor-deeplink.userSkills');
    if (!transferItem) {
      return;
    }

    const draggedItems: SkillFileItem[] = transferItem.value;
    if (!draggedItems || draggedItems.length === 0) {
      return;
    }

    // Determine the target folder
    let targetFolderPath: string;

    if (!target) {
      // Dropped on root - shouldn't happen but handle it
      vscode.window.showErrorMessage('Cannot drop skills on root. Please drop on a folder.');
      return;
    }

    if (target.type === 'category') {
      // Dropped on a category - determine base path based on category
      const draggedItem = draggedItems[0];
      const draggedBasePath = this.getBasePath(draggedItem.filePath);
      
      // Use the category's base path
      if (target.isPersonal) {
        const personalSkillsPaths = getPersonalSkillsPaths();
        targetFolderPath = personalSkillsPaths[0] || draggedBasePath;
      } else {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
          targetFolderPath = getSkillsPath(workspaceFolder.uri.fsPath, false);
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
      // Dropped on a file - move to the same folder as the target file's parent
      const targetSkillFolder = path.dirname(target.filePath);
      targetFolderPath = path.dirname(targetSkillFolder); // Parent of skill folder
    }

    // Move each dragged skill folder
    for (const item of draggedItems) {
      try {
        if (item.type === 'folder') {
          // Moving a skill folder
          const skillFolderName = path.basename(item.filePath);
          const sourceUri = vscode.Uri.file(item.filePath);
          const targetUri = vscode.Uri.file(path.join(targetFolderPath, skillFolderName));

          // Check if target already exists
          try {
            await vscode.workspace.fs.stat(targetUri);
            const overwrite = await vscode.window.showWarningMessage(
              `Skill folder "${skillFolderName}" already exists in the target folder. Overwrite?`,
              'Yes', 'No'
            );
            if (overwrite !== 'Yes') {
              continue;
            }
          } catch {
            // Folder doesn't exist, proceed
          }

          // Move the entire skill folder
          await vscode.workspace.fs.rename(sourceUri, targetUri, { overwrite: true });
          vscode.window.showInformationMessage(`Moved skill "${skillFolderName}" successfully!`);
        } else if (item.type === 'file') {
          // Moving SKILL.md file (shouldn't happen normally, but handle it)
          const fileName = path.basename(item.filePath);
          const sourceUri = item.uri;
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
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to move "${item.fileName}": ${error}`);
      }
    }

    // Refresh the tree view
    this.refresh();
  }

  /**
   * Get the base skills path from a file path
   * @param filePath Full file path
   * @returns Base skills path (.cursor/skills or workspace/.cursor/skills)
   */
  private getBasePath(filePath: string): string {
    // Check personal skills paths first
    const personalSkillsPaths = getPersonalSkillsPaths();
    for (const basePath of personalSkillsPaths) {
      if (filePath.startsWith(basePath)) {
        return basePath;
      }
    }
    
    // Check workspace skills path
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const workspacePath = workspaceFolder.uri.fsPath;
      const skillsPath = getSkillsPath(workspacePath, false);
      
      if (filePath.startsWith(skillsPath)) {
        return skillsPath;
      }
    }
    
    return '';
  }
}
