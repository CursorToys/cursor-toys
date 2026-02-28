import * as vscode from 'vscode';
import * as path from 'path';
import { generateDeeplink } from './deeplinkGenerator';
import { importDeeplink } from './deeplinkImporter';
import { generateShareable, generateShareableWithPath, generateShareableForHttpFolder, generateShareableForEnvFolder, generateShareableForHttpFolderWithEnv, generateShareableForCommandFolder, generateShareableForRuleFolder, generateShareableForPromptFolder, generateShareableForSkillFolder, generateShareableForNotepadFolder, generateShareableForPlanFolder, generateShareableForProject, generateGistShareable, generateGistShareableForBundle, generateShareableForHooks, generateGistShareableForHooks } from './shareableGenerator';
import { importShareable, importFromGist } from './shareableImporter';
import { getFileTypeFromPath, isAllowedExtension, getUserHomePath, getCommandsPath, getCommandsFolderName, sanitizeFileName, getPersonalCommandsPaths, getPromptsPath, getPersonalPromptsPaths, getNotepadsPath, getPlansPath, getPersonalPlansPaths, getBaseFolderName, getHttpPath, getEnvironmentsPath, getEnvironmentsFolderName, getHooksPath, getPersonalHooksPath, getPersonalSkillsPaths, getSkillsPath, createHttpDocsSkill, validateUrlLength, MAX_URL_LENGTH, truncateAnnotationContentToFitUrl } from './utils';
import { DeeplinkCodeLensProvider } from './codelensProvider';
import { HttpCodeLensProvider } from './httpCodeLensProvider';
import { EnvCodeLensProvider } from './envCodeLensProvider';
import { UserCommandsTreeProvider, CommandFileItem } from './userCommandsTreeProvider';
import { UserPromptsTreeProvider, PromptFileItem } from './userPromptsTreeProvider';
import { UserNotepadsTreeProvider, NotepadFileItem } from './userNotepadsTreeProvider';
import { UserPlansTreeProvider, PlanFileItem } from './userPlansTreeProvider';
import { UserHooksTreeProvider, HooksFileItem } from './userHooksTreeProvider';
import { UserSkillsTreeProvider, SkillFileItem } from './userSkillsTreeProvider';
import { createHooksFile, hooksFileExists, validateHooksFile } from './hooksManager';
import { sendToChat, sendSelectionToChat, buildPromptDeeplink, MAX_DEEPLINK_LENGTH } from './sendToChat';
import { AnnotationPanel, AnnotationParams } from './annotationPanel';
import { executeHttpRequestFromFile, getExecutionTime, copyCurlCommand } from './httpRequestExecutor';
import { EnvironmentManager } from './environmentManager';
import { HttpVariableHoverProvider, HttpEnvironmentCompletionProvider, HttpEnvironmentDecorationProvider } from './httpEnvironmentProviders';
import { minifyFile, formatMinificationStats, detectFileType } from './minifier';
import { trimClipboardAuto, trimClipboardWithPrompt } from './clipboardProcessor';
import { refineSelectedText, refineClipboard, processWithPrompt, configureGeminiApiKey, removeGeminiApiKey } from './textRefiner';
import { GistManager } from './gistManager';
import { RecommendationsManager } from './recommendationsManager';
import { RecommendationsBrowserPanel } from './recommendationsBrowserPanel';
import { checkAndShowReleaseNotes, ReleaseNotesPanel, loadChangelogSection } from './releaseNotesPanel';
import * as fs from 'fs';

/**
 * Helper function to generate deeplink with validations
 */
