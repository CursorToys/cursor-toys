import * as vscode from 'vscode';
import * as path from 'path';
import { generateDeeplink } from './deeplinkGenerator';
import { importDeeplink } from './deeplinkImporter';
import { getFileTypeFromPath, isAllowedExtension, getUserHomePath, getCommandsPath, getCommandsFolderName, sanitizeFileName, getPersonalCommandsPaths } from './utils';
import { DeeplinkCodeLensProvider } from './codelensProvider';
import { UserCommandsTreeProvider, CommandFileItem } from './userCommandsTreeProvider';

/**
 * Helper function to generate deeplink with validations
 */
async function generateDeeplinkWithValidation(
  uri: vscode.Uri | undefined,
  forcedType?: 'command' | 'rule' | 'prompt'
): Promise<void> {
  // If no URI, try to get from active editor
  let filePath: string;
  
  if (uri) {
    filePath = uri.fsPath;
  } else {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No file selected');
      return;
    }
    filePath = editor.document.uri.fsPath;
  }

  // Validate extension
  const config = vscode.workspace.getConfiguration('cursorDeeplink');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md']);
  
  if (!isAllowedExtension(filePath, allowedExtensions)) {
    vscode.window.showErrorMessage(
      `File extension is not in the allowed extensions list: ${allowedExtensions.join(', ')}`
    );
    return;
  }

  // Generate deeplink
  const deeplink = await generateDeeplink(filePath, forcedType);
  if (deeplink) {
    // Copy to clipboard
    await vscode.env.clipboard.writeText(deeplink);
    vscode.window.showInformationMessage('Deeplink copied to clipboard!');
  }
}

