import * as vscode from 'vscode';
import * as path from 'path';
import { getCommandsPath, isAllowedExtension, getPersonalCommandsPaths } from './utils';

/**
 * Represents a command file in the tree view
 */
export interface CommandFileItem {
  uri: vscode.Uri;
  fileName: string;
  filePath: string;
}

/**
 * Tree data provider for user commands folder
 */
export class UserCommandsTreeProvider implements vscode.TreeDataProvider<CommandFileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<CommandFileItem | undefined | null | void> = new vscode.EventEmitter<CommandFileItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<CommandFileItem | undefined | null | void> = this._onDidChangeTreeData.event;

  /**
   * Refreshes the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Gets the tree item for a given element
   */
  getTreeItem(element: CommandFileItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(element.fileName, vscode.TreeItemCollapsibleState.None);
    treeItem.resourceUri = element.uri;
    treeItem.command = {
      command: 'cursor-deeplink.openUserCommand',
      title: 'Open Command',
      arguments: [element.uri]
    };
    treeItem.contextValue = 'userCommandFile';
    treeItem.iconPath = vscode.ThemeIcon.File;
    return treeItem;
  }

  /**
   * Recursively reads directory contents and finds all command files
   * @param basePath The base commands folder path (e.g., ~/.cursor/commands/)
   * @param currentPath The current directory being processed
   * @param allowedExtensions Array of allowed file extensions
   * @returns Array of CommandFileItem with relative paths in fileName
   */
  private async readDirectoryRecursive(
    basePath: string,
    currentPath: string,
    allowedExtensions: string[]
  ): Promise<CommandFileItem[]> {
    const commandFiles: CommandFileItem[] = [];
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
            // Normalize path separators for cross-platform compatibility
            const normalizedRelativePath = relativePath.replace(/\\/g, '/');
            
            const fileUri = vscode.Uri.file(itemPath);
            commandFiles.push({
              uri: fileUri,
              fileName: normalizedRelativePath,
              filePath: itemPath
            });
          }
        } else if (type === vscode.FileType.Directory) {
          // Recursively search in subdirectories
          const subFiles = await this.readDirectoryRecursive(basePath, itemPath, allowedExtensions);
          commandFiles.push(...subFiles);
        }
      }
    } catch (error) {
      // Handle errors (permission denied, etc.) silently for subdirectories
      console.error(`Error reading directory ${currentPath}:`, error);
    }

    return commandFiles;
  }

  /**
   * Gets the children of the tree (all command files in user folder, including subfolders)
   */
  async getChildren(element?: CommandFileItem): Promise<CommandFileItem[]> {
    // This is a flat tree, so no children for individual items
    if (element) {
      return [];
    }

    try {
      // Get allowed extensions from configuration
      const config = vscode.workspace.getConfiguration('cursorDeeplink');
      const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
      const viewMode = config.get<string>('personalCommandsView', 'both');

      // Get paths to folders to read from
      const folderPaths = getPersonalCommandsPaths();
      const allCommandFiles: CommandFileItem[] = [];
      const filesByFolder: { folderName: string; files: CommandFileItem[] }[] = [];

      // Read from each folder
      for (const folderPath of folderPaths) {
        const folderUri = vscode.Uri.file(folderPath);

        // Check if folder exists
        try {
          await vscode.workspace.fs.stat(folderUri);
        } catch {
          // Folder doesn't exist, skip it (don't create, as user might not want both folders)
          continue;
        }

        // Recursively read all command files from this folder
        const commandFiles = await this.readDirectoryRecursive(
          folderPath,
          folderPath,
          allowedExtensions
        );

        const folderName = folderPath.includes('.cursor') ? 'cursor' : 'claude';
        filesByFolder.push({ folderName, files: commandFiles });
        allCommandFiles.push(...commandFiles);
      }

      // Add prefix to distinguish files from different folders when showing both
      if (viewMode === 'both' && filesByFolder.length > 1) {
        // Create a map of file names (basename) to count occurrences
        const fileNameCounts = new Map<string, number>();
        for (const file of allCommandFiles) {
          const fileName = path.basename(file.fileName);
          fileNameCounts.set(fileName, (fileNameCounts.get(fileName) || 0) + 1);
        }

        // Add prefix to files that have duplicates or to all files if we have multiple folders
        for (const { folderName, files } of filesByFolder) {
          for (const file of files) {
            const fileName = path.basename(file.fileName);
            // Add prefix if there are duplicates or if we want to show folder origin for clarity
            if (fileNameCounts.get(fileName)! > 1 || filesByFolder.length > 1) {
              file.fileName = `[${folderName}] ${file.fileName}`;
            }
          }
        }
      }

      // Sort files alphabetically by relative path
      allCommandFiles.sort((a, b) => a.fileName.localeCompare(b.fileName));

      return allCommandFiles;
    } catch (error) {
      // Handle errors (folder doesn't exist, permission denied, etc.)
      console.error('Error reading user commands folder:', error);
      return [];
    }
  }
}