async function generateDeeplinkWithValidation(
  uri: vscode.Uri | undefined,
  forcedType?: 'command' | 'rule' | 'prompt' | 'skill'
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
  forcedType?: 'command' | 'rule' | 'prompt' | 'notepad' | 'http' | 'env' | 'plan' | 'skill'
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
  if (forcedType === 'http' || forcedType === 'env' || forcedType === 'plan') {
    // HTTP, ENV, and PLAN types have their own validation in generateShareable
  } else {
    // For command, rule, prompt, notepad - validate with allowed extensions
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
    const typeLabel = forcedType === 'http' ? 'HTTP request' : forcedType === 'env' ? 'Environment' : forcedType === 'plan' ? 'Plan' : 'CursorToys';
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
  // Register URI Handler early so cursor:// or vscode:// links open the panel as soon as the extension activates
  const uriHandler = vscode.window.registerUriHandler({
    handleUri(uri: vscode.Uri) {
      try {
        // Accept any path when query has code=, sourceUrl=, or text= (Chrome extension sends /prompt?text=...)
        const hasAnnotationParams =
          uri.query &&
          (uri.query.includes('code=') || uri.query.includes('sourceUrl=') || uri.query.includes('text='));
        if (!hasAnnotationParams) {
          return;
        }

        const fullUri = uri.toString();
        const params: AnnotationParams = {};
        const query = new URLSearchParams(uri.query);
        query.forEach((value, key) => {
          params[key] = value;
        });
        // Chrome extension sends "text="; panel expects "code"
        if (params.text !== undefined && params.code === undefined) {
          params.code = params.text;
        }

        if (!validateUrlLength(fullUri)) {
          const contentParam = params.code ?? '';
          const baseUri = `${uri.scheme}://${uri.authority}${uri.path}`;
          const otherParams = new URLSearchParams();
          query.forEach((value, key) => {
            if (key !== 'code' && key !== 'text') {
              otherParams.set(key, value);
            }
          });
          const baseWithQuery = otherParams.toString()
            ? `${baseUri}?${otherParams.toString()}&`
            : `${baseUri}?`;
          const paramPrefix = 'code=';
          const maxEncodedLength = MAX_URL_LENGTH - baseWithQuery.length - paramPrefix.length;
          params.code = truncateAnnotationContentToFitUrl(maxEncodedLength, contentParam);
          if (params.text !== undefined) {
            params.text = params.code;
          }
          vscode.window.showInformationMessage(
            `Annotation content exceeded the ${MAX_URL_LENGTH} character URL limit and was truncated. The rest was sent to the panel.`
          );
        }

        AnnotationPanel.createOrShow(params);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`CursorToys annotation deeplink failed: ${message}`);
      }
    }
  });
  context.subscriptions.push(uriHandler);

  // Initialize Environment Manager and setup file watchers
  const envManager = EnvironmentManager.getInstance();
  envManager.setupFileWatchers();
  
  // Initialize Recommendations Manager
  const recsManager = RecommendationsManager.getInstance(context);

  // Show release notes when extension is updated (async, non-blocking)
  checkAndShowReleaseNotes(context).catch(() => {});

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
          label: '$(megaphone) What\'s New',
          description: 'View release notes and changelog',
          detail: 'Release notes'
        },
        {
          label: '$(compass) Open Skills Marketplace',
          description: 'Browse Agent Skills from Tech Leads Club',
          detail: 'Marketplace'
        },
        {
          label: '$(cloud-download) Import from URL',
          description: 'Import command, prompt or rule from deeplink or Gist',
          detail: 'Import'
        },
        {
          label: '$(note) New Notepad',
          description: 'Create a new notepad for quick notes',
          detail: 'Notepads'
        },
        {
          label: '$(sparkle) Create Skill',
          description: 'Create a new skill template',
          detail: 'Skills'
        },
        {
          label: '$(file-zip) Minify File',
          description: 'Minify current file (JSON, HTML, CSS, JS, etc)',
          detail: 'Tools'
        },
        {
          label: '$(clippy) Trim Clipboard',
          description: 'Trim and minify clipboard content',
          detail: 'Tools'
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
        'What\'s New': 'cursor-toys.showReleaseNotes',
        'Open Skills Marketplace': 'cursor-toys.browseRecommendations',
        'Import from URL': 'cursor-toys.import',
        'New Notepad': 'cursor-toys.createNotepad',
        'Create Skill': 'cursor-toys.createSkill',
        'Minify File': 'cursor-toys.minifyFile',
        'Trim Clipboard': 'cursor-toys.trimClipboard'
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

  // Specific command to generate skill deeplink
  const generateSkillSpecific = vscode.commands.registerCommand(
    'cursor-toys.generate-skill',
    async (uri?: vscode.Uri) => {
      await generateDeeplinkWithValidation(uri, 'skill');
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

  // Specific command to generate plan shareable
  const generateShareablePlanSpecific = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysPlan',
    async (uri?: vscode.Uri) => {
      await generateShareableWithValidation(uri, 'plan');
    }
  );

  // Specific command to generate skill shareable
  const generateShareableSkillSpecific = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysSkill',
    async (uri?: vscode.Uri) => {
      await generateShareableWithValidation(uri, 'skill');
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
    async (arg?: CommandFileItem | vscode.Uri) => {
      try {
        let folderPath: string;
        
        if (!arg) {
          vscode.window.showErrorMessage('Please select a folder');
          return;
        }

        // Handle CommandFileItem (from tree view)
        if ('type' in arg && (arg.type === 'category' || arg.type === 'folder')) {
          // For category items, get the actual folder path
          if (arg.type === 'category') {
            // For personal category, use the first personal commands path
            if (arg.isPersonal) {
              const personalPaths = getPersonalCommandsPaths();
              folderPath = personalPaths[0];
            } else {
              // For workspace category, get workspace commands path
              const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
              if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
              }
              folderPath = getCommandsPath(workspaceFolder.uri.fsPath, false);
            }
          } else {
            // For folder items, construct full path from filePath
            folderPath = arg.filePath;
          }
        } else if (arg instanceof vscode.Uri) {
          // Handle Uri (from file explorer)
          const stat = await vscode.workspace.fs.stat(arg);
          if (stat.type !== vscode.FileType.Directory) {
            vscode.window.showErrorMessage('Please select a folder');
            return;
          }
          folderPath = arg.fsPath;
        } else {
          vscode.window.showErrorMessage('Invalid argument type');
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
    async (arg?: PromptFileItem | vscode.Uri) => {
      try {
        let folderPath: string;
        
        if (!arg) {
          vscode.window.showErrorMessage('Please select a folder');
          return;
        }

        // Handle PromptFileItem (from tree view)
        if ('type' in arg && (arg.type === 'category' || arg.type === 'folder')) {
          // For category items, get the actual folder path
          if (arg.type === 'category') {
            // For personal category, use the first personal prompts path
            if (arg.isPersonal) {
              const personalPaths = getPersonalPromptsPaths();
              folderPath = personalPaths[0];
            } else {
              // For workspace category, get workspace prompts path
              const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
              if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
              }
              folderPath = getPromptsPath(workspaceFolder.uri.fsPath, false);
            }
          } else {
            // For folder items, construct full path from filePath
            folderPath = arg.filePath;
          }
        } else if (arg instanceof vscode.Uri) {
          // Handle Uri (from file explorer)
          const stat = await vscode.workspace.fs.stat(arg);
          if (stat.type !== vscode.FileType.Directory) {
            vscode.window.showErrorMessage('Please select a folder');
            return;
          }
          folderPath = arg.fsPath;
        } else {
          vscode.window.showErrorMessage('Invalid argument type');
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

  // Command to share skill folder as bundle
  const shareSkillFolderCommand = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysSkillFolder',
    async (arg?: SkillFileItem | vscode.Uri) => {
      try {
        let folderPath: string;
        
        if (!arg) {
          vscode.window.showErrorMessage('Please select a folder');
          return;
        }

        // Handle SkillFileItem (from tree view)
        if ('type' in arg && (arg.type === 'category' || arg.type === 'folder')) {
          // For category items, get the actual folder path
          if (arg.type === 'category') {
            // For personal category, use the first personal skills path
            if (arg.isPersonal) {
              const personalPaths = getPersonalSkillsPaths();
              folderPath = personalPaths[0];
            } else {
              // For workspace category, get workspace skills path
              const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
              if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
              }
              const baseFolderName = getBaseFolderName();
              folderPath = path.join(workspaceFolder.uri.fsPath, `.${baseFolderName}`, 'skills');
            }
          } else {
            // For folder items, construct full path from filePath
            folderPath = arg.filePath;
          }
        } else if (arg instanceof vscode.Uri) {
          // Handle Uri (from file explorer)
          const stat = await vscode.workspace.fs.stat(arg);
          if (stat.type !== vscode.FileType.Directory) {
            vscode.window.showErrorMessage('Please select a folder');
            return;
          }
          folderPath = arg.fsPath;
        } else {
          vscode.window.showErrorMessage('Invalid argument type');
          return;
        }

        const shareable = await generateShareableForSkillFolder(folderPath);
        if (shareable) {
          await vscode.env.clipboard.writeText(shareable);
          vscode.window.showInformationMessage('Skills bundle copied to clipboard!');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error generating skill bundle: ${error}`);
      }
    }
  );

  // Command to share notepad folder as bundle
  const shareNotepadFolderCommand = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysNotepadFolder',
    async (arg?: NotepadFileItem | vscode.Uri) => {
      try {
        let folderPath: string;
        
        if (!arg) {
          vscode.window.showErrorMessage('Please select a folder');
          return;
        }

        // Handle NotepadFileItem (from tree view)
        if ('type' in arg && arg.type === 'folder') {
          // Notepads don't have categories (only workspace), just folders
          folderPath = arg.filePath;
        } else if (arg instanceof vscode.Uri) {
          // Handle Uri (from file explorer)
          const stat = await vscode.workspace.fs.stat(arg);
          if (stat.type !== vscode.FileType.Directory) {
            vscode.window.showErrorMessage('Please select a folder');
            return;
          }
          folderPath = arg.fsPath;
        } else {
          vscode.window.showErrorMessage('Invalid argument type');
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

  // Command to share plan folder as bundle
  const sharePlanFolderCommand = vscode.commands.registerCommand(
    'cursor-toys.shareAsCursorToysPlanFolder',
    async (arg?: PlanFileItem | vscode.Uri) => {
      try {
        let folderPath: string;
        
        if (!arg) {
          vscode.window.showErrorMessage('Please select a folder');
          return;
        }

        // Handle PlanFileItem (from tree view)
        if ('type' in arg && (arg.type === 'category' || arg.type === 'folder')) {
          // For category items, get the actual folder path
          if (arg.type === 'category') {
            // For personal category, use the first personal plans path
            if (arg.isPersonal) {
              const personalPaths = getPersonalPlansPaths();
              folderPath = personalPaths[0];
            } else {
              // For workspace category, get workspace plans path
              const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
              if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
              }
              folderPath = getPlansPath(workspaceFolder.uri.fsPath, false);
            }
          } else {
            // For folder items, construct full path from filePath
            folderPath = arg.filePath;
          }
        } else if (arg instanceof vscode.Uri) {
          // Handle Uri (from file explorer)
          const stat = await vscode.workspace.fs.stat(arg);
          if (stat.type !== vscode.FileType.Directory) {
            vscode.window.showErrorMessage('Please select a folder');
            return;
          }
          folderPath = arg.fsPath;
        } else {
          vscode.window.showErrorMessage('Invalid argument type');
          return;
        }

        const shareable = await generateShareableForPlanFolder(folderPath);
        if (shareable) {
          await vscode.env.clipboard.writeText(shareable);
          vscode.window.showInformationMessage('Plans bundle copied to clipboard!');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error generating plan bundle: ${error}`);
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

  // Command to save skill folder as user skill (in ~/.cursor/skills)
  const saveAsUserSkill = vscode.commands.registerCommand(
    'cursor-toys.save-as-user-skill',
    async (arg?: SkillFileItem | vscode.Uri) => {
      try {
        // Get skill folder path
        let skillFolderPath: string;
        
        if (arg) {
          if (arg instanceof vscode.Uri) {
            // If it's a URI, check if it's a folder or file
            const stat = await vscode.workspace.fs.stat(arg);
            if (stat.type === vscode.FileType.Directory) {
              skillFolderPath = arg.fsPath;
            } else {
              // It's a file (SKILL.md), get parent folder
              skillFolderPath = path.dirname(arg.fsPath);
            }
          } else {
            // It's a SkillFileItem
            const skillItem = arg as SkillFileItem;
            if (skillItem.type === 'folder') {
              skillFolderPath = skillItem.filePath;
            } else {
              // It's a file, get parent folder
              skillFolderPath = path.dirname(skillItem.filePath);
            }
          }
        } else {
          // No argument, try to get from active editor
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            vscode.window.showErrorMessage('No skill selected');
            return;
          }
          const filePath = editor.document.uri.fsPath;
          const normalizedPath = filePath.replace(/\\/g, '/');
          
          // Verify file is in skills folder
          const baseFolderName = getBaseFolderName();
          const isInSkillsFolder = normalizedPath.includes('/.cursor/skills/') || 
                                   normalizedPath.includes('/.claude/skills/') ||
                                   normalizedPath.includes(`/.${baseFolderName}/skills/`);
          
          if (!isInSkillsFolder || !normalizedPath.endsWith('/SKILL.md')) {
            vscode.window.showErrorMessage('This command can only be used on SKILL.md files in skills folder');
            return;
          }
          
          skillFolderPath = path.dirname(filePath);
        }

        const normalizedPath = skillFolderPath.replace(/\\/g, '/');
        
        // Verify it's a project skill (not personal)
        const baseFolderName = getBaseFolderName();
        const personalPaths = getPersonalSkillsPaths();
        const isPersonalSkill = personalPaths.some(p => skillFolderPath.startsWith(p));
        
        if (isPersonalSkill) {
          vscode.window.showErrorMessage('This skill is already in personal folder. Use it from project folder to move it.');
          return;
        }
        
        const isInSkillsFolder = normalizedPath.includes('/.cursor/skills/') || 
                                 normalizedPath.includes('/.claude/skills/') ||
                                 normalizedPath.includes(`/.${baseFolderName}/skills/`);
        
        if (!isInSkillsFolder) {
          vscode.window.showErrorMessage('This command can only be used on skills in project skills folder');
          return;
        }

        // Get workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage('No workspace open');
          return;
        }

        // Get skill folder name
        const skillFolderName = path.basename(skillFolderPath);
        
        // Determine destination path using configuration (~/.cursor/skills or ~/.claude/skills)
        const userSkillsPath = getSkillsPath(undefined, true);
        const destinationPath = path.join(userSkillsPath, skillFolderName);
        const destinationUri = vscode.Uri.file(destinationPath);

        // Check if skill folder already exists in destination
        let folderExists = false;
        try {
          await vscode.workspace.fs.stat(destinationUri);
          folderExists = true;
        } catch {
          // Folder doesn't exist, that's fine
        }

        if (folderExists) {
          const overwrite = await vscode.window.showWarningMessage(
            `Skill "${skillFolderName}" already exists in ~/.cursor/skills. Do you want to overwrite it?`,
            'Yes',
            'No'
          );
          if (overwrite !== 'Yes') {
            return;
          }
          // Delete existing folder
          await vscode.workspace.fs.delete(destinationUri, { recursive: true });
        }

        // Create destination folder if it doesn't exist
        const folderUri = vscode.Uri.file(userSkillsPath);
        try {
          await vscode.workspace.fs.stat(folderUri);
        } catch {
          // Folder doesn't exist, create it
          await vscode.workspace.fs.createDirectory(folderUri);
        }

        // Copy entire skill folder recursively
        const sourceUri = vscode.Uri.file(skillFolderPath);
        
        // Read all files from source folder
        async function copyDirectory(source: vscode.Uri, dest: vscode.Uri): Promise<void> {
          const entries = await vscode.workspace.fs.readDirectory(source);
          
          // Create destination directory
          try {
            await vscode.workspace.fs.stat(dest);
          } catch {
            await vscode.workspace.fs.createDirectory(dest);
          }
          
          for (const [name, type] of entries) {
            const sourcePath = vscode.Uri.file(path.join(source.fsPath, name));
            const destPath = vscode.Uri.file(path.join(dest.fsPath, name));
            
            if (type === vscode.FileType.Directory) {
              await copyDirectory(sourcePath, destPath);
            } else {
              const content = await vscode.workspace.fs.readFile(sourcePath);
              await vscode.workspace.fs.writeFile(destPath, content);
            }
          }
        }
        
        await copyDirectory(sourceUri, destinationUri);

        vscode.window.showInformationMessage(`Skill "${skillFolderName}" saved to ~/.cursor/skills/`);

        // Ask if user wants to remove the original folder
        const removeOriginal = await vscode.window.showWarningMessage(
          'Do you want to remove the original skill from the workspace?',
          'Yes',
          'No'
        );

        if (removeOriginal === 'Yes') {
          try {
            await vscode.workspace.fs.delete(sourceUri, { recursive: true });
            vscode.window.showInformationMessage('Original skill removed from workspace');
            userSkillsTreeProvider.refresh();
          } catch (error) {
            vscode.window.showErrorMessage(`Error removing original skill: ${error}`);
          }
        } else {
          userSkillsTreeProvider.refresh();
        }

        // Open the SKILL.md file
        const skillFileUri = vscode.Uri.file(path.join(destinationPath, 'SKILL.md'));
        const document = await vscode.workspace.openTextDocument(skillFileUri);
        await vscode.window.showTextDocument(document);
      } catch (error) {
        vscode.window.showErrorMessage(`Error saving as user skill: ${error}`);
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

  // Command to share user command via CursorToys
  const shareUserCommandAsCursorToys = vscode.commands.registerCommand(
    'cursor-toys.shareUserCommandAsCursorToys',
    async (arg?: CommandFileItem | vscode.Uri) => {
      const uri = getUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      await generateShareableWithValidation(uri, 'command');
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

  // Command to share user prompt via CursorToys
  const shareUserPromptAsCursorToys = vscode.commands.registerCommand(
    'cursor-toys.shareUserPromptAsCursorToys',
    async (arg?: PromptFileItem | vscode.Uri) => {
      const uri = getPromptUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      await generateShareableWithValidation(uri, 'prompt');
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

  // Register User Plans Tree Provider
  const userPlansTreeProvider = new UserPlansTreeProvider();
  const userPlansTreeView = vscode.window.createTreeView('cursor-toys.userPlans', {
    treeDataProvider: userPlansTreeProvider,
    showCollapseAll: false,
    dragAndDropController: userPlansTreeProvider
  });

  // Register User Hooks Tree Provider
  const userHooksTreeProvider = new UserHooksTreeProvider();
  const userHooksTreeView = vscode.window.createTreeView('cursor-toys.userHooks', {
    treeDataProvider: userHooksTreeProvider,
    showCollapseAll: false
  });

  // Register User Skills Tree Provider
  const userSkillsTreeProvider = new UserSkillsTreeProvider();
  const userSkillsTreeView = vscode.window.createTreeView('cursor-toys.userSkills', {
    treeDataProvider: userSkillsTreeProvider,
    showCollapseAll: false,
    dragAndDropController: userSkillsTreeProvider
  });

  /**
   * Helper function to get URI from skills command argument (can be SkillFileItem or vscode.Uri)
   * For skill folders, returns the SKILL.md file URI
   */
  function getSkillUriFromArgument(arg: SkillFileItem | vscode.Uri | undefined): vscode.Uri | null {
    if (!arg) {
      return null;
    }
    if (arg instanceof vscode.Uri) {
      // If it's already a SKILL.md file URI, return it as-is.
      // Otherwise, treat it as a folder URI and resolve SKILL.md inside it.
      const baseName = path.basename(arg.fsPath);
      if (baseName === 'SKILL.md') {
        return arg;
      }
      const skillFilePath = path.join(arg.fsPath, 'SKILL.md');
      return vscode.Uri.file(skillFilePath);
    }
    if ('uri' in arg) {
      const skillItem = arg as SkillFileItem;
      // If it's a folder type, get the SKILL.md from children or construct path
      if (skillItem.type === 'folder') {
        const skillFilePath = path.join(skillItem.filePath, 'SKILL.md');
        return vscode.Uri.file(skillFilePath);
      }
      // If it's a file type, return the URI directly
      return skillItem.uri;
    }
    return null;
  }

  /**
   * Helper function to get file name from skills command argument
   */
  function getSkillFileNameFromArgument(arg: SkillFileItem | vscode.Uri | undefined): string {
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
   * Helper function to get file path from skills command argument
   */
  function getSkillFilePathFromArgument(arg: SkillFileItem | vscode.Uri | undefined): string | null {
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

  // Command to open skill file
  const openSkill = vscode.commands.registerCommand(
    'cursor-toys.openSkill',
    async (arg?: SkillFileItem | vscode.Uri) => {
      const uri = getSkillUriFromArgument(arg);
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

  // Command to delete skill
  const deleteSkill = vscode.commands.registerCommand(
    'cursor-toys.deleteSkill',
    async (arg?: SkillFileItem | vscode.Uri) => {
      const uri = getSkillUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      const fileName = getSkillFileNameFromArgument(arg);
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete "${fileName}"?`,
        'Yes',
        'No'
      );
      if (confirm !== 'Yes') {
        return;
      }
      try {
        // For skills, we need to delete the entire skill folder (parent of SKILL.md)
        const skillFolderPath = path.dirname(uri.fsPath);
        const skillFolderUri = vscode.Uri.file(skillFolderPath);
        await vscode.workspace.fs.delete(skillFolderUri, { recursive: true });
        vscode.window.showInformationMessage(`Skill "${path.basename(skillFolderPath)}" deleted successfully!`);
        userSkillsTreeProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(`Error deleting skill: ${error}`);
      }
    }
  );

  // Command to reveal skill in folder
  const revealSkill = vscode.commands.registerCommand(
    'cursor-toys.revealSkill',
    async (arg?: SkillFileItem | vscode.Uri) => {
      const uri = getSkillUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      // For skills, reveal the skill folder (parent of SKILL.md)
      const skillFolderPath = path.dirname(uri.fsPath);
      const skillFolderUri = vscode.Uri.file(skillFolderPath);
      await vscode.commands.executeCommand('revealFileInOS', skillFolderUri);
    }
  );

  // Command to rename skill
  const renameSkill = vscode.commands.registerCommand(
    'cursor-toys.renameSkill',
    async (arg?: SkillFileItem | vscode.Uri) => {
      const uri = getSkillUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      // For skills, rename the skill folder (parent of SKILL.md)
      const skillFolderPath = path.dirname(uri.fsPath);
      const currentName = path.basename(skillFolderPath);
      const newName = await vscode.window.showInputBox({
        prompt: 'Enter new skill name',
        value: currentName,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Skill name cannot be empty';
          }
          const sanitized = sanitizeFileName(value);
          if (sanitized !== value) {
            return 'Skill name contains invalid characters';
          }
          return null;
        }
      });
      if (!newName) {
        return;
      }
      try {
        const skillFolderUri = vscode.Uri.file(skillFolderPath);
        const parentDir = path.dirname(skillFolderPath);
        const newSkillFolderPath = path.join(parentDir, newName);
        const newSkillFolderUri = vscode.Uri.file(newSkillFolderPath);
        
        // Check if target already exists
        try {
          await vscode.workspace.fs.stat(newSkillFolderUri);
          vscode.window.showErrorMessage(`Skill "${newName}" already exists`);
          return;
        } catch {
          // Target doesn't exist, proceed
        }
        
        await vscode.workspace.fs.rename(skillFolderUri, newSkillFolderUri, { overwrite: false });
        vscode.window.showInformationMessage(`Skill renamed to "${newName}"`);
        userSkillsTreeProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(`Error renaming skill: ${error}`);
      }
    }
  );

  // Command to refresh skills
  const refreshSkills = vscode.commands.registerCommand(
    'cursor-toys.refreshSkills',
    () => {
      userSkillsTreeProvider.refresh();
    }
  );

  // Command to create skill
  const createSkillCommand = vscode.commands.registerCommand(
    'cursor-toys.createSkill',
    async () => {
      try {
        // Ask if user wants personal or project skill
        const location = await vscode.window.showQuickPick(
          [
            { 
              label: 'Personal skill', 
              description: 'Available in all projects (~/.cursor/skills)', 
              value: true 
            },
            { 
              label: 'Project skill', 
              description: 'Specific to this workspace', 
              value: false 
            }
          ],
          { placeHolder: 'Where do you want to create the skill?' }
        );

        if (location === undefined) {
          return;
        }

        const isPersonal = location.value;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder && !isPersonal) {
          vscode.window.showErrorMessage('No workspace open');
          return;
        }

        // Ask for skill name
        const skillName = await vscode.window.showInputBox({
          prompt: 'Enter skill name (lowercase, numbers, and hyphens only)',
          placeHolder: 'my-skill',
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Skill name cannot be empty';
            }
            if (!/^[a-z0-9-]+$/.test(value)) {
              return 'Skill name can only contain lowercase letters, numbers, and hyphens';
            }
            return null;
          }
        });

        if (!skillName) {
          return;
        }

        const workspacePath = workspaceFolder?.uri.fsPath || '';
        const skillsPath = getSkillsPath(workspacePath, isPersonal);
        const skillFolderPath = path.join(skillsPath, sanitizeFileName(skillName));
        const skillFilePath = path.join(skillFolderPath, 'SKILL.md');

        // Check if skill already exists
        const skillFolderUri = vscode.Uri.file(skillFolderPath);
        let skillExists = false;
        try {
          await vscode.workspace.fs.stat(skillFolderUri);
          skillExists = true;
        } catch {
          // Skill doesn't exist, that's fine
        }

        if (skillExists) {
          const overwrite = await vscode.window.showWarningMessage(
            `Skill "${skillName}" already exists. Do you want to overwrite it?`,
            'Yes',
            'No'
          );
          if (overwrite !== 'Yes') {
            return;
          }
        }

        // Create skill folder
        await vscode.workspace.fs.createDirectory(skillFolderUri);

        // Create SKILL.md with template
        const skillTemplate = `---
name: ${skillName}
description: Short description of what this skill does and when to use it.
---
# ${skillName.charAt(0).toUpperCase() + skillName.slice(1).replace(/-/g, ' ')}
Detailed instructions for the agent.

## When to Use
- Use this skill when...
- This skill is helpful for...

## Instructions
- Step-by-step guidance for the agent
- Domain-specific conventions
- Best practices and patterns
`;

        const skillFileUri = vscode.Uri.file(skillFilePath);
        await vscode.workspace.fs.writeFile(skillFileUri, Buffer.from(skillTemplate, 'utf8'));

        vscode.window.showInformationMessage(`Skill "${skillName}" created successfully!`);
        
        // Refresh tree view
        userSkillsTreeProvider.refresh();
        
        // Open file
        const document = await vscode.workspace.openTextDocument(skillFileUri);
        await vscode.window.showTextDocument(document);
      } catch (error) {
        vscode.window.showErrorMessage(`Error creating skill: ${error}`);
      }
    }
  );

  // FileSystemWatcher for skills
  const skillsWatcher = vscode.workspace.createFileSystemWatcher('**/.cursor/skills/**/SKILL.md');
  skillsWatcher.onDidChange(() => userSkillsTreeProvider.refresh());
  skillsWatcher.onDidCreate(() => userSkillsTreeProvider.refresh());
  skillsWatcher.onDidDelete(() => userSkillsTreeProvider.refresh());

  // Also watch .claude/skills for compatibility
  const claudeSkillsWatcher = vscode.workspace.createFileSystemWatcher('**/.claude/skills/**/SKILL.md');
  claudeSkillsWatcher.onDidChange(() => userSkillsTreeProvider.refresh());
  claudeSkillsWatcher.onDidCreate(() => userSkillsTreeProvider.refresh());
  claudeSkillsWatcher.onDidDelete(() => userSkillsTreeProvider.refresh());

  /**
   * Helper function to get URI from hooks command argument (can be HooksFileItem or vscode.Uri)
   */
  function getHooksUriFromArgument(arg: HooksFileItem | vscode.Uri | undefined): vscode.Uri | null {
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
   * Helper function to get file path from hooks command argument
   */
  function getHooksFilePathFromArgument(arg: HooksFileItem | vscode.Uri | undefined): string | null {
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

  /**
   * Helper function to get file name from hooks command argument
   */
  function getHooksFileNameFromArgument(arg: HooksFileItem | vscode.Uri | undefined): string {
    if (!arg) {
      return 'file';
    }
    if (arg instanceof vscode.Uri) {
      return path.basename(arg.fsPath);
    }
    if ('label' in arg) {
      return arg.label;
    }
    return 'file';
  }

  // Command to create hooks file
  const createHooksFileCommand = vscode.commands.registerCommand(
    'cursor-toys.createHooksFile',
    async () => {
      try {
        // Ask if user wants personal or project hooks
        const location = await vscode.window.showQuickPick(
          [
            { 
              label: 'Personal hooks', 
              description: 'Available in all projects (~/.cursor/hooks.json)', 
              value: true 
            },
            { 
              label: 'Project hooks', 
              description: 'Specific to this workspace', 
              value: false 
            }
          ],
          { placeHolder: 'Where do you want to create the hooks.json file?' }
        );

        if (location === undefined) {
          return;
        }

        const isPersonal = location.value;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder && !isPersonal) {
          vscode.window.showErrorMessage('No workspace open');
          return;
        }

        const workspacePath = workspaceFolder?.uri.fsPath || '';
        const hooksPath = getHooksPath(workspacePath, isPersonal);

        // Check if file already exists
        if (await hooksFileExists(hooksPath)) {
          const overwrite = await vscode.window.showWarningMessage(
            'hooks.json already exists. Do you want to overwrite it?',
            'Yes',
            'No'
          );
          if (overwrite !== 'Yes') {
            return;
          }
        }

        // Create hooks file
        await createHooksFile(hooksPath);

        vscode.window.showInformationMessage('Hooks file created successfully!');
        
        // Refresh tree view
        userHooksTreeProvider.refresh();
        
        // Open file
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(hooksPath));
        await vscode.window.showTextDocument(document);
      } catch (error) {
        vscode.window.showErrorMessage(`Error creating hooks file: ${error}`);
      }
    }
  );

  // Command to open hooks file
  const openHooksCommand = vscode.commands.registerCommand(
    'cursor-toys.openHooks',
    async (arg: HooksFileItem | vscode.Uri | undefined) => {
      try {
        const uri = getHooksUriFromArgument(arg);
        if (!uri) {
          vscode.window.showErrorMessage('No hooks file specified');
          return;
        }

        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);
      } catch (error) {
        vscode.window.showErrorMessage(`Error opening hooks file: ${error}`);
      }
    }
  );

  // Command to delete hooks file
  const deleteHooksCommand = vscode.commands.registerCommand(
    'cursor-toys.deleteHooks',
    async (arg: HooksFileItem | vscode.Uri | undefined) => {
      try {
        const uri = getHooksUriFromArgument(arg);
        if (!uri) {
          vscode.window.showErrorMessage('No hooks file specified');
          return;
        }

        const confirmation = await vscode.window.showWarningMessage(
          'Are you sure you want to delete this hooks.json file?',
          'Yes',
          'No'
        );

        if (confirmation === 'Yes') {
          await vscode.workspace.fs.delete(uri);
          vscode.window.showInformationMessage('Hooks file deleted successfully!');
          userHooksTreeProvider.refresh();
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error deleting hooks file: ${error}`);
      }
    }
  );

  // Command to reveal hooks file in folder
  const revealHooksCommand = vscode.commands.registerCommand(
    'cursor-toys.revealHooks',
    async (arg: HooksFileItem | vscode.Uri | undefined) => {
      try {
        const uri = getHooksUriFromArgument(arg);
        if (!uri) {
          vscode.window.showErrorMessage('No hooks file specified');
          return;
        }

        await vscode.commands.executeCommand('revealFileInOS', uri);
      } catch (error) {
        vscode.window.showErrorMessage(`Error revealing hooks file: ${error}`);
      }
    }
  );

  // Command to share hooks via deeplink
  const shareHooksCommand = vscode.commands.registerCommand(
    'cursor-toys.shareHooks',
    async (arg: HooksFileItem | vscode.Uri | undefined) => {
      try {
        const filePath = getHooksFilePathFromArgument(arg);
        if (!filePath) {
          vscode.window.showErrorMessage('No hooks file specified');
          return;
        }

        // Validate hooks file
        if (!(await validateHooksFile(filePath))) {
          return; // Error already shown by validateHooksFile
        }

        const shareable = await generateShareableForHooks(filePath);
        if (shareable) {
          await vscode.env.clipboard.writeText(shareable);
          vscode.window.showInformationMessage('Hooks shared successfully! Link copied to clipboard.');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error sharing hooks: ${error}`);
      }
    }
  );

  // Command to share hooks via Gist
  const shareHooksViaGistCommand = vscode.commands.registerCommand(
    'cursor-toys.shareHooksViaGist',
    async (arg: HooksFileItem | vscode.Uri | undefined) => {
      try {
        const filePath = getHooksFilePathFromArgument(arg);
        if (!filePath) {
          vscode.window.showErrorMessage('No hooks file specified');
          return;
        }

        // Validate hooks file
        if (!(await validateHooksFile(filePath))) {
          return; // Error already shown by validateHooksFile
        }

        const gistUrl = await generateGistShareableForHooks(filePath, context);
        if (gistUrl) {
          await vscode.env.clipboard.writeText(gistUrl);
          vscode.window.showInformationMessage('Hooks shared via Gist! URL copied to clipboard.');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error sharing hooks via Gist: ${error}`);
      }
    }
  );

  // Command to refresh hooks tree view
  const refreshHooksCommand = vscode.commands.registerCommand(
    'cursor-toys.refreshHooks',
    () => {
      userHooksTreeProvider.refresh();
    }
  );

  // Command to open hook script
  const openHookScriptCommand = vscode.commands.registerCommand(
    'cursor-toys.openHookScript',
    async (arg: HooksFileItem | vscode.Uri | undefined) => {
      try {
        const uri = getHooksUriFromArgument(arg);
        if (!uri) {
          vscode.window.showErrorMessage('No hook script specified');
          return;
        }

        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);
      } catch (error) {
        vscode.window.showErrorMessage(`Error opening hook script: ${error}`);
      }
    }
  );

  // Command to share hook script via deeplink
  const shareHookScriptCommand = vscode.commands.registerCommand(
    'cursor-toys.shareHookScript',
    async (arg: HooksFileItem | vscode.Uri | undefined) => {
      try {
        const filePath = getHooksFilePathFromArgument(arg);
        if (!filePath) {
          vscode.window.showErrorMessage('No hook script specified');
          return;
        }

        // Check if file exists
        try {
          await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        } catch {
          vscode.window.showErrorMessage('Hook script file not found');
          return;
        }

        // Generate shareable link using generic function (auto-detect type)
        const shareable = await generateShareable(filePath);
        if (shareable) {
          await vscode.env.clipboard.writeText(shareable);
          vscode.window.showInformationMessage('Hook script shared successfully! Link copied to clipboard.');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error sharing hook script: ${error}`);
      }
    }
  );

  // Command to share hook script via Gist
  const shareHookScriptViaGistCommand = vscode.commands.registerCommand(
    'cursor-toys.shareHookScriptViaGist',
    async (arg: HooksFileItem | vscode.Uri | undefined) => {
      try {
        const filePath = getHooksFilePathFromArgument(arg);
        if (!filePath) {
          vscode.window.showErrorMessage('No hook script specified');
          return;
        }

        // Check if file exists
        try {
          await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        } catch {
          vscode.window.showErrorMessage('Hook script file not found');
          return;
        }

        // Share via Gist using generic function
        const gistUrl = await generateGistShareable(filePath, undefined, context);
        if (gistUrl) {
          await vscode.env.clipboard.writeText(gistUrl);
          vscode.window.showInformationMessage('Hook script shared via Gist! URL copied to clipboard.');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error sharing hook script via Gist: ${error}`);
      }
    }
  );

  // Command to reveal hook script in folder
  const revealHookScriptCommand = vscode.commands.registerCommand(
    'cursor-toys.revealHookScript',
    async (arg: HooksFileItem | vscode.Uri | undefined) => {
      try {
        const uri = getHooksUriFromArgument(arg);
        if (!uri) {
          vscode.window.showErrorMessage('No hook script specified');
          return;
        }

        await vscode.commands.executeCommand('revealFileInOS', uri);
      } catch (error) {
        vscode.window.showErrorMessage(`Error revealing hook script: ${error}`);
      }
    }
  );

  // Command to delete hook script
  const deleteHookScriptCommand = vscode.commands.registerCommand(
    'cursor-toys.deleteHookScript',
    async (arg: HooksFileItem | vscode.Uri | undefined) => {
      try {
        const uri = getHooksUriFromArgument(arg);
        const fileName = getHooksFileNameFromArgument(arg);
        
        if (!uri) {
          vscode.window.showErrorMessage('No hook script specified');
          return;
        }

        // Confirm deletion
        const confirm = await vscode.window.showWarningMessage(
          `Are you sure you want to delete the hook script '${fileName}'?`,
          'Delete',
          'Cancel'
        );

        if (confirm === 'Delete') {
          await vscode.workspace.fs.delete(uri);
          userHooksTreeProvider.refresh();
          vscode.window.showInformationMessage(`Hook script '${fileName}' deleted successfully`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error deleting hook script: ${error}`);
      }
    }
  );

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

  /**
   * Helper function to get URI from plan command argument (can be PlanFileItem or vscode.Uri)
   */
  function getPlanUriFromArgument(arg: PlanFileItem | vscode.Uri | undefined): vscode.Uri | null {
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
   * Helper function to get file name from plan command argument
   */
  function getPlanFileNameFromArgument(arg: PlanFileItem | vscode.Uri | undefined): string {
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
   * Helper function to get file path from plan command argument
   */
  function getPlanFilePathFromArgument(arg: PlanFileItem | vscode.Uri | undefined): string | null {
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

  // Command to open user plan file
  const openPlan = vscode.commands.registerCommand(
    'cursor-toys.openPlan',
    async (arg?: PlanFileItem | vscode.Uri) => {
      const uri = getPlanUriFromArgument(arg);
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

  // Command to generate shareable for user plan
  const generatePlanShareable = vscode.commands.registerCommand(
    'cursor-toys.generatePlanShareable',
    async (arg?: PlanFileItem | vscode.Uri) => {
      const uri = getPlanUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      await generateShareableWithValidation(uri, 'plan');
    }
  );

  // Command to delete user plan
  const deletePlan = vscode.commands.registerCommand(
    'cursor-toys.deletePlan',
    async (arg?: PlanFileItem | vscode.Uri) => {
      const uri = getPlanUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      const fileName = getPlanFileNameFromArgument(arg);
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete "${fileName}"?`,
        'Yes',
        'No'
      );

      if (confirm === 'Yes') {
        try {
          await vscode.workspace.fs.delete(uri);
          vscode.window.showInformationMessage(`Plan "${fileName}" deleted`);
          userPlansTreeProvider.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(`Error deleting file: ${error}`);
        }
      }
    }
  );

  // Command to reveal user plan in folder
  const revealPlan = vscode.commands.registerCommand(
    'cursor-toys.revealPlan',
    async (arg?: PlanFileItem | vscode.Uri) => {
      const uri = getPlanUriFromArgument(arg);
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

  // Command to rename user plan
  const renamePlan = vscode.commands.registerCommand(
    'cursor-toys.renamePlan',
    async (arg?: PlanFileItem | vscode.Uri) => {
      const uri = getPlanUriFromArgument(arg);
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      const currentFileName = getPlanFileNameFromArgument(arg);
      const currentFilePath = getPlanFilePathFromArgument(arg);
      
      if (!currentFilePath) {
        vscode.window.showErrorMessage('Unable to determine file path');
        return;
      }

      // Extract name without .plan.md extension
      const currentNameWithoutExt = currentFileName.replace(/\.plan\.md$/, '');

      const newName = await vscode.window.showInputBox({
        prompt: 'Enter new plan name',
        value: currentNameWithoutExt,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Plan name cannot be empty';
          }

          // Sanitize and check if name is valid
          const sanitized = sanitizeFileName(value);
          if (sanitized.length === 0) {
            return 'Plan name contains invalid characters';
          }

          // Check if file already exists
          const newFileName = `${sanitized}.plan.md`;
          const newPath = path.join(path.dirname(currentFilePath), newFileName);
          if (newPath === currentFilePath) {
            return null; // Same name, no error
          }

          return null;
        }
      });

      if (newName && newName !== currentNameWithoutExt) {
        try {
          const sanitized = sanitizeFileName(newName);
          const newFileName = `${sanitized}.plan.md`;
          const newPath = path.join(path.dirname(currentFilePath), newFileName);
          const newUri = vscode.Uri.file(newPath);

          // Check if file already exists
          try {
            await vscode.workspace.fs.stat(newUri);
            const overwrite = await vscode.window.showWarningMessage(
              `File "${newFileName}" already exists. Do you want to overwrite it?`,
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
          vscode.window.showInformationMessage(`Plan renamed to "${newFileName}"`);
          userPlansTreeProvider.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(`Error renaming file: ${error}`);
        }
      }
    }
  );

  // Command to refresh user plans tree
  const refreshPlans = vscode.commands.registerCommand(
    'cursor-toys.refreshPlans',
    () => {
      userPlansTreeProvider.refresh();
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

  // Command to run assertions using CLI
  const runAssertionsCommand = vscode.commands.registerCommand(
    'cursor-toys.runAssertions',
    async (uri?: vscode.Uri) => {
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

      const filePath = requestUri.fsPath;
      
      // Create a terminal and run cursortoys command
      const terminal = vscode.window.createTerminal({
        name: 'CursorToys - HTTP Tests',
        cwd: path.dirname(filePath)
      });
      
      terminal.show();
      terminal.sendText(`cursortoys http test -f "${filePath}"`);
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

  // Command to add HTTP Requests documentation skill
  const generateHttpLlmsCommand = vscode.commands.registerCommand(
    'cursor-toys.generateHttpLlms',
    async (uri?: vscode.Uri) => {
      try {
        await createHttpDocsSkill();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to install skill: ${error instanceof Error ? error.message : String(error)}`);
      }
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

  // Command to refine selected text with AI
  const refineSelectionWithAICommand = vscode.commands.registerCommand(
    'cursor-toys.refineSelectionWithAI',
    async () => {
      await refineSelectedText(context);
    }
  );

  // Command to refine clipboard text with AI
  const refineClipboardWithAICommand = vscode.commands.registerCommand(
    'cursor-toys.refineClipboardWithAI',
    async () => {
      await refineClipboard(context);
    }
  );

  // Command to process text with a prompt
  const processWithPromptCommand = vscode.commands.registerCommand(
    'cursor-toys.processWithPrompt',
    async () => {
      await processWithPrompt(context);
    }
  );

  // Command to configure Gemini API key
  const configureGeminiApiKeyCommand = vscode.commands.registerCommand(
    'cursor-toys.configureGeminiApiKey',
    async () => {
      await configureGeminiApiKey(context);
    }
  );

  // Command to remove Gemini API key
  const removeGeminiApiKeyCommand = vscode.commands.registerCommand(
    'cursor-toys.removeGeminiApiKey',
    async () => {
      await removeGeminiApiKey(context);
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
    async (arg?: CommandFileItem | PromptFileItem | PlanFileItem | SkillFileItem | NotepadFileItem | vscode.Uri) => {
      try {
        let folderPath: string;
        let bundleType: 'command' | 'rule' | 'prompt' | 'notepad' | 'http' | 'project' | 'plan' | null = null;

        if (!arg) {
          vscode.window.showErrorMessage('Please select a folder');
          return;
        }

        // Handle tree view items (CommandFileItem, PromptFileItem, etc.)
        if ('type' in arg && (arg.type === 'category' || arg.type === 'folder')) {
          // Determine bundle type and folder path based on the tree view
          if ('fileName' in arg && arg.fileName.includes('workspace')) {
            // Workspace category
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
              vscode.window.showErrorMessage('No workspace folder found');
              return;
            }
            
            // Detect bundle type based on tree view context
            if ('uri' in arg && arg.uri.fsPath.includes('/commands')) {
              bundleType = 'command';
              folderPath = getCommandsPath(workspaceFolder.uri.fsPath, false);
            } else if ('uri' in arg && arg.uri.fsPath.includes('/prompts')) {
              bundleType = 'prompt';
              folderPath = getPromptsPath(workspaceFolder.uri.fsPath, false);
            } else if ('uri' in arg && arg.uri.fsPath.includes('/plans')) {
              bundleType = 'plan';
              folderPath = getPlansPath(workspaceFolder.uri.fsPath, false);
            } else if ('uri' in arg && arg.uri.fsPath.includes('/skills')) {
              // Skills don't have gist bundles yet, fallback
              vscode.window.showErrorMessage('Skill bundles via Gist not yet supported');
              return;
            } else {
              folderPath = workspaceFolder.uri.fsPath;
            }
          } else if (arg.type === 'category' && arg.isPersonal) {
            // Personal category
            if ('fileName' in arg && arg.fileName.includes('Commands')) {
              bundleType = 'command';
              const personalPaths = getPersonalCommandsPaths();
              folderPath = personalPaths[0];
            } else if ('fileName' in arg && arg.fileName.includes('Prompts')) {
              bundleType = 'prompt';
              const personalPaths = getPersonalPromptsPaths();
              folderPath = personalPaths[0];
            } else if ('fileName' in arg && arg.fileName.includes('Plans')) {
              bundleType = 'plan';
              const personalPaths = getPersonalPlansPaths();
              folderPath = personalPaths[0];
            } else if ('fileName' in arg && arg.fileName.includes('Skills')) {
              vscode.window.showErrorMessage('Skill bundles via Gist not yet supported');
              return;
            } else {
              vscode.window.showErrorMessage('Unable to determine folder type');
              return;
            }
          } else {
            // Folder item
            folderPath = arg.filePath;
            
            // Detect type from path
            if (folderPath.includes('/commands')) {
              bundleType = 'command';
            } else if (folderPath.includes('/prompts')) {
              bundleType = 'prompt';
            } else if (folderPath.includes('/plans')) {
              bundleType = 'plan';
            } else if (folderPath.includes('/notepads')) {
              bundleType = 'notepad';
            }
          }
        } else if (arg instanceof vscode.Uri) {
          // Handle Uri (from file explorer)
          const stat = await vscode.workspace.fs.stat(arg);
          if (stat.type !== vscode.FileType.Directory) {
            vscode.window.showErrorMessage('Please select a folder');
            return;
          }

          folderPath = arg.fsPath;
          const folderName = path.basename(folderPath);

          // Determine bundle type based on folder name/location
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
          } else if (folderName === 'plans' || folderPath.includes('/plans')) {
            bundleType = 'plan';
          } else if (folderName === '.cursor' || folderName === '.vscode' || folderPath.endsWith('/.cursor') || folderPath.endsWith('/.vscode')) {
            bundleType = 'project';
          }
        } else {
          vscode.window.showErrorMessage('Invalid argument type');
          return;
        }

        // If type still not determined, ask user
        if (!bundleType) {
          const choice = await vscode.window.showQuickPick(
            [
              { label: 'Commands Bundle', value: 'command' as const },
              { label: 'Rules Bundle', value: 'rule' as const },
              { label: 'Prompts Bundle', value: 'prompt' as const },
              { label: 'Notepads Bundle', value: 'notepad' as const },
              { label: 'Plans Bundle', value: 'plan' as const },
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

  // Skills Marketplace commands
  const browseSkillsMarketplaceCommand = vscode.commands.registerCommand('cursor-toys.browseRecommendations', async () => {
    await RecommendationsBrowserPanel.createOrShow(context, recsManager);
  });

  const refreshSkillsCommand = vscode.commands.registerCommand('cursor-toys.refreshRecommendations', async () => {
    await recsManager.clearCache();
  });

  const showReleaseNotesCommand = vscode.commands.registerCommand('cursor-toys.showReleaseNotes', async () => {
    const pkg = context.extension.packageJSON as { version?: string };
    const version = pkg?.version ?? '0.0.0';
    const changelogHtml = await loadChangelogSection(context);
    ReleaseNotesPanel.createOrShow(context, version, changelogHtml);
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

  // File system watchers for hooks.json files
  const createHooksWatchers = (): vscode.FileSystemWatcher[] => {
    const watchers: vscode.FileSystemWatcher[] = [];
    
    // Personal hooks
    const personalHooksPath = getPersonalHooksPath();
    const personalHooksDir = path.dirname(personalHooksPath);
    const personalWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(personalHooksDir, 'hooks.json')
    );
    personalWatcher.onDidCreate(() => userHooksTreeProvider.refresh());
    personalWatcher.onDidDelete(() => userHooksTreeProvider.refresh());
    personalWatcher.onDidChange(() => userHooksTreeProvider.refresh());
    watchers.push(personalWatcher);
    
    // Project hooks (if workspace exists)
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const baseFolderName = getBaseFolderName();
      const projectHooksDir = path.join(workspaceFolder.uri.fsPath, `.${baseFolderName}`);
      const projectWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(projectHooksDir, 'hooks.json')
      );
      projectWatcher.onDidCreate(() => userHooksTreeProvider.refresh());
      projectWatcher.onDidDelete(() => userHooksTreeProvider.refresh());
      projectWatcher.onDidChange(() => userHooksTreeProvider.refresh());
      watchers.push(projectWatcher);
    }
    
    return watchers;
  };

  let userHooksWatchers = createHooksWatchers();

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

  // File system watchers for plans folder
  const createPlansWatchers = (): vscode.FileSystemWatcher[] => {
    const watchers: vscode.FileSystemWatcher[] = [];
    
    // Personal plans
    const personalPlansPaths = getPersonalPlansPaths();
    for (const folderPath of personalPlansPaths) {
      const folderUri = vscode.Uri.file(folderPath);
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folderUri, '**/*.plan.md')
      );

      watcher.onDidCreate(() => {
        userPlansTreeProvider.refresh();
      });

      watcher.onDidDelete(() => {
        userPlansTreeProvider.refresh();
      });

      watcher.onDidChange(() => {
        // Optionally refresh on file changes (not just create/delete)
        // userPlansTreeProvider.refresh();
      });

      watchers.push(watcher);
    }
    
    // Project plans (if workspace exists)
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const workspacePath = workspaceFolder.uri.fsPath;
      const plansPath = getPlansPath(workspacePath, false);
      const folderUri = vscode.Uri.file(plansPath);
      
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folderUri, '**/*.plan.md')
      );

      watcher.onDidCreate(() => {
        userPlansTreeProvider.refresh();
      });

      watcher.onDidDelete(() => {
        userPlansTreeProvider.refresh();
      });

      watcher.onDidChange(() => {
        // Optionally refresh on file changes (not just create/delete)
        // userPlansTreeProvider.refresh();
      });

      watchers.push(watcher);
    }
    
    return watchers;
  };

  let userPlansWatchers = createPlansWatchers();

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
  userPlansWatchers.forEach(watcher => {
    context.subscriptions.push(watcher);
  });
  userHooksWatchers.forEach(watcher => {
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
    generateShareableSkillSpecific,
    generateShareableNotepadSpecific,
    generateShareablePlanSpecific,
    generateSkillSpecific,
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
    shareSkillFolderCommand,
    shareNotepadFolderCommand,
    sharePlanFolderCommand,
    shareProjectCommand,
    importCommand,
    saveAsUserCommand,
    saveAsUserPrompt,
    saveAsUserSkill,
    userCommandsTreeView,
    openUserCommand,
    generateUserCommandDeeplink,
    shareUserCommandAsCursorToys,
    deleteUserCommand,
    revealUserCommand,
    renameUserCommand,
    refreshUserCommands,
    userPromptsTreeView,
    openUserPrompt,
    generateUserPromptDeeplink,
    shareUserPromptAsCursorToys,
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
    userPlansTreeView,
    openPlan,
    generatePlanShareable,
    deletePlan,
    revealPlan,
    renamePlan,
    refreshPlans,
    userSkillsTreeView,
    openSkill,
    deleteSkill,
    revealSkill,
    renameSkill,
    refreshSkills,
    createSkillCommand,
    skillsWatcher,
    claudeSkillsWatcher,
    userHooksTreeView,
    createHooksFileCommand,
    openHooksCommand,
    deleteHooksCommand,
    revealHooksCommand,
    shareHooksCommand,
    shareHooksViaGistCommand,
    refreshHooksCommand,
    openHookScriptCommand,
    shareHookScriptCommand,
    shareHookScriptViaGistCommand,
    revealHookScriptCommand,
    deleteHookScriptCommand,
    configWatcher,
    sendToChatCommand,
    sendSelectionToChatCommand,
    copySelectionAsPromptCommand,
    sendHttpRequestCommand,
    copyCurlCommandCommand,
    runAssertionsCommand,
    selectEnvironmentCommand,
    openEnvironmentsCommand,
    createEnvironmentCommand,
    initializeEnvironmentsCommand,
    generateHttpLlmsCommand,
    minifyFileCommand,
    trimClipboardCommand,
    trimClipboardWithPromptCommand,
    refineSelectionWithAICommand,
    refineClipboardWithAICommand,
    processWithPromptCommand,
    configureGeminiApiKeyCommand,
    removeGeminiApiKeyCommand,
    shareViaGistCommand,
    shareFolderViaGistCommand,
    configureGitHubTokenCommand,
    removeGitHubTokenCommand,
    browseSkillsMarketplaceCommand,
    refreshSkillsCommand,
    showReleaseNotesCommand
  );
  
  // Dispose decoration provider
  context.subscriptions.push({
    dispose: () => decorationProvider.dispose()
  });
}

export function deactivate() {
  // Dispose environment manager watchers
  const envManager = EnvironmentManager.getInstance();
  envManager.dispose();
}

