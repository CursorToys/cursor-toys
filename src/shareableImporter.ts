import * as vscode from 'vscode';
import * as path from 'path';
import * as zlib from 'zlib';
import { sanitizeFileName, getCommandsPath, getPromptsPath, getRulesPath, getHttpPath, getEnvironmentsPath } from './utils';

interface ShareableParams {
  type: 'command' | 'prompt' | 'rule' | 'http' | 'env';
  name: string;
  content: string; // Already decompressed
  relativePath?: string; // Optional: relative path for HTTP_PATH and ENV_PATH types
}

/**
 * Imports a shareable and creates the corresponding file
 * @param shareableUrl Shareable URL in format: cursortoys://TYPE:name:compressedData or cursortoys://HTTP_BUNDLE:data
 */
export async function importShareable(shareableUrl: string): Promise<void> {
  try {
    // Check if it's a bundle type
    if (shareableUrl.startsWith('cursortoys://HTTP_BUNDLE:')) {
      await importHttpBundle(shareableUrl);
      return;
    }
    if (shareableUrl.startsWith('cursortoys://COMMAND_BUNDLE:')) {
      await importCommandBundle(shareableUrl);
      return;
    }
    if (shareableUrl.startsWith('cursortoys://RULE_BUNDLE:')) {
      await importRuleBundle(shareableUrl);
      return;
    }
    if (shareableUrl.startsWith('cursortoys://PROMPT_BUNDLE:')) {
      await importPromptBundle(shareableUrl);
      return;
    }
    if (shareableUrl.startsWith('cursortoys://PROJECT_BUNDLE:')) {
      await importProjectBundle(shareableUrl);
      return;
    }

    // Parse URL
    const params = parseShareableUrl(shareableUrl);
    if (!params) {
      // Error message already shown in parseShareableUrl
      return;
    }

    // For commands and prompts, ask if user wants to save as Project or Personal
    // HTTP and ENV files are always saved in project workspace
    let isPersonal = false;
    if (params.type === 'command' || params.type === 'prompt') {
      const itemType = params.type === 'command' ? 'command' : 'prompt';
      const itemLocation = await vscode.window.showQuickPick(
        [
          { 
            label: `Personal ${itemType}s`, 
            description: `Available in all projects (~/.cursor/${itemType}s)`, 
            value: true 
          },
          { 
            label: `Project ${itemType}s`, 
            description: 'Specific to this workspace', 
            value: false 
          }
        ],
        {
          placeHolder: `Where do you want to save this ${itemType}?`
        }
      );

      if (itemLocation === undefined) {
        // User cancelled
        return;
      }

      isPersonal = itemLocation.value;
    }

    // Get workspace folder (only needed for project files)
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder && !isPersonal) {
      vscode.window.showErrorMessage('No workspace open');
      return;
    }

    // Determine destination folder and file name
    const workspacePath = workspaceFolder?.uri.fsPath || '';
    const { folderPath, fileName } = getDestinationPath(params, workspacePath, isPersonal);

    // Check if file already exists
    const fileUri = vscode.Uri.file(path.join(folderPath, fileName));
    let fileExists = false;
    try {
      await vscode.workspace.fs.stat(fileUri);
      fileExists = true;
    } catch {
      // File doesn't exist, that's fine
    }

    if (fileExists) {
      const overwrite = await vscode.window.showWarningMessage(
        `File ${fileName} already exists. Do you want to overwrite it?`,
        'Yes',
        'No'
      );
      if (overwrite !== 'Yes') {
        return;
      }
    }

    // Create folder structure if it doesn't exist (recursively)
    const folderUri = vscode.Uri.file(folderPath);
    try {
      await vscode.workspace.fs.stat(folderUri);
    } catch {
      // Folder doesn't exist, create it recursively
      await createDirectoryRecursive(folderPath);
    }

    // Create file
    const content = Buffer.from(params.content, 'utf8');
    await vscode.workspace.fs.writeFile(fileUri, content);

    vscode.window.showInformationMessage(`File created: ${fileName}`);
    
    // Open file
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);
  } catch (error) {
    vscode.window.showErrorMessage(`Error importing shareable: ${error}`);
  }
}

