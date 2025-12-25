import * as vscode from 'vscode';
import * as path from 'path';
import { generateDeeplink } from './deeplinkGenerator';
import { importDeeplink } from './deeplinkImporter';
import { getFileTypeFromPath, isAllowedExtension, getUserHomePath, getCommandsPath, getCommandsFolderName, sanitizeFileName, getPersonalCommandsPaths } from './utils';
import { DeeplinkCodeLensProvider } from './codelensProvider';
import { HttpCodeLensProvider } from './httpCodeLensProvider';
import { UserCommandsTreeProvider, CommandFileItem } from './userCommandsTreeProvider';
import { sendToChat, sendSelectionToChat, buildPromptDeeplink, MAX_DEEPLINK_LENGTH } from './sendToChat';
import { AnnotationPanel, AnnotationParams } from './annotationPanel';
import { executeHttpRequestFromFile, getExecutionTime } from './httpRequestExecutor';
import * as fs from 'fs';

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
  // Register HTTP Response Content Provider for custom tab titles
  const httpResponseProvider = new (class implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri): string {
      // Extract the original file path from the custom scheme
      // Format: http-response:///filename?originalPath=...&time=...
      const queryParams = new URLSearchParams(uri.query);
      const originalPath = queryParams.get('originalPath');
      if (originalPath) {
        try {
          const originalUri = vscode.Uri.parse(originalPath);
          return fs.readFileSync(originalUri.fsPath, 'utf8');
        } catch (error) {
          // If parsing fails, try to use the path directly
          try {
            return fs.readFileSync(originalPath, 'utf8');
          } catch {
            return '';
          }
        }
      }
      return '';
    }
  })();
  
  const httpResponseProviderDisposable = vscode.workspace.registerTextDocumentContentProvider(
    'http-response',
    httpResponseProvider
  );

  // Listen for tab changes to update titles with execution time
  const updateTabTitles = () => {
    const tabGroups = vscode.window.tabGroups.all;
    for (const group of tabGroups) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputText) {
          const uri = tab.input.uri;
          const executionTime = getExecutionTime(uri);
          if (executionTime && uri.scheme === 'file') {
            // Check if it's a response file
            const filePath = uri.fsPath;
            if (filePath.endsWith('.res') || filePath.endsWith('.response')) {
              // The tab label cannot be directly modified, but we can use the custom scheme
              // The custom scheme URI will show the time in the path/query
            }
          }
        }
      }
    }
  };

  // Update tab titles when tabs change
  const tabChangeDisposable = vscode.window.tabGroups.onDidChangeTabs(() => {
    updateTabTitles();
  });

  // Register CodeLens Provider for all files
  const codeLensProvider = new DeeplinkCodeLensProvider();
  const codeLensDisposable = vscode.languages.registerCodeLensProvider(
    '*',
    codeLensProvider
  );

  // Register HTTP CodeLens Provider for HTTP request files
  const httpCodeLensProvider = new HttpCodeLensProvider();
  const httpCodeLensDisposable = vscode.languages.registerCodeLensProvider(
    '*',
    httpCodeLensProvider
  );

  // Generic command to generate deeplink (opens selector)
  const generateCommand = vscode.commands.registerCommand(
    'cursor-commands-toys.generate',
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
    'cursor-commands-toys.generate-command',
    async (uri?: vscode.Uri) => {
      await generateDeeplinkWithValidation(uri, 'command');
    }
  );

  // Specific command to generate rule deeplink
  const generateRuleSpecific = vscode.commands.registerCommand(
    'cursor-commands-toys.generate-rule',
    async (uri?: vscode.Uri) => {
      await generateDeeplinkWithValidation(uri, 'rule');
    }
  );

  // Specific command to generate prompt deeplink
  const generatePromptSpecific = vscode.commands.registerCommand(
    'cursor-commands-toys.generate-prompt',
    async (uri?: vscode.Uri) => {
      await generateDeeplinkWithValidation(uri, 'prompt');
    }
  );

  // Command to import deeplink
  const importCommand = vscode.commands.registerCommand(
    'cursor-commands-toys.import',
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
    'cursor-commands-toys.save-as-user-command',
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
    showCollapseAll: false,
    dragAndDropController: userCommandsTreeProvider
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
    'cursor-commands-toys.openUserCommand',
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
    'cursor-commands-toys.generateUserCommandDeeplink',
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
    'cursor-commands-toys.deleteUserCommand',
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
    'cursor-commands-toys.revealUserCommand',
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
    'cursor-commands-toys.renameUserCommand',
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
    'cursor-commands-toys.refreshUserCommands',
    () => {
      userCommandsTreeProvider.refresh();
    }
  );

  // Command to send text to chat
  const sendToChatCommand = vscode.commands.registerCommand(
    'cursor-commands-toys.sendToChat',
    async () => {
      const text = await vscode.window.showInputBox({
        prompt: 'Digite o texto para enviar ao chat do Cursor',
        placeHolder: 'Texto ou código...'
      });

      if (text) {
        await sendToChat(text);
      }
    }
  );

  // Command to send selection to chat
  const sendSelectionToChatCommand = vscode.commands.registerCommand(
    'cursor-commands-toys.sendSelectionToChat',
    async () => {
      await sendSelectionToChat();
    }
  );

  // Command to copy selection as prompt deeplink
  const copySelectionAsPromptCommand = vscode.commands.registerCommand(
    'cursor-commands-toys.copySelectionAsPrompt',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('Nenhum editor ativo');
        return;
      }

      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);

      if (!selectedText.trim()) {
        vscode.window.showWarningMessage('Nenhum texto selecionado');
        return;
      }

      try {
        // Incluir contexto do arquivo (similar ao sendSelectionToChat)
        const fileUri = editor.document.uri;
        const language = editor.document.languageId;
        const lineStart = selection.start.line + 1; // Linha baseada em 1
        const lineEnd = selection.end.line + 1;
        const lineInfo = lineStart === lineEnd 
          ? `Line: ${lineStart}`
          : `Lines: ${lineStart}-${lineEnd}`;
        
        // Obter caminho relativo ao workspace se disponível
        let filePath: string;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
        if (workspaceFolder) {
          const relativePath = path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath);
          // Normalizar separadores de caminho para compatibilidade cross-platform
          filePath = relativePath.replace(/\\/g, '/');
        } else {
          // Se não houver workspace, usar apenas o nome do arquivo
          filePath = path.basename(fileUri.fsPath);
        }
        
        // Construir texto com contexto
        const contextInfo = `File: ${filePath}\nLanguage: ${language}\n${lineInfo}\n\n---\n\n`;
        const fullText = contextInfo + selectedText;

        // Gerar deeplink de prompt com contexto
        const deeplink = buildPromptDeeplink(fullText);
        
        // Validar tamanho
        if (deeplink.length > MAX_DEEPLINK_LENGTH) {
          vscode.window.showErrorMessage(
            `Texto muito longo (${deeplink.length} caracteres). Limite: ${MAX_DEEPLINK_LENGTH} caracteres.`
          );
          return;
        }

        // Copiar para área de transferência
        await vscode.env.clipboard.writeText(deeplink);
        vscode.window.showInformationMessage('Deeplink de prompt copiado para a área de transferência!');
      } catch (error) {
        vscode.window.showErrorMessage(`Erro ao copiar deeplink: ${error}`);
      }
    }
  );

  // Command to send HTTP request
  const sendHttpRequestCommand = vscode.commands.registerCommand(
    'cursor-commands-toys.sendHttpRequest',
    async (uri?: vscode.Uri, startLine?: number, endLine?: number, sectionTitle?: string) => {
      let requestUri: vscode.Uri;
      
      if (uri) {
        requestUri = uri;
      } else {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage('No file selected');
          return;
        }
        requestUri = editor.document.uri;
      }

      await executeHttpRequestFromFile(requestUri, startLine, endLine, sectionTitle);
    }
  );

  // Register URI Handler for cursor://godrix.cursor-deeplink/* and vscode://godrix.cursor-deeplink/* deeplinks
  const uriHandler = vscode.window.registerUriHandler({
    handleUri(uri: vscode.Uri) {
      // Suporta ambos os formatos:
      // - cursor://godrix.cursor-deeplink/annotation?...
      // - vscode://godrix.cursor-deeplink/annotation?...
      const isAnnotationPath = uri.path === '/annotation' || uri.path === 'annotation';
      
      if (isAnnotationPath) {
        const params: AnnotationParams = {};
        const query = new URLSearchParams(uri.query);
        query.forEach((value, key) => {
          params[key] = value;
        });
        
        AnnotationPanel.createOrShow(params);
      }
    }
  });

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
    httpResponseProviderDisposable,
    tabChangeDisposable,
    codeLensDisposable,
    httpCodeLensDisposable,
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
    configWatcher,
    sendToChatCommand,
    sendSelectionToChatCommand,
    copySelectionAsPromptCommand,
    sendHttpRequestCommand,
    uriHandler
  );
}

export function deactivate() {}

