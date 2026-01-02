import * as vscode from 'vscode';
import * as path from 'path';
import { generateDeeplink } from './deeplinkGenerator';
import { importDeeplink } from './deeplinkImporter';
import { generateShareable, generateShareableWithPath, generateShareableForHttpFolder, generateShareableForEnvFolder, generateShareableForHttpFolderWithEnv, generateShareableForCommandFolder, generateShareableForRuleFolder, generateShareableForPromptFolder, generateShareableForNotepadFolder, generateShareableForProject, generateGistShareable, generateGistShareableForBundle } from './shareableGenerator';
import { importShareable, importFromGist } from './shareableImporter';
import { getFileTypeFromPath, isAllowedExtension, getUserHomePath, getCommandsPath, getCommandsFolderName, sanitizeFileName, getPersonalCommandsPaths, getPromptsPath, getPersonalPromptsPaths, getNotepadsPath, getBaseFolderName, getHttpPath, getEnvironmentsPath, getEnvironmentsFolderName } from './utils';
import { DeeplinkCodeLensProvider } from './codelensProvider';
import { HttpCodeLensProvider } from './httpCodeLensProvider';
import { EnvCodeLensProvider } from './envCodeLensProvider';
import { UserCommandsTreeProvider, CommandFileItem } from './userCommandsTreeProvider';
import { UserPromptsTreeProvider, PromptFileItem } from './userPromptsTreeProvider';
import { UserNotepadsTreeProvider, NotepadFileItem } from './userNotepadsTreeProvider';
import { sendToChat, sendSelectionToChat, buildPromptDeeplink, MAX_DEEPLINK_LENGTH } from './sendToChat';
import { AnnotationPanel, AnnotationParams } from './annotationPanel';
import { executeHttpRequestFromFile, getExecutionTime, copyCurlCommand } from './httpRequestExecutor';
import { EnvironmentManager } from './environmentManager';
import { HttpVariableHoverProvider, HttpEnvironmentCompletionProvider, HttpEnvironmentDecorationProvider } from './httpEnvironmentProviders';
import { minifyFile, formatMinificationStats, detectFileType } from './minifier';
import { trimClipboardAuto, trimClipboardWithPrompt } from './clipboardProcessor';
import { GistManager } from './gistManager';
import { RecommendationsManager } from './recommendationsManager';
import { RecommendationsBrowserPanel } from './recommendationsBrowserPanel';
import * as fs from 'fs';

/**
 * Checks recommendations on workspace startup (with delay)
 */
async function checkRecommendationsOnStartup(manager: RecommendationsManager): Promise<void> {
  // Delay to not slow down activation
  setTimeout(async () => {
    try {
      if (await manager.shouldShowRecommendations()) {
        const context = await manager.detectProjectContext();
        const recommendations = await manager.getRecommendationsForContext(context);
        
        if (recommendations.length > 0) {
          const totalItems = recommendations.reduce((sum, rec) => sum + rec.items.length, 0);
          
          const action = await vscode.window.showInformationMessage(
            `CursorToys Marketplace has ${totalItems} recommended items for your project`,
            'Open Marketplace',
            'Not Now',
            "Don't Show Again"
          );

          if (action === 'Open Marketplace') {
            // This will be handled by the command
            vscode.commands.executeCommand('cursor-toys.browseRecommendations');
          } else if (action === "Don't Show Again") {
            await vscode.workspace.getConfiguration('cursorToys').update(
              'recommendationsEnabled',
              false,
              vscode.ConfigurationTarget.Global
            );
          }

          await manager.markRecommendationsShown();
        }
      }
    } catch (error) {
      console.error('Error checking recommendations on startup:', error);
    }
  }, 5000); // 5 seconds delay
}

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
  const config = vscode.workspace.getConfiguration('cursorToys');
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

/**
 * Helper function to generate shareable with validations
 */
async function generateShareableWithValidation(
  uri: vscode.Uri | undefined,
  forcedType?: 'command' | 'rule' | 'prompt' | 'notepad' | 'http' | 'env'
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

  // Validate extension based on type
  if (forcedType === 'http' || forcedType === 'env') {
    // HTTP and ENV types have their own validation in generateShareable
  } else {
    // For command, rule, prompt - validate with allowed extensions
    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md']);
    
    if (!isAllowedExtension(filePath, allowedExtensions)) {
      vscode.window.showErrorMessage(
        `File extension is not in the allowed extensions list: ${allowedExtensions.join(', ')}`
      );
      return;
    }
  }

  // Generate shareable
  const shareable = await generateShareable(filePath, forcedType);
  if (shareable) {
    // Copy to clipboard
    await vscode.env.clipboard.writeText(shareable);
    const typeLabel = forcedType === 'http' ? 'HTTP request' : forcedType === 'env' ? 'Environment' : 'CursorToys';
    vscode.window.showInformationMessage(`${typeLabel} shareable copied to clipboard!`);
  }
}

/**
 * Helper function to generate shareable with path validation
 */
async function generateShareableWithPathValidation(
  uri: vscode.Uri | undefined,
  forcedType: 'http' | 'env'
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

  // Generate shareable with path
  const shareable = await generateShareableWithPath(filePath, forcedType);
  if (shareable) {
    // Copy to clipboard
    await vscode.env.clipboard.writeText(shareable);
    const typeLabel = forcedType === 'http' ? 'HTTP request' : 'Environment';
    vscode.window.showInformationMessage(`${typeLabel} shareable (with folder structure) copied to clipboard!`);
  }
}