/**
 * Imports a bundle of HTTP files (HTTP requests and environments)
 * @param bundleUrl Bundle URL in format: cursortoys://HTTP_BUNDLE:compressedData
 */
async function importHttpBundle(bundleUrl: string): Promise<void> {
  try {
    // Remove protocol
    const withoutProtocol = bundleUrl.substring('cursortoys://HTTP_BUNDLE:'.length);
    
    // Decompress and parse bundle
    const decompressed = decodeAndDecompress(withoutProtocol);
    const bundle = JSON.parse(decompressed);
    
    if (!bundle.files || !Array.isArray(bundle.files)) {
      vscode.window.showErrorMessage('Invalid bundle format');
      return;
    }

    // Get workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace open. Please open a folder first.');
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const httpBasePath = getHttpPath(workspacePath);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Import each file in the bundle
    for (const file of bundle.files) {
      try {
        const { type, relativePath, content } = file;
        
        // Determine full path
        let fullPath: string;
        if (type === 'http') {
          fullPath = path.join(httpBasePath, relativePath);
        } else if (type === 'env') {
          fullPath = path.join(httpBasePath, relativePath);
        } else {
          continue; // Skip unknown types
        }
        
        // Create directory structure if needed
        const dirPath = path.dirname(fullPath);
        await createDirectoryRecursive(dirPath);
        
        // Write file
        const fileUri = vscode.Uri.file(fullPath);
        const fileContent = Buffer.from(content, 'utf8');
        await vscode.workspace.fs.writeFile(fileUri, fileContent);
        
        successCount++;
      } catch (error) {
        console.error(`Error importing file ${file.relativePath}:`, error);
        errorCount++;
      }
    }
    
    // Show summary
    if (errorCount === 0) {
      vscode.window.showInformationMessage(
        `Successfully imported ${successCount} file(s)!`
      );
    } else {
      vscode.window.showWarningMessage(
        `Imported ${successCount} file(s), ${errorCount} failed.`
      );
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error importing HTTP bundle: ${error}`);
  }
}

/**
 * Imports a bundle of command files
 * @param bundleUrl Bundle URL in format: cursortoys://COMMAND_BUNDLE:compressedData
 */
async function importCommandBundle(bundleUrl: string): Promise<void> {
  try {
    const withoutProtocol = bundleUrl.substring('cursortoys://COMMAND_BUNDLE:'.length);
    const decompressed = decodeAndDecompress(withoutProtocol);
    const bundle = JSON.parse(decompressed);
    
    if (!bundle.files || !Array.isArray(bundle.files)) {
      vscode.window.showErrorMessage('Invalid bundle format');
      return;
    }

    // Ask if user wants to save as Project or Personal
    const itemLocation = await vscode.window.showQuickPick(
      [
        { label: 'Personal commands', description: 'Available in all projects (~/.cursor/commands)', value: true },
        { label: 'Project commands', description: 'Specific to this workspace', value: false }
      ],
      { placeHolder: 'Where do you want to save these commands?' }
    );

    if (itemLocation === undefined) {
      return;
    }

    const isPersonal = itemLocation.value;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    if (!workspaceFolder && !isPersonal) {
      vscode.window.showErrorMessage('No workspace open');
      return;
    }

    const workspacePath = workspaceFolder?.uri.fsPath || '';
    const commandsPath = getCommandsPath(workspacePath, isPersonal);
    
    // Get default extension
    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
    const defaultExtension = allowedExtensions[0] || 'md';

    let successCount = 0;
    let errorCount = 0;

    for (const file of bundle.files) {
      try {
        const { name, content } = file;
        const fileName = `${name}.${defaultExtension}`;
        const fullPath = path.join(commandsPath, fileName);
        
        // Create directory if needed
        await createDirectoryRecursive(commandsPath);
        
        // Write file
        const fileUri = vscode.Uri.file(fullPath);
        const fileContent = Buffer.from(content, 'utf8');
        await vscode.workspace.fs.writeFile(fileUri, fileContent);
        
        successCount++;
      } catch (error) {
        console.error(`Error importing command ${file.name}:`, error);
        errorCount++;
      }
    }

    if (errorCount === 0) {
      vscode.window.showInformationMessage(`Successfully imported ${successCount} command(s)!`);
    } else {
      vscode.window.showWarningMessage(`Imported ${successCount} command(s), ${errorCount} failed.`);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error importing command bundle: ${error}`);
  }
}