export function activate(context: vscode.ExtensionContext) {
  // Register CodeLens Provider for all files
  const codeLensProvider = new DeeplinkCodeLensProvider();
  const codeLensDisposable = vscode.languages.registerCodeLensProvider(
    '*',
    codeLensProvider
  );

  // Generic command to generate deeplink (opens selector)
  const generateCommand = vscode.commands.registerCommand(
    'cursor-deeplink.generate',
    async (uri?: vscode.Uri) => {
      const fileType = await vscode.window.showQuickPick(
        [
          { label: 'Command', value: 'command' as const },
          { label: 'Rule', value: 'rule' as const },
          { label: 'Prompt', value: 'prompt' as const }
        ],
        {
          placeHolder: 'Select the deeplink type'
        }
      );

      if (fileType) {
        await generateDeeplinkWithValidation(uri, fileType.value);
      }
    }
  );

  // Specific command to generate command deeplink
  const generateCommandSpecific = vscode.commands.registerCommand(
    'cursor-deeplink.generate-command',
    async (uri?: vscode.Uri) => {
      await generateDeeplinkWithValidation(uri, 'command');
    }
  );

  // Specific command to generate rule deeplink
  const generateRuleSpecific = vscode.commands.registerCommand(
    'cursor-deeplink.generate-rule',
    async (uri?: vscode.Uri) => {
      await generateDeeplinkWithValidation(uri, 'rule');
    }
  );

  // Specific command to generate prompt deeplink
  const generatePromptSpecific = vscode.commands.registerCommand(
    'cursor-deeplink.generate-prompt',
    async (uri?: vscode.Uri) => {
      await generateDeeplinkWithValidation(uri, 'prompt');
    }
  );

  // Command to import deeplink
  const importCommand = vscode.commands.registerCommand(
    'cursor-deeplink.import',
    async () => {
      const url = await vscode.window.showInputBox({
        prompt: 'Paste the Cursor deeplink',
        placeHolder: 'cursor://anysphere.cursor-deeplink/... or https://cursor.com/link/...',
        validateInput: (value) => {
          if (!value) {
            return 'Please enter a deeplink';
          }
          if (!value.includes('cursor-deeplink') && !value.includes('cursor.com/link')) {
            return 'Invalid URL. Must be a Cursor deeplink';
          }
          return null;
        }
      });

      if (url) {
        await importDeeplink(url);
      }
    }
  );

  // Command to save command file as user command (in ~/.cursor/commands)
  const saveAsUserCommand = vscode.commands.registerCommand(
    'cursor-deeplink.save-as-user-command',
    async (uri?: vscode.Uri) => {
      try {
        // Get file URI
        let fileUri: vscode.Uri;
        if (uri) {
          fileUri = uri;
        } else {
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            vscode.window.showErrorMessage('No file selected');
            return;
          }
          fileUri = editor.document.uri;
        }

        const filePath = fileUri.fsPath;
        const normalizedPath = filePath.replace(/\\/g, '/');

        // Verify file is in commands folder (either .cursor/commands/ or .claude/commands/)
        if (!normalizedPath.includes('/.cursor/commands/') && !normalizedPath.includes('/.claude/commands/')) {
          vscode.window.showErrorMessage('This command can only be used on files in .cursor/commands/ or .claude/commands/ folder');
          return;
        }

        // Get workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage('No workspace open');
          return;
        }

        // Read file content
        const fileContent = await vscode.workspace.fs.readFile(fileUri);
        const fileName = path.basename(filePath);

        // Determine destination path using configuration (~/.cursor/commands or ~/.claude/commands)
        const userCommandsPath = getCommandsPath(undefined, true);
        const destinationUri = vscode.Uri.file(path.join(userCommandsPath, fileName));

        // Check if file already exists in destination
        let fileExists = false;
        try {
          await vscode.workspace.fs.stat(destinationUri);
          fileExists = true;
        } catch {
          // File doesn't exist, that's fine
        }

        if (fileExists) {
          const overwrite = await vscode.window.showWarningMessage(
            `File ${fileName} already exists in ~/.cursor/commands. Do you want to overwrite it?`,
            'Yes',
            'No'
          );
          if (overwrite !== 'Yes') {
            return;
          }
        }

        // Create destination folder if it doesn't exist
        const folderUri = vscode.Uri.file(userCommandsPath);
        try {
          await vscode.workspace.fs.stat(folderUri);
        } catch {
          // Folder doesn't exist, create it
          await vscode.workspace.fs.createDirectory(folderUri);
        }

        // Write file to destination
        await vscode.workspace.fs.writeFile(destinationUri, fileContent);

        vscode.window.showInformationMessage(`Command saved to ~/.cursor/commands/${fileName}`);

        // Ask if user wants to remove the original file
        const removeOriginal = await vscode.window.showWarningMessage(
          'Do you want to remove the original file from the workspace?',
          'Yes',
          'No'
        );

        if (removeOriginal === 'Yes') {
          try {
            await vscode.workspace.fs.delete(fileUri);
            vscode.window.showInformationMessage('Original file removed from workspace');
          } catch (error) {
            vscode.window.showErrorMessage(`Error removing original file: ${error}`);
          }
        }

        // Open the saved file
        const document = await vscode.workspace.openTextDocument(destinationUri);
        await vscode.window.showTextDocument(document);
      } catch (error) {
        vscode.window.showErrorMessage(`Error saving as user command: ${error}`);
      }
    }
  );

  // Register User Commands Tree Provider
  const userCommandsTreeProvider = new UserCommandsTreeProvider();
  const userCommandsTreeView = vscode.window.createTreeView('cursor-deeplink.userCommands', {
    treeDataProvider: userCommandsTreeProvider,
    showCollapseAll: false
  });

  /**
   * Helper function to get URI from command argument (can be CommandFileItem or vscode.Uri)
   */
  function getUriFromArgument(arg: CommandFileItem | vscode.Uri | undefined): vscode.Uri | null {
    if (!arg) {
      return null;
    }
    if (arg instanceof vscode.Uri) {
      return arg;
    }
    if ('uri' in arg) {
      return arg.uri;
    }
    return null;
  }

  /**
   * Helper function to get file name from command argument
   */
  function getFileNameFromArgument(arg: CommandFileItem | vscode.Uri | undefined): string {
    if (!arg) {
      return 'file';
    }
    if (arg instanceof vscode.Uri) {
      return path.basename(arg.fsPath);
    }
    if ('fileName' in arg) {
      return arg.fileName;
    }
    return 'file';
  }

  /**
   * Helper function to get file path from command argument
   */
  function getFilePathFromArgument(arg: CommandFileItem | vscode.Uri | undefined): string | null {
    if (!arg) {
      return null;
    }
    if (arg instanceof vscode.Uri) {
      return arg.fsPath;
    }
    if ('filePath' in arg) {
      return arg.filePath;
    }
    return null;
  }

  // Command to open user command file
  const openUserCommand = vscode.commands.registerCommand(
    'cursor-deeplink.openUserCommand',
    async (arg?: CommandFileItem | vscode.Uri) => {
      const uri = getUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      try {
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);
      } catch (error) {
        vscode.window.showErrorMessage(`Error opening file: ${error}`);
      }
    }
  );

  // Command to generate deeplink for user command
  const generateUserCommandDeeplink = vscode.commands.registerCommand(
    'cursor-deeplink.generateUserCommandDeeplink',
    async (arg?: CommandFileItem | vscode.Uri) => {
      const uri = getUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      await generateDeeplinkWithValidation(uri, 'command');
    }
  );

  // Command to delete user command
  const deleteUserCommand = vscode.commands.registerCommand(
    'cursor-deeplink.deleteUserCommand',
    async (arg?: CommandFileItem | vscode.Uri) => {
      const uri = getUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      const fileName = getFileNameFromArgument(arg);
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete "${fileName}"?`,
        'Yes',
        'No'
      );

      if (confirm === 'Yes') {
        try {
          await vscode.workspace.fs.delete(uri);
          vscode.window.showInformationMessage(`Command "${fileName}" deleted`);
          userCommandsTreeProvider.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(`Error deleting file: ${error}`);
        }
      }
    }
  );

  // Command to reveal user command in folder
  const revealUserCommand = vscode.commands.registerCommand(
    'cursor-deeplink.revealUserCommand',
    async (arg?: CommandFileItem | vscode.Uri) => {
      const uri = getUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      try {
        await vscode.commands.executeCommand('revealFileInOS', uri);
      } catch (error) {
        vscode.window.showErrorMessage(`Error revealing file: ${error}`);
      }
    }
  );

  // Command to rename user command
  const renameUserCommand = vscode.commands.registerCommand(
    'cursor-deeplink.renameUserCommand',
    async (arg?: CommandFileItem | vscode.Uri) => {
      const uri = getUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      const currentFileName = getFileNameFromArgument(arg);
      const currentFilePath = getFilePathFromArgument(arg);
      
      if (!currentFilePath) {
        vscode.window.showErrorMessage('Unable to determine file path');
        return;
      }

      const config = vscode.workspace.getConfiguration('cursorDeeplink');
      const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);

      const newName = await vscode.window.showInputBox({
        prompt: 'Enter new file name',
        value: currentFileName,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'File name cannot be empty';
          }

          // Check if extension is allowed
          const ext = path.extname(value);
          const extWithoutDot = ext.startsWith('.') ? ext.substring(1) : ext;
          if (!allowedExtensions.includes(extWithoutDot.toLowerCase())) {
            return `Extension must be one of: ${allowedExtensions.join(', ')}`;
          }

          // Sanitize and check if name is valid
          const sanitized = sanitizeFileName(value);
          if (sanitized !== path.parse(value).name) {
            return 'File name contains invalid characters';
          }

          // Check if file already exists
          const newPath = path.join(path.dirname(currentFilePath), value);
          if (newPath === currentFilePath) {
            return null; // Same name, no error
          }

          return null;
        }
      });

      if (newName && newName !== currentFileName) {
        try {
          const newPath = path.join(path.dirname(currentFilePath), newName);
          const newUri = vscode.Uri.file(newPath);

          // Check if file already exists
          try {
            await vscode.workspace.fs.stat(newUri);
            const overwrite = await vscode.window.showWarningMessage(
              `File "${newName}" already exists. Do you want to overwrite it?`,
              'Yes',
              'No'
            );
            if (overwrite !== 'Yes') {
              return;
            }
          } catch {
            // File doesn't exist, that's fine
          }

          await vscode.workspace.fs.rename(uri, newUri, { overwrite: true });
          vscode.window.showInformationMessage(`Command renamed to "${newName}"`);
          userCommandsTreeProvider.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(`Error renaming file: ${error}`);
        }
      }
    }
  );

  // Command to refresh user commands tree
  const refreshUserCommands = vscode.commands.registerCommand(
    'cursor-deeplink.refreshUserCommands',
    () => {
      userCommandsTreeProvider.refresh();
    }
  );

  // File system watchers to update tree when files change
  // Create watchers for all folders that might be watched
  const createWatchers = (): vscode.FileSystemWatcher[] => {
    const watchers: vscode.FileSystemWatcher[] = [];
    const folderPaths = getPersonalCommandsPaths();
    
    for (const folderPath of folderPaths) {
      const folderUri = vscode.Uri.file(folderPath);
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folderUri, '**/*')
      );

      watcher.onDidCreate(() => {
        userCommandsTreeProvider.refresh();
      });

      watcher.onDidDelete(() => {
        userCommandsTreeProvider.refresh();
      });

      watcher.onDidChange(() => {
        // Optionally refresh on file changes (not just create/delete)
        // userCommandsTreeProvider.refresh();
      });

      watchers.push(watcher);
    }
    
    return watchers;
  };

  let userCommandsWatchers = createWatchers();

  // Watch for configuration changes
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('cursorDeeplink.commandsFolder') || 
        e.affectsConfiguration('cursorDeeplink.personalCommandsView')) {
      // Dispose old watchers
      userCommandsWatchers.forEach(watcher => watcher.dispose());
      // Create new watchers based on updated configuration
      userCommandsWatchers = createWatchers();
      userCommandsTreeProvider.refresh();
    }
  });

  // Add all watchers to subscriptions
  userCommandsWatchers.forEach(watcher => {
    context.subscriptions.push(watcher);
  });

  context.subscriptions.push(
    codeLensDisposable,
    generateCommand,
    generateCommandSpecific,
    generateRuleSpecific,
    generatePromptSpecific,
    importCommand,
    saveAsUserCommand,
    userCommandsTreeView,
    openUserCommand,
    generateUserCommandDeeplink,
    deleteUserCommand,
    revealUserCommand,
    renameUserCommand,
    refreshUserCommands,
    configWatcher
  );
}

export function deactivate() {}