export function activate(context: vscode.ExtensionContext) {
  // Initialize Environment Manager
  const envManager = EnvironmentManager.getInstance();
  
  // Initialize Recommendations Manager
  const recsManager = RecommendationsManager.getInstance(context);
  
  // Create Status Bar Item for CursorToys Menu
  const cursorToysStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  cursorToysStatusBarItem.text = '$(github-action) CursorToys';
  cursorToysStatusBarItem.tooltip = 'Open CursorToys Menu';
  cursorToysStatusBarItem.command = 'cursor-toys.showMenu';
  cursorToysStatusBarItem.show();
  context.subscriptions.push(cursorToysStatusBarItem);
  
  // Register CursorToys Menu command
  context.subscriptions.push(
    vscode.commands.registerCommand('cursor-toys.showMenu', async () => {
      const items: vscode.QuickPickItem[] = [
        {
          label: '$(compass) Open Marketplace',
          description: 'Browse and install recommended commands, prompts and rules',
          detail: 'Marketplace'
        },
        {
          label: '$(refresh) Refresh Recommendations',
          description: 'Update recommendations cache',
          detail: 'Recommendations'
        },
        {
          label: '$(search) Check Recommendations',
          description: 'Check recommendations for current project',
          detail: 'Recommendations'
        },
        {
          label: '$(link) Generate Deeplink',
          description: 'Generate shareable deeplink from current file',
          detail: 'Deeplinks'
        },
        {
          label: '$(cloud-download) Import from URL',
          description: 'Import command, prompt or rule from deeplink or Gist',
          detail: 'Import'
        },
        {
          label: '$(globe) Import from Gist',
          description: 'Import directly from GitHub Gist URL',
          detail: 'Import'
        },
        {
          label: '$(comment) Send to Chat',
          description: 'Send current file or selection to Cursor chat',
          detail: 'Chat'
        },
        {
          label: '$(terminal) HTTP Request',
          description: 'Execute HTTP request from .http file',
          detail: 'HTTP Client'
        }
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a CursorToys action',
        matchOnDescription: true,
        matchOnDetail: true
      });

      if (!selected) {
        return;
      }

      // Map selection to command
      const commandMap: { [key: string]: string } = {
        'Open Marketplace': 'cursor-toys.browseRecommendations',
        'Refresh Recommendations': 'cursor-toys.refreshRecommendations',
        'Check Recommendations': 'cursor-toys.checkRecommendations',
        'Generate Deeplink': 'cursor-toys.generate',
        'Import from URL': 'cursor-toys.import',
        'Import from Gist': 'cursor-toys.importFromGist',
        'Send to Chat': 'cursor-toys.sendToChat',
        'HTTP Request': 'cursor-toys.http.execute'
      };

      const commandId = commandMap[selected.label.replace(/\$\([^)]+\)\s*/, '')];
      if (commandId) {
        await vscode.commands.executeCommand(commandId);
      }
    })
  );
  
  // Register HTTP environment providers
  const httpHoverProvider = new HttpVariableHoverProvider();
  const httpHoverDisposable = vscode.languages.registerHoverProvider(
    { pattern: '**/*.{req,request}' },
    httpHoverProvider
  );

  const httpCompletionProvider = new HttpEnvironmentCompletionProvider();
  const httpCompletionDisposable = vscode.languages.registerCompletionItemProvider(
    { pattern: '**/*.{req,request}' },
    httpCompletionProvider,
    ' ' // Trigger on space after @env
  );

  // Register environment decorator provider
  const decorationProvider = new HttpEnvironmentDecorationProvider();
  
  // Update decorations when editor changes
  const updateDecorations = () => {
    decorationProvider.updateDecorations();
  };

  // Initial decoration
  updateDecorations();

  // Update on active editor change
  const activeEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
    decorationProvider.triggerUpdateDecorations();
  });

  // Update on document change
  const documentChangeDisposable = vscode.workspace.onDidChangeTextDocument(() => {
    decorationProvider.triggerUpdateDecorations();
  });

  // Update on visible editors change
  const visibleEditorsChangeDisposable = vscode.window.onDidChangeVisibleTextEditors(() => {
    decorationProvider.triggerUpdateDecorations();
  });
  
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

  // Register ENV CodeLens Provider for environment files
  const envCodeLensProvider = new EnvCodeLensProvider();
  const envCodeLensDisposable = vscode.languages.registerCodeLensProvider(
    { scheme: 'file', pattern: '**/.env*' },
    envCodeLensProvider
  );

  // Specific command to generate command deeplink
  const generateCommandSpecific = vscode.commands.registerCommand(
    'cursor-toys.generate-command',
    async (uri?: vscode.Uri) => {
      await generateDeeplinkWithValidation(uri, 'command');
    }
  );

  // Specific command to generate rule deeplink
  const generateRuleSpecific = vscode.commands.registerCommand(
    'cursor-toys.generate-rule',
    async (uri?: vscode.Uri) => {
      await generateDeeplinkWithValidation(uri, 'rule');
    }
  );

  // Specific command to generate prompt deeplink
  const generatePromptSpecific = vscode.commands.registerCommand(
    'cursor-toys.generate-prompt',
    async (uri?: vscode.Uri) => {
      await generateDeeplinkWithValidation(uri, 'prompt');
    }
  );

  // Specific command to generate command shareable
  const generateShareableCommandSpecific = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysCommand',
    async (uri?: vscode.Uri) => {
      await generateShareableWithValidation(uri, 'command');
    }
  );

  // Specific command to generate rule shareable
  const generateShareableRuleSpecific = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysRule',
    async (uri?: vscode.Uri) => {
      await generateShareableWithValidation(uri, 'rule');
    }
  );

  // Specific command to generate prompt shareable
  const generateShareablePromptSpecific = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysPrompt',
    async (uri?: vscode.Uri) => {
      await generateShareableWithValidation(uri, 'prompt');
    }
  );

  // Specific command to generate notepad shareable
  const generateShareableNotepadSpecific = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysNotepad',
    async (uri?: vscode.Uri) => {
      await generateShareableWithValidation(uri, 'notepad');
    }
  );

  // Specific command to generate HTTP shareable
  const generateShareableHttpSpecific = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysHttp',
    async (uri?: vscode.Uri) => {
      await generateShareableWithValidation(uri, 'http');
    }
  );

  // Specific command to generate ENV shareable
  const generateShareableEnvSpecific = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysEnv',
    async (uri?: vscode.Uri) => {
      await generateShareableWithValidation(uri, 'env');
    }
  );

  // Specific command to generate HTTP shareable with path
  const generateShareableHttpWithPathSpecific = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysHttpWithPath',
    async (uri?: vscode.Uri) => {
      await generateShareableWithPathValidation(uri, 'http');
    }
  );

  // Specific command to generate ENV shareable with path
  const generateShareableEnvWithPathSpecific = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysEnvWithPath',
    async (uri?: vscode.Uri) => {
      await generateShareableWithPathValidation(uri, 'env');
    }
  );

  // Command to share entire HTTP folder
  const shareHttpFolderCommand = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysHttpFolder',
    async (uri?: vscode.Uri) => {
      try {
        let folderPath: string;
        
        if (uri) {
          // Get folder path from URI
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.type !== vscode.FileType.Directory) {
            vscode.window.showErrorMessage('Please select a folder');
            return;
          }
          folderPath = uri.fsPath;
        } else {
          vscode.window.showErrorMessage('Please select a folder');
          return;
        }

        // Generate shareables for all files in folder
        const shareables = await generateShareableForHttpFolder(folderPath);
        if (shareables && shareables.length > 0) {
          // Join all shareables with newlines
          const shareableText = shareables.join('\n');
          
          // Copy to clipboard
          await vscode.env.clipboard.writeText(shareableText);
          
          vscode.window.showInformationMessage(
            `${shareables.length} HTTP request(s) copied to clipboard as CursorToys shareable!`
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error generating folder shareable: ${error}`);
      }
    }
  );

  // Command to share entire ENV folder
  const shareEnvFolderCommand = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysEnvFolder',
    async (uri?: vscode.Uri) => {
      try {
        let folderPath: string;
        
        if (uri) {
          // Get folder path from URI
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.type !== vscode.FileType.Directory) {
            vscode.window.showErrorMessage('Please select a folder');
            return;
          }
          folderPath = uri.fsPath;
        } else {
          vscode.window.showErrorMessage('Please select a folder');
          return;
        }

        // Generate shareables for all files in folder
        const shareables = await generateShareableForEnvFolder(folderPath);
        if (shareables && shareables.length > 0) {
          // Join all shareables with newlines
          const shareableText = shareables.join('\n');
          
          // Copy to clipboard
          await vscode.env.clipboard.writeText(shareableText);
          
          vscode.window.showInformationMessage(
            `${shareables.length} environment file(s) copied to clipboard as CursorToys shareable!`
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error generating folder shareable: ${error}`);
      }
    }
  );

  // Command to share HTTP folder with environments
  const shareHttpFolderWithEnvCommand = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysHttpFolderWithEnv',
    async (uri?: vscode.Uri) => {
      try {
        let folderPath: string;
        
        if (uri) {
          // Get folder path from URI
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.type !== vscode.FileType.Directory) {
            vscode.window.showErrorMessage('Please select a folder');
            return;
          }
          folderPath = uri.fsPath;
        } else {
          vscode.window.showErrorMessage('Please select a folder');
          return;
        }

        // Generate shareables for all files in folder
        const shareable = await generateShareableForHttpFolderWithEnv(folderPath);
        if (shareable) {
          // Copy to clipboard
          await vscode.env.clipboard.writeText(shareable);
          
          vscode.window.showInformationMessage(
            `HTTP + Environments bundle copied to clipboard as CursorToys shareable!`
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error generating folder shareable: ${error}`);
      }
    }
  );

  // Command to share command folder as bundle
  const shareCommandFolderCommand = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysCommandFolder',
    async (uri?: vscode.Uri) => {
      try {
        let folderPath: string;
        
        if (uri) {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.type !== vscode.FileType.Directory) {
            vscode.window.showErrorMessage('Please select a folder');
            return;
          }
          folderPath = uri.fsPath;
        } else {
          vscode.window.showErrorMessage('Please select a folder');
          return;
        }

        const shareable = await generateShareableForCommandFolder(folderPath);
        if (shareable) {
          await vscode.env.clipboard.writeText(shareable);
          vscode.window.showInformationMessage('Commands bundle copied to clipboard!');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error generating command bundle: ${error}`);
      }
    }
  );

  // Command to share rule folder as bundle
  const shareRuleFolderCommand = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysRuleFolder',
    async (uri?: vscode.Uri) => {
      try {
        let folderPath: string;
        
        if (uri) {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.type !== vscode.FileType.Directory) {
            vscode.window.showErrorMessage('Please select a folder');
            return;
          }
          folderPath = uri.fsPath;
        } else {
          vscode.window.showErrorMessage('Please select a folder');
          return;
        }

        const shareable = await generateShareableForRuleFolder(folderPath);
        if (shareable) {
          await vscode.env.clipboard.writeText(shareable);
          vscode.window.showInformationMessage('Rules bundle copied to clipboard!');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error generating rule bundle: ${error}`);
      }
    }
  );

  // Command to share prompt folder as bundle
  const sharePromptFolderCommand = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysPromptFolder',
    async (uri?: vscode.Uri) => {
      try {
        let folderPath: string;
        
        if (uri) {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.type !== vscode.FileType.Directory) {
            vscode.window.showErrorMessage('Please select a folder');
            return;
          }
          folderPath = uri.fsPath;
        } else {
          vscode.window.showErrorMessage('Please select a folder');
          return;
        }

        const shareable = await generateShareableForPromptFolder(folderPath);
        if (shareable) {
          await vscode.env.clipboard.writeText(shareable);
          vscode.window.showInformationMessage('Prompts bundle copied to clipboard!');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error generating prompt bundle: ${error}`);
      }
    }
  );

  // Command to share notepad folder as bundle
  const shareNotepadFolderCommand = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysNotepadFolder',
    async (uri?: vscode.Uri) => {
      try {
        let folderPath: string;
        
        if (uri) {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.type !== vscode.FileType.Directory) {
            vscode.window.showErrorMessage('Please select a folder');
            return;
          }
          folderPath = uri.fsPath;
        } else {
          vscode.window.showErrorMessage('Please select a folder');
          return;
        }

        const shareable = await generateShareableForNotepadFolder(folderPath);
        if (shareable) {
          await vscode.env.clipboard.writeText(shareable);
          vscode.window.showInformationMessage('Notepads bundle copied to clipboard!');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error generating notepad bundle: ${error}`);
      }
    }
  );

  // Command to share entire project (.cursor folder)
  const shareProjectCommand = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysProject',
    async (uri?: vscode.Uri) => {
      try {
        let folderPath: string;
        
        if (uri) {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.type !== vscode.FileType.Directory) {
            vscode.window.showErrorMessage('Please select a folder');
            return;
          }
          folderPath = uri.fsPath;
        } else {
          vscode.window.showErrorMessage('Please select a folder');
          return;
        }

        const shareable = await generateShareableForProject(folderPath);
        if (shareable) {
          await vscode.env.clipboard.writeText(shareable);
          vscode.window.showInformationMessage('Project bundle copied to clipboard!');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error generating project bundle: ${error}`);
      }
    }
  );

  // Unified command to import both deeplink, shareable and Gist
  const importCommand = vscode.commands.registerCommand(
    'cursor-toys.import',
    async () => {
      const url = await vscode.window.showInputBox({
        prompt: 'Paste your CursorToys link (supports: files, bundles, deeplinks, Gists)',
        placeHolder: 'cursortoys://... or cursor://... or https://cursor.com/link/... or https://gist.github.com/...',
        validateInput: (value) => {
          if (!value) {
            return 'Please enter a link';
          }
          // Accept deeplink formats, cursortoys format, and gist URLs/IDs
          const isDeeplink = value.includes('cursor-deeplink') || value.includes('cursor.com/link');
          const isCursorToys = value.startsWith('cursortoys://');
          const isGist = value.includes('gist.github.com') || value.includes('gist.githubusercontent.com') || /^[a-f0-9]+$/i.test(value.trim());
          
          if (!isDeeplink && !isCursorToys && !isGist) {
            return 'Invalid link. Must be a Cursor deeplink, CursorToys shareable, or GitHub Gist URL/ID';
          }
          return null;
        }
      });

      if (url) {
        const trimmedUrl = url.trim();
        
        // Check if it's a Gist URL or ID
        const gistManager = GistManager.getInstance(context);
        const gistId = gistManager.parseGistUrl(trimmedUrl);
        
        if (gistId) {
          // It's a Gist - import from Gist
          try {
            await importFromGist(trimmedUrl, context);
          } catch (error) {
            vscode.window.showErrorMessage(`Error importing from Gist: ${error}`);
          }
        } else if (trimmedUrl.startsWith('cursortoys://')) {
          // It's a CursorToys shareable
          await importShareable(trimmedUrl);
        } else {
          // It's a deeplink
          await importDeeplink(trimmedUrl);
        }
      }
    }
  );

  // Command to save command file as user command (in ~/.cursor/commands)
  const saveAsUserCommand = vscode.commands.registerCommand(
    'cursor-toys.save-as-user-command',
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

        // Verify file is in commands folder (supports .cursor, .claude, or custom base folder)
        const baseFolderName = getBaseFolderName();
        const isInCommandsFolder = normalizedPath.includes('/.cursor/commands/') || 
                                   normalizedPath.includes('/.claude/commands/') ||
                                   normalizedPath.includes(`/.${baseFolderName}/commands/`);
        
        if (!isInCommandsFolder) {
          vscode.window.showErrorMessage('This command can only be used on files in commands folder');
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

  // Command to save prompt file as user prompt (in ~/.cursor/prompts)
  const saveAsUserPrompt = vscode.commands.registerCommand(
    'cursor-toys.save-as-user-prompt',
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

        // Verify file is in prompts folder
        const baseFolderName = getBaseFolderName();
        if (!normalizedPath.includes(`/.${baseFolderName}/prompts/`) && 
            !normalizedPath.includes('/.cursor/prompts/')) {
          vscode.window.showErrorMessage('This command can only be used on files in prompts folder');
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

        // Determine destination path (~/.cursor/prompts)
        const userPromptsPath = getPromptsPath(undefined, true);
        const destinationUri = vscode.Uri.file(path.join(userPromptsPath, fileName));

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
            `File ${fileName} already exists in ~/.cursor/prompts. Do you want to overwrite it?`,
            'Yes',
            'No'
          );
          if (overwrite !== 'Yes') {
            return;
          }
        }

        // Create destination folder if it doesn't exist
        const folderUri = vscode.Uri.file(userPromptsPath);
        try {
          await vscode.workspace.fs.stat(folderUri);
        } catch {
          // Folder doesn't exist, create it
          await vscode.workspace.fs.createDirectory(folderUri);
        }

        // Write file to destination
        await vscode.workspace.fs.writeFile(destinationUri, fileContent);

        vscode.window.showInformationMessage(`Prompt saved to ~/.cursor/prompts/${fileName}`);

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
        vscode.window.showErrorMessage(`Error saving as user prompt: ${error}`);
      }
    }
  );

  // Register User Commands Tree Provider
  const userCommandsTreeProvider = new UserCommandsTreeProvider();
  const userCommandsTreeView = vscode.window.createTreeView('cursor-toys.userCommands', {
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
    'cursor-toys.openUserCommand',
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
    'cursor-toys.generateUserCommandDeeplink',
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
    'cursor-toys.deleteUserCommand',
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
    'cursor-toys.revealUserCommand',
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
    'cursor-toys.renameUserCommand',
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

      const config = vscode.workspace.getConfiguration('cursorToys');
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
    'cursor-toys.refreshUserCommands',
    () => {
      userCommandsTreeProvider.refresh();
    }
  );

  // Register User Prompts Tree Provider
  const userPromptsTreeProvider = new UserPromptsTreeProvider();
  const userPromptsTreeView = vscode.window.createTreeView('cursor-toys.userPrompts', {
    treeDataProvider: userPromptsTreeProvider,
    showCollapseAll: false,
    dragAndDropController: userPromptsTreeProvider
  });

  /**
   * Helper function to get URI from prompt command argument (can be PromptFileItem or vscode.Uri)
   */
  function getPromptUriFromArgument(arg: PromptFileItem | vscode.Uri | undefined): vscode.Uri | null {
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
   * Helper function to get file name from prompt command argument
   */
  function getPromptFileNameFromArgument(arg: PromptFileItem | vscode.Uri | undefined): string {
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
   * Helper function to get file path from prompt command argument
   */
  function getPromptFilePathFromArgument(arg: PromptFileItem | vscode.Uri | undefined): string | null {
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

  // Command to open user prompt file
  const openUserPrompt = vscode.commands.registerCommand(
    'cursor-toys.openUserPrompt',
    async (arg?: PromptFileItem | vscode.Uri) => {
      const uri = getPromptUriFromArgument(arg);
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

  // Command to generate deeplink for user prompt
  const generateUserPromptDeeplink = vscode.commands.registerCommand(
    'cursor-toys.generateUserPromptDeeplink',
    async (arg?: PromptFileItem | vscode.Uri) => {
      const uri = getPromptUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      await generateDeeplinkWithValidation(uri, 'prompt');
    }
  );

  // Command to delete user prompt
  const deleteUserPrompt = vscode.commands.registerCommand(
    'cursor-toys.deleteUserPrompt',
    async (arg?: PromptFileItem | vscode.Uri) => {
      const uri = getPromptUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      const fileName = getPromptFileNameFromArgument(arg);
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete "${fileName}"?`,
        'Yes',
        'No'
      );

      if (confirm === 'Yes') {
        try {
          await vscode.workspace.fs.delete(uri);
          vscode.window.showInformationMessage(`Prompt "${fileName}" deleted`);
          userPromptsTreeProvider.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(`Error deleting file: ${error}`);
        }
      }
    }
  );

  // Command to reveal user prompt in folder
  const revealUserPrompt = vscode.commands.registerCommand(
    'cursor-toys.revealUserPrompt',
    async (arg?: PromptFileItem | vscode.Uri) => {
      const uri = getPromptUriFromArgument(arg);
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

  // Command to rename user prompt
  const renameUserPrompt = vscode.commands.registerCommand(
    'cursor-toys.renameUserPrompt',
    async (arg?: PromptFileItem | vscode.Uri) => {
      const uri = getPromptUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      const currentFileName = getPromptFileNameFromArgument(arg);
      const currentFilePath = getPromptFilePathFromArgument(arg);
      
      if (!currentFilePath) {
        vscode.window.showErrorMessage('Unable to determine file path');
        return;
      }

      const config = vscode.workspace.getConfiguration('cursorToys');
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
          vscode.window.showInformationMessage(`Prompt renamed to "${newName}"`);
          userPromptsTreeProvider.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(`Error renaming file: ${error}`);
        }
      }
    }
  );

  // Command to refresh user prompts tree
  const refreshUserPrompts = vscode.commands.registerCommand(
    'cursor-toys.refreshUserPrompts',
    () => {
      userPromptsTreeProvider.refresh();
    }
  );

  // Register User Notepads Tree Provider
  const userNotepadsTreeProvider = new UserNotepadsTreeProvider();
  const userNotepadsTreeView = vscode.window.createTreeView('cursor-toys.userNotepads', {
    treeDataProvider: userNotepadsTreeProvider,
    showCollapseAll: false,
    dragAndDropController: userNotepadsTreeProvider
  });

  /**
   * Helper function to get URI from notepad command argument (can be NotepadFileItem or vscode.Uri)
   */
  function getNotepadUriFromArgument(arg: NotepadFileItem | vscode.Uri | undefined): vscode.Uri | null {
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
   * Helper function to get file name from notepad command argument
   */
  function getNotepadFileNameFromArgument(arg: NotepadFileItem | vscode.Uri | undefined): string {
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
   * Helper function to get file path from notepad command argument
   */
  function getNotepadFilePathFromArgument(arg: NotepadFileItem | vscode.Uri | undefined): string | null {
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

  // Command to create new notepad
  const createNotepad = vscode.commands.registerCommand(
    'cursor-toys.createNotepad',
    async () => {
      try {
        // Check if workspace is open
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage('No workspace open. Notepads are workspace-specific.');
          return;
        }

        // Ask for notepad name
        const notepadName = await vscode.window.showInputBox({
          prompt: 'Enter notepad name',
          placeHolder: 'my-notepad',
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Notepad name cannot be empty';
            }
            // Sanitize and check if name is valid
            const sanitized = sanitizeFileName(value);
            if (sanitized.length === 0) {
              return 'Notepad name contains invalid characters';
            }
            return null;
          }
        });

        if (!notepadName) {
          return;
        }

        // Get configuration
        const config = vscode.workspace.getConfiguration('cursorToys');
        const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
        const defaultExtension = allowedExtensions[0] || 'md';

        // Sanitize name and add extension
        const sanitized = sanitizeFileName(notepadName);
        const fileName = `${sanitized}.${defaultExtension}`;

        // Get notepads path (project only)
        const workspacePath = workspaceFolder.uri.fsPath;
        const notepadsPath = getNotepadsPath(workspacePath, false);
        const fullPath = path.join(notepadsPath, fileName);
        const fileUri = vscode.Uri.file(fullPath);

        // Check if file already exists
        try {
          await vscode.workspace.fs.stat(fileUri);
          const overwrite = await vscode.window.showWarningMessage(
            `Notepad "${fileName}" already exists. Do you want to overwrite it?`,
            'Yes',
            'No'
          );
          if (overwrite !== 'Yes') {
            return;
          }
        } catch {
          // File doesn't exist, that's fine
        }

        // Create folder if it doesn't exist
        const folderUri = vscode.Uri.file(notepadsPath);
        try {
          await vscode.workspace.fs.stat(folderUri);
        } catch {
          await vscode.workspace.fs.createDirectory(folderUri);
        }

        // Create file with initial content
        const initialContent = `# ${notepadName}\n\n`;
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(initialContent, 'utf8'));

        vscode.window.showInformationMessage(`Notepad "${fileName}" created!`);
        userNotepadsTreeProvider.refresh();

        // Open file
        const document = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(document);
      } catch (error) {
        vscode.window.showErrorMessage(`Error creating notepad: ${error}`);
      }
    }
  );

  // Command to open user notepad file
  const openNotepad = vscode.commands.registerCommand(
    'cursor-toys.openNotepad',
    async (arg?: NotepadFileItem | vscode.Uri) => {
      const uri = getNotepadUriFromArgument(arg);
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

  // Command to generate shareable for user notepad
  const generateNotepadShareable = vscode.commands.registerCommand(
    'cursor-toys.generateNotepadShareable',
    async (arg?: NotepadFileItem | vscode.Uri) => {
      const uri = getNotepadUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      await generateShareableWithValidation(uri, 'notepad');
    }
  );

  // Command to delete user notepad
  const deleteNotepad = vscode.commands.registerCommand(
    'cursor-toys.deleteNotepad',
    async (arg?: NotepadFileItem | vscode.Uri) => {
      const uri = getNotepadUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      const fileName = getNotepadFileNameFromArgument(arg);
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete "${fileName}"?`,
        'Yes',
        'No'
      );

      if (confirm === 'Yes') {
        try {
          await vscode.workspace.fs.delete(uri);
          vscode.window.showInformationMessage(`Notepad "${fileName}" deleted`);
          userNotepadsTreeProvider.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(`Error deleting file: ${error}`);
        }
      }
    }
  );

  // Command to reveal user notepad in folder
  const revealNotepad = vscode.commands.registerCommand(
    'cursor-toys.revealNotepad',
    async (arg?: NotepadFileItem | vscode.Uri) => {
      const uri = getNotepadUriFromArgument(arg);
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

  // Command to rename user notepad
  const renameNotepad = vscode.commands.registerCommand(
    'cursor-toys.renameNotepad',
    async (arg?: NotepadFileItem | vscode.Uri) => {
      const uri = getNotepadUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      const currentFileName = getNotepadFileNameFromArgument(arg);
      const currentFilePath = getNotepadFilePathFromArgument(arg);
      
      if (!currentFilePath) {
        vscode.window.showErrorMessage('Unable to determine file path');
        return;
      }

      const config = vscode.workspace.getConfiguration('cursorToys');
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
          vscode.window.showInformationMessage(`Notepad renamed to "${newName}"`);
          userNotepadsTreeProvider.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(`Error renaming file: ${error}`);
        }
      }
    }
  );

  // Command to refresh user notepads tree
  const refreshNotepads = vscode.commands.registerCommand(
    'cursor-toys.refreshNotepads',
    () => {
      userNotepadsTreeProvider.refresh();
    }
  );

  // Command to send text to chat
  const sendToChatCommand = vscode.commands.registerCommand(
    'cursor-toys.sendToChat',
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
    'cursor-toys.sendSelectionToChat',
    async () => {
      await sendSelectionToChat();
    }
  );

  // Command to copy selection as prompt deeplink
  const copySelectionAsPromptCommand = vscode.commands.registerCommand(
    'cursor-toys.copySelectionAsPrompt',
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
    'cursor-toys.sendHttpRequest',
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

  // Command to copy cURL command
  const copyCurlCommandCommand = vscode.commands.registerCommand(
    'cursor-toys.copyCurlCommand',
    async (uri?: vscode.Uri, startLine?: number, endLine?: number) => {
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

      await copyCurlCommand(requestUri, startLine, endLine);
    }
  );

  // Command to select environment
  const selectEnvironmentCommand = vscode.commands.registerCommand(
    'cursor-toys.selectEnvironment',
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;
      const envManager = EnvironmentManager.getInstance();
      const availableEnvs = envManager.getAvailableEnvironments(workspacePath);

      if (availableEnvs.length === 0) {
        vscode.window.showWarningMessage(
          'No environment files found. Right-click on .cursor/http/ folder and select "Create Environments Folder" to set up environment variables.'
        );
        return;
      }

      const activeEnv = envManager.getActiveEnvironment();
      const items = availableEnvs.map(name => ({
        label: name,
        description: name === activeEnv ? '(active)' : '',
        picked: name === activeEnv
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select HTTP environment'
      });

      if (selected) {
        envManager.setActiveEnvironment(selected.label);
        envManager.clearCache(); // Clear cache to reload variables
        vscode.window.showInformationMessage(`Environment set to: ${selected.label}`);
      }
    }
  );

  // Command to open environments folder
  const openEnvironmentsCommand = vscode.commands.registerCommand(
    'cursor-toys.openEnvironments',
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;
      const envDir = getEnvironmentsPath(workspacePath);

      // Check if directory exists
      if (!fs.existsSync(envDir)) {
        const baseFolderName = getBaseFolderName();
        vscode.window.showWarningMessage(
          `Environments folder not found. Right-click on .${baseFolderName}/http/ folder and select "Create Environments Folder" to set up environment variables.`
        );
        return;
      }

      // Open folder in file explorer
      const envDirUri = vscode.Uri.file(envDir);
      await vscode.commands.executeCommand('revealFileInOS', envDirUri);
    }
  );

  // Command to create new environment
  const createEnvironmentCommand = vscode.commands.registerCommand(
    'cursor-toys.createEnvironment',
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;
      const envManager = EnvironmentManager.getInstance();

      const envName = await vscode.window.showInputBox({
        prompt: 'Enter environment name (e.g., staging, qa, prod)',
        placeHolder: 'staging',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Environment name cannot be empty';
          }
          if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
            return 'Environment name can only contain letters, numbers, hyphens and underscores';
          }
          return null;
        }
      });

      if (envName) {
        const created = await envManager.createEnvironment(envName, workspacePath);
        if (created) {
          vscode.window.showInformationMessage(`Environment '${envName}' created successfully`);
          
          // Open the file
          const fileName = envName === 'default' ? '.env' : `.env.${envName}`;
          const envDir = getEnvironmentsPath(workspacePath);
          const filePath = path.join(envDir, fileName);
          const fileUri = vscode.Uri.file(filePath);
          const document = await vscode.workspace.openTextDocument(fileUri);
          await vscode.window.showTextDocument(document);
        } else {
          vscode.window.showErrorMessage(`Environment '${envName}' already exists`);
        }
      }
    }
  );

  // Command to initialize environments folder structure
  const initializeEnvironmentsCommand = vscode.commands.registerCommand(
    'cursor-toys.initializeEnvironments',
    async (uri?: vscode.Uri) => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;
      const envDir = getEnvironmentsPath(workspacePath);

      // Check if directory already exists
      if (fs.existsSync(envDir)) {
        const files = fs.readdirSync(envDir);
        if (files.some(f => f.startsWith('.env'))) {
          vscode.window.showWarningMessage('Environments folder already exists with environment files.');
          return;
        }
      }

      const envManager = EnvironmentManager.getInstance();
      await envManager.initializeDefaultEnvironments(workspacePath);
      const baseFolderName = getBaseFolderName();
      vscode.window.showInformationMessage(`Environments folder created successfully at .${baseFolderName}/http/environments/`);
      
      // Open the folder in explorer
      const envDirUri = vscode.Uri.file(envDir);
      await vscode.commands.executeCommand('revealFileInOS', envDirUri);
    }
  );

  // Command to minify file
  const minifyFileCommand = vscode.commands.registerCommand(
    'cursor-toys.minifyFile',
    async (uri?: vscode.Uri) => {
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

      // Get configuration
      const config = vscode.workspace.getConfiguration('cursorToys.minify');
      const suffix = config.get<string>('outputSuffix', '.min');

      // Detect file type
      const fileType = detectFileType(filePath);
      
      if (fileType === 'unknown') {
        vscode.window.showErrorMessage('File type not supported for minification');
        return;
      }

      // Confirm with user
      const fileName = path.basename(filePath);
      const parsedPath = path.parse(filePath);
      const outputFileName = `${parsedPath.name}${suffix}${parsedPath.ext}`;
      
      const confirm = await vscode.window.showInformationMessage(
        `Minify ${fileName}? Output will be saved as ${outputFileName}`,
        'Yes', 'No'
      );

      if (confirm !== 'Yes') {
        return;
      }

      // Show progress
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Minifying file...',
        cancellable: false
      }, async (progress) => {
        try {
          const result = await minifyFile(filePath, suffix);
          
          if (!result.success) {
            vscode.window.showErrorMessage(`Failed to minify: ${result.error}`);
            return;
          }

          const stats = formatMinificationStats(result);
          vscode.window.showInformationMessage(`File minified! ${stats}`);

          // Ask if user wants to open the minified file
          if (result.outputPath) {
            const openFile = await vscode.window.showInformationMessage(
              'Open minified file?',
              'Yes', 'No'
            );

            if (openFile === 'Yes') {
              const outputUri = vscode.Uri.file(result.outputPath);
              const document = await vscode.workspace.openTextDocument(outputUri);
              await vscode.window.showTextDocument(document);
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Error minifying file: ${errorMessage}`);
        }
      });
    }
  );

  // Command to trim clipboard (auto detect)
  const trimClipboardCommand = vscode.commands.registerCommand(
    'cursor-toys.trimClipboard',
    async () => {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Processing clipboard...',
        cancellable: false
      }, async (progress) => {
        await trimClipboardAuto();
      });
    }
  );

  // Command to trim clipboard with type selection prompt
  const trimClipboardWithPromptCommand = vscode.commands.registerCommand(
    'cursor-toys.trimClipboardWithPrompt',
    async () => {
      await trimClipboardWithPrompt();
    }
  );

  // Command to share file via GitHub Gist
  const shareViaGistCommand = vscode.commands.registerCommand(
    'cursor-toys.shareViaGist',
    async (uri?: vscode.Uri) => {
      try {
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

        // Detect file type
        const fileType = getFileTypeFromPath(filePath);
        if (!fileType) {
          vscode.window.showErrorMessage('File must be in commands/, rules/, prompts/, notepads/, http/ or http/environments/ folder');
          return;
        }

        // Generate Gist
        const gistUrl = await generateGistShareable(filePath, fileType, context);
        
        if (gistUrl) {
          // Copy to clipboard
          await vscode.env.clipboard.writeText(gistUrl);
          vscode.window.showInformationMessage('Gist created successfully! URL copied to clipboard.');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error sharing via Gist: ${error}`);
      }
    }
  );

  // Command to share folder via GitHub Gist
  const shareFolderViaGistCommand = vscode.commands.registerCommand(
    'cursor-toys.shareFolderViaGist',
    async (uri?: vscode.Uri) => {
      try {
        if (!uri) {
          vscode.window.showErrorMessage('Please select a folder');
          return;
        }

        // Check if it's a folder
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type !== vscode.FileType.Directory) {
          vscode.window.showErrorMessage('Please select a folder');
          return;
        }

        const folderPath = uri.fsPath;
        const folderName = path.basename(folderPath);

        // Determine bundle type based on folder name/location
        let bundleType: 'command' | 'rule' | 'prompt' | 'notepad' | 'http' | 'project' | null = null;
        
        if (folderName === 'commands' || folderPath.includes('/commands')) {
          bundleType = 'command';
        } else if (folderName === 'rules' || folderPath.includes('/rules')) {
          bundleType = 'rule';
        } else if (folderName === 'prompts' || folderPath.includes('/prompts')) {
          bundleType = 'prompt';
        } else if (folderName === 'notepads' || folderPath.includes('/notepads')) {
          bundleType = 'notepad';
        } else if (folderName === 'http' || folderPath.includes('/http')) {
          bundleType = 'http';
        } else if (folderName === '.cursor' || folderName === '.vscode' || folderPath.endsWith('/.cursor') || folderPath.endsWith('/.vscode')) {
          bundleType = 'project';
        } else {
          // Ask user to select type
          const choice = await vscode.window.showQuickPick(
            [
              { label: 'Commands Bundle', value: 'command' as const },
              { label: 'Rules Bundle', value: 'rule' as const },
              { label: 'Prompts Bundle', value: 'prompt' as const },
              { label: 'Notepads Bundle', value: 'notepad' as const },
              { label: 'HTTP Bundle', value: 'http' as const },
              { label: 'Project Bundle', value: 'project' as const }
            ],
            {
              placeHolder: 'Select bundle type'
            }
          );

          if (!choice) {
            return;
          }

          bundleType = choice.value;
        }

        // Generate Gist bundle
        const gistUrl = await generateGistShareableForBundle(bundleType, folderPath, context);
        
        if (gistUrl) {
          // Copy to clipboard
          await vscode.env.clipboard.writeText(gistUrl);
          vscode.window.showInformationMessage('Gist bundle created successfully! URL copied to clipboard.');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error sharing folder via Gist: ${error}`);
      }
    }
  );

  // Command to configure GitHub token (Command Palette only)
  const configureGitHubTokenCommand = vscode.commands.registerCommand(
    'cursor-toys.configureGitHubToken',
    async () => {
      try {
        const gistManager = GistManager.getInstance(context);
        const token = await gistManager.promptForToken();
        
        if (token) {
          vscode.window.showInformationMessage('GitHub token configured successfully!');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error configuring GitHub token: ${error}`);
      }
    }
  );

  // Command to remove GitHub token
  const removeGitHubTokenCommand = vscode.commands.registerCommand(
    'cursor-toys.removeGitHubToken',
    async () => {
      try {
        const confirm = await vscode.window.showWarningMessage(
          'Are you sure you want to remove the GitHub token?',
          'Yes',
          'No'
        );

        if (confirm !== 'Yes') {
          return;
        }

        const gistManager = GistManager.getInstance(context);
        await gistManager.removeGitHubToken();
        
        vscode.window.showInformationMessage('GitHub token removed successfully!');
      } catch (error) {
        vscode.window.showErrorMessage(`Error removing GitHub token: ${error}`);
      }
    }
  );

  // Recommendations commands
  const checkRecommendationsCommand = vscode.commands.registerCommand('cursor-toys.checkRecommendations', async () => {
    try {
      const projectContext = await recsManager.detectProjectContext();
      const recommendations = await recsManager.getRecommendationsForContext(projectContext);
      
      if (recommendations.length === 0) {
        vscode.window.showInformationMessage('No recommendations found for this project.');
        return;
      }

      // Count total items
      const totalItems = recommendations.reduce((sum, rec) => sum + rec.items.length, 0);

      const action = await vscode.window.showInformationMessage(
        `CursorToys Marketplace has ${totalItems} recommended items for your project`,
        'Open Marketplace',
        'Not Now'
      );

      if (action === 'Open Marketplace') {
        await RecommendationsBrowserPanel.createOrShow(context, recsManager);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error checking recommendations: ${error}`);
    }
  });

  const browseRecommendationsCommand = vscode.commands.registerCommand('cursor-toys.browseRecommendations', async () => {
    await RecommendationsBrowserPanel.createOrShow(context, recsManager);
  });

  const refreshRecommendationsCommand = vscode.commands.registerCommand('cursor-toys.refreshRecommendations', async () => {
    await recsManager.clearCache();
  });

  // Check recommendations on workspace open (delayed)
  if (vscode.workspace.workspaceFolders) {
    checkRecommendationsOnStartup(recsManager);
  }

  // Watch for workspace folder changes
  const workspaceChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    if (vscode.workspace.workspaceFolders) {
      checkRecommendationsOnStartup(recsManager);
    }
  });

  // Register URI Handler for cursor://godrix.cursor-toys/* and vscode://godrix.cursor-toys/* deeplinks
  const uriHandler = vscode.window.registerUriHandler({
    handleUri(uri: vscode.Uri) {
      // Suporta ambos os formatos:
      // - cursor://godrix.cursor-toys/annotation?...
      // - vscode://godrix.cursor-toys/annotation?...
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

  // File system watchers for prompts folder
  const createPromptsWatchers = (): vscode.FileSystemWatcher[] => {
    const watchers: vscode.FileSystemWatcher[] = [];
    const folderPaths = getPersonalPromptsPaths();
    
    for (const folderPath of folderPaths) {
      const folderUri = vscode.Uri.file(folderPath);
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folderUri, '**/*')
      );

      watcher.onDidCreate(() => {
        userPromptsTreeProvider.refresh();
      });

      watcher.onDidDelete(() => {
        userPromptsTreeProvider.refresh();
      });

      watcher.onDidChange(() => {
        // Optionally refresh on file changes (not just create/delete)
        // userPromptsTreeProvider.refresh();
      });

      watchers.push(watcher);
    }
    
    return watchers;
  };

  let userPromptsWatchers = createPromptsWatchers();

  // File system watchers for notepads folder
  const createNotepadsWatchers = (): vscode.FileSystemWatcher[] => {
    const watchers: vscode.FileSystemWatcher[] = [];
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    if (!workspaceFolder) {
      return watchers; // No workspace, no watchers
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const notepadsPath = getNotepadsPath(workspacePath, false);
    const folderUri = vscode.Uri.file(notepadsPath);
    
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folderUri, '**/*')
    );

    watcher.onDidCreate(() => {
      userNotepadsTreeProvider.refresh();
    });

    watcher.onDidDelete(() => {
      userNotepadsTreeProvider.refresh();
    });

    watcher.onDidChange(() => {
      // Optionally refresh on file changes (not just create/delete)
      // userNotepadsTreeProvider.refresh();
    });

    watchers.push(watcher);
    
    return watchers;
  };

  let userNotepadsWatchers = createNotepadsWatchers();

  // Watch for configuration changes
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('cursorToys.commandsFolder') || 
        e.affectsConfiguration('cursorToys.personalCommandsView')) {
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
  userPromptsWatchers.forEach(watcher => {
    context.subscriptions.push(watcher);
  });
  userNotepadsWatchers.forEach(watcher => {
    context.subscriptions.push(watcher);
  });

  context.subscriptions.push(
    httpResponseProviderDisposable,
    tabChangeDisposable,
    codeLensDisposable,
    httpCodeLensDisposable,
    envCodeLensDisposable,
    httpHoverDisposable,
    httpCompletionDisposable,
    activeEditorChangeDisposable,
    documentChangeDisposable,
    visibleEditorsChangeDisposable,
    generateCommandSpecific,
    generateRuleSpecific,
    generatePromptSpecific,
    generateShareableCommandSpecific,
    generateShareableRuleSpecific,
    generateShareablePromptSpecific,
    generateShareableNotepadSpecific,
    generateShareableHttpSpecific,
    generateShareableEnvSpecific,
    generateShareableHttpWithPathSpecific,
    generateShareableEnvWithPathSpecific,
    shareHttpFolderCommand,
    shareEnvFolderCommand,
    shareHttpFolderWithEnvCommand,
    shareCommandFolderCommand,
    shareRuleFolderCommand,
    sharePromptFolderCommand,
    shareNotepadFolderCommand,
    shareProjectCommand,
    importCommand,
    saveAsUserCommand,
    saveAsUserPrompt,
    userCommandsTreeView,
    openUserCommand,
    generateUserCommandDeeplink,
    deleteUserCommand,
    revealUserCommand,
    renameUserCommand,
    refreshUserCommands,
    userPromptsTreeView,
    openUserPrompt,
    generateUserPromptDeeplink,
    deleteUserPrompt,
    revealUserPrompt,
    renameUserPrompt,
    refreshUserPrompts,
    userNotepadsTreeView,
    createNotepad,
    openNotepad,
    generateNotepadShareable,
    deleteNotepad,
    revealNotepad,
    renameNotepad,
    refreshNotepads,
    configWatcher,
    sendToChatCommand,
    sendSelectionToChatCommand,
    copySelectionAsPromptCommand,
    sendHttpRequestCommand,
    copyCurlCommandCommand,
    selectEnvironmentCommand,
    openEnvironmentsCommand,
    createEnvironmentCommand,
    initializeEnvironmentsCommand,
    minifyFileCommand,
    trimClipboardCommand,
    trimClipboardWithPromptCommand,
    shareViaGistCommand,
    shareFolderViaGistCommand,
    configureGitHubTokenCommand,
    removeGitHubTokenCommand,
    checkRecommendationsCommand,
    browseRecommendationsCommand,
    refreshRecommendationsCommand,
    workspaceChangeListener,
    uriHandler
  );
  
  // Dispose decoration provider
  context.subscriptions.push({
    dispose: () => decorationProvider.dispose()
  });
}

export function deactivate() {}