/**
 * Imports a bundle of rule files
 * @param bundleUrl Bundle URL in format: cursortoys://RULE_BUNDLE:compressedData
 */
async function importRuleBundle(bundleUrl: string): Promise<void> {
  try {
    const withoutProtocol = bundleUrl.substring('cursortoys://RULE_BUNDLE:'.length);
    const decompressed = decodeAndDecompress(withoutProtocol);
    const bundle = JSON.parse(decompressed);
    
    if (!bundle.files || !Array.isArray(bundle.files)) {
      vscode.window.showErrorMessage('Invalid bundle format');
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace open. Please open a folder first.');
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const rulesPath = getRulesPath(workspacePath, false);
    
    // Get default extension (prefer .mdc for rules)
    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
    const defaultExtension = allowedExtensions.includes('mdc') ? 'mdc' : (allowedExtensions[0] || 'md');

    let successCount = 0;
    let errorCount = 0;

    for (const file of bundle.files) {
      try {
        const { name, content } = file;
        const fileName = `${name}.${defaultExtension}`;
        const fullPath = path.join(rulesPath, fileName);
        
        // Create directory if needed
        await createDirectoryRecursive(rulesPath);
        
        // Write file
        const fileUri = vscode.Uri.file(fullPath);
        const fileContent = Buffer.from(content, 'utf8');
        await vscode.workspace.fs.writeFile(fileUri, fileContent);
        
        successCount++;
      } catch (error) {
        console.error(`Error importing rule ${file.name}:`, error);
        errorCount++;
      }
    }

    if (errorCount === 0) {
      vscode.window.showInformationMessage(`Successfully imported ${successCount} rule(s)!`);
    } else {
      vscode.window.showWarningMessage(`Imported ${successCount} rule(s), ${errorCount} failed.`);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error importing rule bundle: ${error}`);
  }
}

/**
 * Imports a bundle of prompt files
 * @param bundleUrl Bundle URL in format: cursortoys://PROMPT_BUNDLE:compressedData
 */
async function importPromptBundle(bundleUrl: string): Promise<void> {
  try {
    const withoutProtocol = bundleUrl.substring('cursortoys://PROMPT_BUNDLE:'.length);
    const decompressed = decodeAndDecompress(withoutProtocol);
    const bundle = JSON.parse(decompressed);
    
    if (!bundle.files || !Array.isArray(bundle.files)) {
      vscode.window.showErrorMessage('Invalid bundle format');
      return;
    }

    // Ask if user wants to save as Project or Personal
    const itemLocation = await vscode.window.showQuickPick(
      [
        { label: 'Personal prompts', description: 'Available in all projects (~/.cursor/prompts)', value: true },
        { label: 'Project prompts', description: 'Specific to this workspace', value: false }
      ],
      { placeHolder: 'Where do you want to save these prompts?' }
    );

    if (itemLocation === undefined) {
      return;
    }

    const isPersonal = itemLocation.value;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    if (!workspaceFolder && !isPersonal) {
      vscode.window.showErrorMessage('No workspace open');
      return;
    }

    const workspacePath = workspaceFolder?.uri.fsPath || '';
    const promptsPath = getPromptsPath(workspacePath, isPersonal);
    
    // Get default extension
    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
    const defaultExtension = allowedExtensions[0] || 'md';

    let successCount = 0;
    let errorCount = 0;

    for (const file of bundle.files) {
      try {
        const { name, content } = file;
        const fileName = `${name}.${defaultExtension}`;
        const fullPath = path.join(promptsPath, fileName);
        
        // Create directory if needed
        await createDirectoryRecursive(promptsPath);
        
        // Write file
        const fileUri = vscode.Uri.file(fullPath);
        const fileContent = Buffer.from(content, 'utf8');
        await vscode.workspace.fs.writeFile(fileUri, fileContent);
        
        successCount++;
      } catch (error) {
        console.error(`Error importing prompt ${file.name}:`, error);
        errorCount++;
      }
    }

    if (errorCount === 0) {
      vscode.window.showInformationMessage(`Successfully imported ${successCount} prompt(s)!`);
    } else {
      vscode.window.showWarningMessage(`Imported ${successCount} prompt(s), ${errorCount} failed.`);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error importing prompt bundle: ${error}`);
  }
}

/**
 * Imports a complete project bundle
 * @param bundleUrl Bundle URL in format: cursortoys://PROJECT_BUNDLE:compressedData
 */
async function importProjectBundle(bundleUrl: string): Promise<void> {
  try {
    const withoutProtocol = bundleUrl.substring('cursortoys://PROJECT_BUNDLE:'.length);
    const decompressed = decodeAndDecompress(withoutProtocol);
    const bundle = JSON.parse(decompressed);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace open. Please open a folder first.');
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
    const defaultExtension = allowedExtensions[0] || 'md';
    const ruleExtension = allowedExtensions.includes('mdc') ? 'mdc' : defaultExtension;

    let totalSuccess = 0;
    let totalError = 0;

    // Import commands
    if (bundle.commands && Array.isArray(bundle.commands)) {
      const commandsPath = getCommandsPath(workspacePath, false);
      await createDirectoryRecursive(commandsPath);
      
      for (const file of bundle.commands) {
        try {
          const fileName = `${file.name}.${defaultExtension}`;
          const fullPath = path.join(commandsPath, fileName);
          const fileUri = vscode.Uri.file(fullPath);
          await vscode.workspace.fs.writeFile(fileUri, Buffer.from(file.content, 'utf8'));
          totalSuccess++;
        } catch (error) {
          console.error(`Error importing command ${file.name}:`, error);
          totalError++;
        }
      }
    }

    // Import rules
    if (bundle.rules && Array.isArray(bundle.rules)) {
      const rulesPath = getRulesPath(workspacePath, false);
      await createDirectoryRecursive(rulesPath);
      
      for (const file of bundle.rules) {
        try {
          const fileName = `${file.name}.${ruleExtension}`;
          const fullPath = path.join(rulesPath, fileName);
          const fileUri = vscode.Uri.file(fullPath);
          await vscode.workspace.fs.writeFile(fileUri, Buffer.from(file.content, 'utf8'));
          totalSuccess++;
        } catch (error) {
          console.error(`Error importing rule ${file.name}:`, error);
          totalError++;
        }
      }
    }

    // Import prompts
    if (bundle.prompts && Array.isArray(bundle.prompts)) {
      const promptsPath = getPromptsPath(workspacePath, false);
      await createDirectoryRecursive(promptsPath);
      
      for (const file of bundle.prompts) {
        try {
          const fileName = `${file.name}.${defaultExtension}`;
          const fullPath = path.join(promptsPath, fileName);
          const fileUri = vscode.Uri.file(fullPath);
          await vscode.workspace.fs.writeFile(fileUri, Buffer.from(file.content, 'utf8'));
          totalSuccess++;
        } catch (error) {
          console.error(`Error importing prompt ${file.name}:`, error);
          totalError++;
        }
      }
    }

    // Import HTTP files
    if (bundle.http && Array.isArray(bundle.http)) {
      const httpBasePath = getHttpPath(workspacePath);
      
      for (const file of bundle.http) {
        try {
          const fullPath = path.join(httpBasePath, file.relativePath);
          const dirPath = path.dirname(fullPath);
          await createDirectoryRecursive(dirPath);
          
          const fileUri = vscode.Uri.file(fullPath);
          await vscode.workspace.fs.writeFile(fileUri, Buffer.from(file.content, 'utf8'));
          totalSuccess++;
        } catch (error) {
          console.error(`Error importing HTTP file ${file.relativePath}:`, error);
          totalError++;
        }
      }
    }

    // Show summary
    if (totalError === 0) {
      vscode.window.showInformationMessage(`Successfully imported complete project with ${totalSuccess} file(s)!`);
    } else {
      vscode.window.showWarningMessage(`Imported ${totalSuccess} file(s), ${totalError} failed.`);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error importing project bundle: ${error}`);
  }
}

/**
 * Parses the shareable URL and extracts parameters
 * @param url Shareable URL
 * @returns Parsed parameters or null if invalid
 */
export function parseShareableUrl(url: string): ShareableParams | null {
  try {
    const trimmedUrl = url.trim();

    // Validate protocol
    if (!trimmedUrl.startsWith('cursortoys://')) {
      vscode.window.showErrorMessage('Invalid shareable format. Must start with cursortoys://');
      return null;
    }

    // Remove protocol
    const withoutProtocol = trimmedUrl.substring('cursortoys://'.length);

    // Split by colon to get TYPE:name:data or TYPE_PATH:relativePath:name:data
    const parts = withoutProtocol.split(':');
    
    if (parts.length < 3) {
      vscode.window.showErrorMessage('Invalid shareable format. Expected format: cursortoys://TYPE:name:data');
      return null;
    }

    // Extract type (handle both TYPE and TYPE_PATH)
    const typeStr = parts[0].toUpperCase();
    let type: 'command' | 'prompt' | 'rule' | 'http' | 'env';
    let hasPath = false;
    let relativePath: string | undefined;
    
    if (typeStr === 'COMMAND') {
      type = 'command';
    } else if (typeStr === 'PROMPT') {
      type = 'prompt';
    } else if (typeStr === 'RULE') {
      type = 'rule';
    } else if (typeStr === 'HTTP') {
      type = 'http';
    } else if (typeStr === 'ENV') {
      type = 'env';
    } else if (typeStr === 'HTTP_PATH') {
      type = 'http';
      hasPath = true;
    } else if (typeStr === 'ENV_PATH') {
      type = 'env';
      hasPath = true;
    } else {
      vscode.window.showErrorMessage(`Invalid type: ${typeStr}. Must be COMMAND, PROMPT, RULE, HTTP, ENV, HTTP_PATH, or ENV_PATH.`);
      return null;
    }

    let name: string;
    let compressedData: string;

    if (hasPath) {
      // Format: TYPE_PATH:relativePath:name:data
      if (parts.length < 4) {
        vscode.window.showErrorMessage('Invalid shareable format with path. Expected format: cursortoys://TYPE_PATH:relativePath:name:data');
        return null;
      }

      // Extract relative path (decode URL encoding)
      relativePath = decodeURIComponent(parts[1]);
      if (!relativePath || relativePath.trim().length === 0) {
        vscode.window.showErrorMessage('Invalid shareable: relative path is empty');
        return null;
      }

      // Extract name
      name = parts[2];
      if (!name || name.trim().length === 0) {
        vscode.window.showErrorMessage('Invalid shareable: name is empty');
        return null;
      }

      // Extract compressed data (everything after the third colon)
      compressedData = parts.slice(3).join(':');
    } else {
      // Format: TYPE:name:data
      // Extract name
      name = parts[1];
      if (!name || name.trim().length === 0) {
        vscode.window.showErrorMessage('Invalid shareable: name is empty');
        return null;
      }

      // Extract compressed data (everything after the second colon)
      compressedData = parts.slice(2).join(':');
    }

    if (!compressedData || compressedData.trim().length === 0) {
      vscode.window.showErrorMessage('Invalid shareable: data is empty');
      return null;
    }

    // Decode and decompress
    let content: string;
    try {
      content = decodeAndDecompress(compressedData);
    } catch (error) {
      vscode.window.showErrorMessage(`Error decompressing data: ${error}`);
      return null;
    }

    return {
      type,
      name: sanitizeFileName(name),
      content,
      relativePath
    };
  } catch (error) {
    vscode.window.showErrorMessage(`Error parsing shareable: ${error}`);
    return null;
  }
}

/**
 * Decodes base64 and decompresses gzip content
 * @param compressedData Base64 encoded compressed content
 * @returns Decompressed content
 */
export function decodeAndDecompress(compressedData: string): string {
  try {
    // Decode from base64
    const buffer = Buffer.from(compressedData, 'base64');
    
    // Decompress using gunzip
    const decompressed = zlib.gunzipSync(buffer);
    
    // Convert to string
    const content = decompressed.toString('utf8');
    
    return content;
  } catch (error) {
    throw new Error(`Failed to decompress content: ${error}`);
  }
}

/**
 * Determines the destination path and file name based on parameters
 */
function getDestinationPath(
  params: ShareableParams,
  workspacePath: string,
  isPersonal: boolean = false
): { folderPath: string; fileName: string } {
  // Get allowed extensions configuration
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const defaultExtension = allowedExtensions[0] || 'md';

  let folderPath: string;
  let fileName: string;

  switch (params.type) {
    case 'command':
      folderPath = getCommandsPath(workspacePath, isPersonal);
      fileName = `${params.name}.${defaultExtension}`;
      break;
    case 'rule':
      folderPath = getRulesPath(workspacePath, isPersonal);
      // For rules, prefer .mdc if it's in the allowed extensions
      const ruleExtension = allowedExtensions.includes('mdc') ? 'mdc' : defaultExtension;
      fileName = `${params.name}.${ruleExtension}`;
      break;
    case 'prompt':
      folderPath = getPromptsPath(workspacePath, isPersonal);
      fileName = `${params.name}.${defaultExtension}`;
      break;
    case 'http':
      // HTTP files go to project workspace
      if (params.relativePath) {
        // Use relative path from HTTP_PATH type
        const httpBasePath = getHttpPath(workspacePath);
        const dirName = path.dirname(params.relativePath);
        folderPath = dirName === '.' ? httpBasePath : path.join(httpBasePath, dirName);
        fileName = path.basename(params.relativePath);
      } else {
        // Default: save directly in http/ folder
        folderPath = getHttpPath(workspacePath);
        fileName = `${params.name}.req`;
      }
      break;
    case 'env':
      // ENV files go to project workspace environments folder
      if (params.relativePath) {
        // Use relative path from ENV_PATH type
        const envBasePath = getEnvironmentsPath(workspacePath);
        const dirName = path.dirname(params.relativePath);
        folderPath = dirName === '.' ? envBasePath : path.join(envBasePath, dirName);
        fileName = path.basename(params.relativePath);
      } else {
        // Default: save directly in environments/ folder
        folderPath = getEnvironmentsPath(workspacePath);
        // Preserve .env prefix in the name
        fileName = params.name.startsWith('.env') ? params.name : `.env.${params.name}`;
      }
      break;
  }

  return { folderPath, fileName };
}

/**
 * Creates a directory recursively (including all parent directories)
 */
async function createDirectoryRecursive(dirPath: string): Promise<void> {
  const parts = dirPath.split(path.sep);
  let currentPath = parts[0] || path.sep;

  for (let i = 1; i < parts.length; i++) {
    currentPath = path.join(currentPath, parts[i]);
    const uri = vscode.Uri.file(currentPath);
    
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      // Directory doesn't exist, create it
      await vscode.workspace.fs.createDirectory(uri);
    }
  }
}

