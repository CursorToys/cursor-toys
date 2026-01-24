import * as vscode from 'vscode';
import * as path from 'path';
import * as zlib from 'zlib';
import { getFileTypeFromPath, sanitizeFileName, isAllowedExtension, getBaseFolderName, getEnvironmentsFolderName } from './utils';
import { GistManager } from './gistManager';

const MAX_CONTENT_SIZE = 50 * 1024 * 1024; // 50MB limit for safety

/**
 * Generates a shareable link for the specified file
 * @param filePath File path
 * @param forcedType Forced type (optional). If provided, uses this type instead of detecting by folder
 * @returns Shareable URL in format: cursortoys://TYPE:name:compressedData
 */
export async function generateShareable(
  filePath: string,
  forcedType?: 'command' | 'rule' | 'prompt' | 'notepad' | 'http' | 'env' | 'hooks' | 'plan' | 'skill'
): Promise<string | null> {
  try {
    // Read configuration
    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md']);

    // Check if file exists
    const uri = vscode.Uri.file(filePath);
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      vscode.window.showErrorMessage(`File not found: ${filePath}`);
      return null;
    }

    // Detect or use forced type
    let fileType: 'command' | 'rule' | 'prompt' | 'notepad' | 'http' | 'env' | 'hooks' | 'plan' | 'skill' | null;
    if (forcedType) {
      fileType = forcedType;
    } else {
      fileType = getFileTypeFromPath(filePath);
      if (!fileType) {
        vscode.window.showErrorMessage('File must be in commands/, rules/, prompts/, notepads/, plans/, http/ or http/environments/ folder');
        return null;
      }
    }

    // Validate file extension based on type
    if (fileType === 'http') {
      const ext = path.extname(filePath).substring(1).toLowerCase();
      if (ext !== 'req' && ext !== 'request') {
        vscode.window.showErrorMessage('HTTP files must have .req or .request extension');
        return null;
      }
    } else if (fileType === 'env') {
      const fileName = path.basename(filePath);
      if (!fileName.startsWith('.env')) {
        vscode.window.showErrorMessage('Environment files must start with .env');
        return null;
      }
    } else if (fileType === 'plan') {
      // Plans must have .plan.md extension
      const fileName = path.basename(filePath);
      if (!fileName.endsWith('.plan.md')) {
        vscode.window.showErrorMessage('Plan files must have .plan.md extension');
        return null;
      }
    } else if (fileType === 'skill') {
      // Skills must be SKILL.md files
      const fileName = path.basename(filePath);
      if (fileName !== 'SKILL.md') {
        vscode.window.showErrorMessage('Skill files must be named SKILL.md');
        return null;
      }
    } else {
      // For command, rule, prompt, notepad - validate extension
      if (!isAllowedExtension(filePath, allowedExtensions)) {
        vscode.window.showErrorMessage(
          `File extension is not in the allowed extensions list: ${allowedExtensions.join(', ')}`
        );
        return null;
      }
    }

    // Read file content
    const document = await vscode.workspace.openTextDocument(uri);
    const content = document.getText();

    // Validate content size
    if (content.length > MAX_CONTENT_SIZE) {
      vscode.window.showErrorMessage(
        `File too large (${(content.length / 1024 / 1024).toFixed(2)} MB). Maximum size is 50 MB.`
      );
      return null;
    }

    // Get file name without extension
    let fileName: string;
    if (fileType === 'skill') {
      // For skills, the name is the folder name (parent of SKILL.md)
      const skillFolderPath = path.dirname(filePath);
      fileName = path.basename(skillFolderPath);
      
      // Collect all files from the skill folder
      const skillFiles = await collectSkillFiles(skillFolderPath);
      
      // Create structured data with all files
      const skillData = {
        skillName: fileName,
        files: skillFiles
      };
      
      // Compress and encode the structured data
      const skillDataJson = JSON.stringify(skillData);
      const compressedData = compressAndEncode(skillDataJson);
      
      // Build shareable URL
      const sanitizedName = sanitizeFileName(fileName);
      return buildShareableUrl(fileType, sanitizedName, compressedData);
    } else {
      fileName = path.parse(filePath).name;
    }
    const sanitizedName = sanitizeFileName(fileName);

    // Compress and encode content
    const compressedData = compressAndEncode(content);

    // Build shareable URL (fileType cannot be null here due to validation above)
    if (!fileType) {
      vscode.window.showErrorMessage('Unable to determine file type');
      return null;
    }
    const shareable = buildShareableUrl(fileType, sanitizedName, compressedData);

    return shareable;
  } catch (error) {
    vscode.window.showErrorMessage(`Error generating shareable: ${error}`);
    return null;
  }
}

/**
 * Compresses content using gzip and encodes it to base64
 * @param content Content to compress
 * @returns Base64 encoded compressed content
 */
export function compressAndEncode(content: string): string {
  try {
    // Convert string to Buffer
    const buffer = Buffer.from(content, 'utf8');
    
    // Compress using gzip
    const compressed = zlib.gzipSync(buffer, {
      level: zlib.constants.Z_BEST_COMPRESSION
    });
    
    // Encode to base64
    const encoded = compressed.toString('base64');
    
    return encoded;
  } catch (error) {
    throw new Error(`Failed to compress content: ${error}`);
  }
}

/**
 * Builds the shareable URL
 * @param type File type (command, rule, prompt, http, or env)
 * @param fileName Sanitized file name
 * @param compressedData Compressed and encoded content
 * @returns Shareable URL
 */
export function buildShareableUrl(
  type: 'command' | 'rule' | 'prompt' | 'notepad' | 'http' | 'env' | 'hooks' | 'plan' | 'skill',
  fileName: string,
  compressedData: string
): string {
  // Convert type to uppercase for protocol
  const typeUpperCase = type.toUpperCase();
  
  // Build URL: cursortoys://TYPE:name:data
  return `cursortoys://${typeUpperCase}:${fileName}:${compressedData}`;
}


/**
 * Generates a shareable link for the specified file with folder structure preservation
 * @param filePath File path
 * @param forcedType Forced type (optional). If provided, uses this type instead of detecting by folder
 * @returns Shareable URL in format: cursortoys://TYPE_PATH:relativePath:name:compressedData
 */
export async function generateShareableWithPath(
  filePath: string,
  forcedType?: 'http' | 'env'
): Promise<string | null> {
  try {
    // Check if file exists
    const uri = vscode.Uri.file(filePath);
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      vscode.window.showErrorMessage(`File not found: ${filePath}`);
      return null;
    }

    // Detect or use forced type
    let fileType: 'http' | 'env' | null;
    if (forcedType) {
      fileType = forcedType;
    } else {
      const detectedType = getFileTypeFromPath(filePath);
      if (detectedType === 'http' || detectedType === 'env') {
        fileType = detectedType;
      } else {
        fileType = null;
      }
      if (!fileType) {
        vscode.window.showErrorMessage('File must be in http/ or http/environments/ folder');
        return null;
      }
    }

    // Validate file extension based on type
    if (fileType === 'http') {
      const ext = path.extname(filePath).substring(1).toLowerCase();
      if (ext !== 'req' && ext !== 'request') {
        vscode.window.showErrorMessage('HTTP files must have .req or .request extension');
        return null;
      }
    } else if (fileType === 'env') {
      const fileName = path.basename(filePath);
      if (!fileName.startsWith('.env')) {
        vscode.window.showErrorMessage('Environment files must start with .env');
        return null;
      }
    }

    // Read file content
    const document = await vscode.workspace.openTextDocument(uri);
    const content = document.getText();

    // Validate content size
    if (content.length > MAX_CONTENT_SIZE) {
      vscode.window.showErrorMessage(
        `File too large (${(content.length / 1024 / 1024).toFixed(2)} MB). Maximum size is 50 MB.`
      );
      return null;
    }

    // Extract relative path from http/ or http/{environmentsFolder}/
    const normalizedPath = filePath.replace(/\\/g, '/');
    const baseFolderName = getBaseFolderName();
    const environmentsFolderName = getEnvironmentsFolderName();
    
    let relativePath = '';
    let fileName = path.basename(filePath);
    
    if (fileType === 'http') {
      // Extract path after http/ folder
      const httpFolderPattern = new RegExp(`\\.${baseFolderName}\\/http\\/(.+)$`);
      const cursorHttpPattern = /\.cursor\/http\/(.+)$/;
      
      const httpMatch = normalizedPath.match(httpFolderPattern);
      const cursorMatch = normalizedPath.match(cursorHttpPattern);
      
      if (httpMatch) {
        relativePath = httpMatch[1];
      } else if (cursorMatch) {
        relativePath = cursorMatch[1];
      } else {
        relativePath = fileName;
      }
    } else if (fileType === 'env') {
      // Extract path after http/{environmentsFolder}/ folder
      const envFolderPattern = new RegExp(`\\.${baseFolderName}\\/http\\/${environmentsFolderName}\\/(.+)$`);
      const cursorEnvPattern = new RegExp(`\\.cursor\\/http\\/${environmentsFolderName}\\/(.+)$`);
      // Also support legacy 'environments' folder
      const legacyEnvPattern = new RegExp(`\\.(${baseFolderName}|cursor)\\/http\\/environments\\/(.+)$`);
      
      const envMatch = normalizedPath.match(envFolderPattern);
      const cursorMatch = normalizedPath.match(cursorEnvPattern);
      const legacyMatch = normalizedPath.match(legacyEnvPattern);
      
      if (envMatch) {
        relativePath = envMatch[1];
      } else if (cursorMatch) {
        relativePath = cursorMatch[1];
      } else if (legacyMatch) {
        relativePath = legacyMatch[2];
      } else {
        relativePath = fileName;
      }
    }

    // Get file name without extension for display
    const fileNameWithoutExt = path.parse(fileName).name;
    const sanitizedName = sanitizeFileName(fileNameWithoutExt);

    // Compress and encode content
    const compressedData = compressAndEncode(content);

    // Build shareable URL with path
    const shareable = buildShareableUrlWithPath(fileType, relativePath, sanitizedName, compressedData);

    return shareable;
  } catch (error) {
    vscode.window.showErrorMessage(`Error generating shareable with path: ${error}`);
    return null;
  }
}

/**
 * Builds the shareable URL with folder structure
 * @param type File type (http or env)
 * @param relativePath Relative path from http/ or http/environments/
 * @param fileName Sanitized file name
 * @param compressedData Compressed and encoded content
 * @returns Shareable URL
 */
export function buildShareableUrlWithPath(
  type: 'http' | 'env',
  relativePath: string,
  fileName: string,
  compressedData: string
): string {
  // Convert type to uppercase for protocol
  const typeUpperCase = type.toUpperCase();
  
  // Encode relative path to be URL safe
  const encodedPath = encodeURIComponent(relativePath);
  
  // Build URL: cursortoys://TYPE_PATH:relativePath:name:data
  return `cursortoys://${typeUpperCase}_PATH:${encodedPath}:${fileName}:${compressedData}`;
}

/**
 * Recursively collects all HTTP request files (.req, .request) from a folder
 * @param folderPath Folder path to scan
 * @returns Array of file paths
 */
async function collectHttpFilesFromFolder(folderPath: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const folderUri = vscode.Uri.file(folderPath);
    const entries = await vscode.workspace.fs.readDirectory(folderUri);
    
    for (const [name, type] of entries) {
      const fullPath = path.join(folderPath, name);
      
      if (type === vscode.FileType.Directory) {
        // Recursively scan subdirectories
        const subFiles = await collectHttpFilesFromFolder(fullPath);
        files.push(...subFiles);
      } else if (type === vscode.FileType.File) {
        // Check if file has .req or .request extension
        const ext = path.extname(name).substring(1).toLowerCase();
        if (ext === 'req' || ext === 'request') {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading folder ${folderPath}:`, error);
  }
  
  return files;
}

/**
 * Recursively collects all command/rule/prompt files from a folder
 * @param folderPath Folder path to scan
 * @param allowedExtensions Allowed file extensions
 * @returns Array of file paths
 */
async function collectMarkdownFilesFromFolder(folderPath: string, allowedExtensions: string[]): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const folderUri = vscode.Uri.file(folderPath);
    const entries = await vscode.workspace.fs.readDirectory(folderUri);
    
    for (const [name, type] of entries) {
      const fullPath = path.join(folderPath, name);
      
      if (type === vscode.FileType.Directory) {
        // Recursively scan subdirectories
        const subFiles = await collectMarkdownFilesFromFolder(fullPath, allowedExtensions);
        files.push(...subFiles);
      } else if (type === vscode.FileType.File) {
        // Check if file has allowed extension
        const ext = path.extname(name).substring(1).toLowerCase();
        if (allowedExtensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading folder ${folderPath}:`, error);
  }
  
  return files;
}

/**
 * Recursively collects all environment files (.env*) from a folder
 * @param folderPath Folder path to scan
 * @returns Array of file paths
 */
async function collectEnvFilesFromFolder(folderPath: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const folderUri = vscode.Uri.file(folderPath);
    const entries = await vscode.workspace.fs.readDirectory(folderUri);
    
    for (const [name, type] of entries) {
      const fullPath = path.join(folderPath, name);
      
      if (type === vscode.FileType.Directory) {
        // Recursively scan subdirectories
        const subFiles = await collectEnvFilesFromFolder(fullPath);
        files.push(...subFiles);
      } else if (type === vscode.FileType.File) {
        // Check if file starts with .env
        if (name.startsWith('.env')) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading folder ${folderPath}:`, error);
  }
  
  return files;
}

/**
 * Generates shareable links for all HTTP files in a folder
 * @param folderPath Folder path to share
 * @returns Array of shareable URLs
 */
export async function generateShareableForHttpFolder(
  folderPath: string
): Promise<string[] | null> {
  try {
    // Check if folder exists
    const folderUri = vscode.Uri.file(folderPath);
    try {
      const stat = await vscode.workspace.fs.stat(folderUri);
      if (stat.type !== vscode.FileType.Directory) {
        vscode.window.showErrorMessage('Selected path is not a folder');
        return null;
      }
    } catch {
      vscode.window.showErrorMessage(`Folder not found: ${folderPath}`);
      return null;
    }

    // Collect all HTTP files
    const files = await collectHttpFilesFromFolder(folderPath);
    
    if (files.length === 0) {
      vscode.window.showWarningMessage('No HTTP request files (.req, .request) found in folder');
      return null;
    }

    // Generate shareable for each file (with path preservation)
    const shareables: string[] = [];
    for (const filePath of files) {
      const shareable = await generateShareableWithPath(filePath, 'http');
      if (shareable) {
        shareables.push(shareable);
      }
    }

    if (shareables.length === 0) {
      vscode.window.showErrorMessage('Failed to generate shareables for files');
      return null;
    }

    return shareables;
  } catch (error) {
    vscode.window.showErrorMessage(`Error generating folder shareables: ${error}`);
    return null;
  }
}

/**
 * Generates shareable links for all environment files in a folder
 * @param folderPath Folder path to share
 * @returns Array of shareable URLs
 */
export async function generateShareableForEnvFolder(
  folderPath: string
): Promise<string[] | null> {
  try {
    // Check if folder exists
    const folderUri = vscode.Uri.file(folderPath);
    try {
      const stat = await vscode.workspace.fs.stat(folderUri);
      if (stat.type !== vscode.FileType.Directory) {
        vscode.window.showErrorMessage('Selected path is not a folder');
        return null;
      }
    } catch {
      vscode.window.showErrorMessage(`Folder not found: ${folderPath}`);
      return null;
    }

    // Collect all environment files
    const files = await collectEnvFilesFromFolder(folderPath);
    
    if (files.length === 0) {
      vscode.window.showWarningMessage('No environment files (.env*) found in folder');
      return null;
    }

    // Generate shareable for each file (with path preservation)
    const shareables: string[] = [];
    for (const filePath of files) {
      const shareable = await generateShareableWithPath(filePath, 'env');
      if (shareable) {
        shareables.push(shareable);
      }
    }

    if (shareables.length === 0) {
      vscode.window.showErrorMessage('Failed to generate shareables for files');
      return null;
    }

    return shareables;
  } catch (error) {
    vscode.window.showErrorMessage(`Error generating folder shareables: ${error}`);
    return null;
  }
}

/**
 * Generates shareable links for all HTTP files and environment files in a folder
 * @param httpFolderPath HTTP folder path to share
 * @returns Single shareable URL containing all files as a bundle
 */
export async function generateShareableForHttpFolderWithEnv(
  httpFolderPath: string
): Promise<string | null> {
  try {
    // Check if folder exists
    const folderUri = vscode.Uri.file(httpFolderPath);
    try {
      const stat = await vscode.workspace.fs.stat(folderUri);
      if (stat.type !== vscode.FileType.Directory) {
        vscode.window.showErrorMessage('Selected path is not a folder');
        return null;
      }
    } catch {
      vscode.window.showErrorMessage(`Folder not found: ${httpFolderPath}`);
      return null;
    }

    const files: Array<{ type: 'http' | 'env', relativePath: string, content: string }> = [];
    const baseFolderName = getBaseFolderName();

    // Collect HTTP files
    const httpFiles = await collectHttpFilesFromFolder(httpFolderPath);
    
    for (const filePath of httpFiles) {
      // Read file content
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      const content = document.getText();
      
      // Extract relative path
      const normalizedPath = filePath.replace(/\\/g, '/');
      const httpFolderPattern = new RegExp(`\\.${baseFolderName}\\/http\\/(.+)$`);
      const cursorHttpPattern = /\.cursor\/http\/(.+)$/;
      
      const httpMatch = normalizedPath.match(httpFolderPattern);
      const cursorMatch = normalizedPath.match(cursorHttpPattern);
      
      let relativePath = '';
      if (httpMatch) {
        relativePath = httpMatch[1];
      } else if (cursorMatch) {
        relativePath = cursorMatch[1];
      } else {
        relativePath = path.basename(filePath);
      }
      
      files.push({
        type: 'http',
        relativePath: relativePath,
        content: content
      });
    }

    // Check if environments folder exists (try configured name first, then legacy)
    const environmentsFolderName = getEnvironmentsFolderName();
    const environmentsPath = path.join(httpFolderPath, environmentsFolderName);
    const legacyEnvironmentsPath = path.join(httpFolderPath, 'environments');
    
    // Try configured environments folder
    try {
      const envStat = await vscode.workspace.fs.stat(vscode.Uri.file(environmentsPath));
      if (envStat.type === vscode.FileType.Directory) {
        // Collect environment files
        const envFiles = await collectEnvFilesFromFolder(environmentsPath);
        
        for (const filePath of envFiles) {
          // Read file content
          const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
          const content = document.getText();
          
          // Extract relative path
          const normalizedPath = filePath.replace(/\\/g, '/');
          const envFolderPattern = new RegExp(`\\.${baseFolderName}\\/http\\/${environmentsFolderName}\\/(.+)$`);
          const cursorEnvPattern = new RegExp(`\\.cursor\\/http\\/${environmentsFolderName}\\/(.+)$`);
          
          const envMatch = normalizedPath.match(envFolderPattern);
          const cursorMatch = normalizedPath.match(cursorEnvPattern);
          
          let relativePath = '';
          if (envMatch) {
            relativePath = `${environmentsFolderName}/${envMatch[1]}`;
          } else if (cursorMatch) {
            relativePath = `${environmentsFolderName}/${cursorMatch[1]}`;
          } else {
            relativePath = `${environmentsFolderName}/${path.basename(filePath)}`;
          }
          
          files.push({
            type: 'env',
            relativePath: relativePath,
            content: content
          });
        }
      }
    } catch {
      // Configured folder doesn't exist, try legacy
      try {
        const legacyEnvStat = await vscode.workspace.fs.stat(vscode.Uri.file(legacyEnvironmentsPath));
        if (legacyEnvStat.type === vscode.FileType.Directory && environmentsFolderName !== 'environments') {
          // Collect environment files from legacy folder
          const envFiles = await collectEnvFilesFromFolder(legacyEnvironmentsPath);
          
          for (const filePath of envFiles) {
            // Read file content
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
            const content = document.getText();
            
            // Extract relative path
            const normalizedPath = filePath.replace(/\\/g, '/');
            const legacyEnvPattern = new RegExp(`\\.(${baseFolderName}|cursor)\\/http\\/environments\\/(.+)$`);
            const legacyMatch = normalizedPath.match(legacyEnvPattern);
            
            let relativePath = '';
            if (legacyMatch) {
              relativePath = `environments/${legacyMatch[2]}`;
            } else {
              relativePath = `environments/${path.basename(filePath)}`;
            }
            
            files.push({
              type: 'env',
              relativePath: relativePath,
              content: content
            });
          }
        }
      } catch {
        // Neither folder exists, that's OK
      }
    }

    if (files.length === 0) {
      vscode.window.showWarningMessage('No HTTP request files or environment files found');
      return null;
    }

    // Create bundle object
    const bundle = {
      files: files
    };

    // Compress and encode the entire bundle
    const bundleJson = JSON.stringify(bundle);
    const compressedData = compressAndEncode(bundleJson);

    // Build shareable URL: cursortoys://HTTP_BUNDLE:data
    return `cursortoys://HTTP_BUNDLE:${compressedData}`;
  } catch (error) {
    vscode.window.showErrorMessage(`Error generating folder shareables: ${error}`);
    return null;
  }
}

/**
 * Generates shareable bundle for all command files in a folder
 * @param folderPath Command folder path to share
 * @returns Single shareable URL containing all command files as a bundle
 */
export async function generateShareableForCommandFolder(
  folderPath: string
): Promise<string | null> {
  try {
    // Check if folder exists
    const folderUri = vscode.Uri.file(folderPath);
    try {
      const stat = await vscode.workspace.fs.stat(folderUri);
      if (stat.type !== vscode.FileType.Directory) {
        vscode.window.showErrorMessage('Selected path is not a folder');
        return null;
      }
    } catch {
      vscode.window.showErrorMessage(`Folder not found: ${folderPath}`);
      return null;
    }

    // Get allowed extensions
    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);

    const files: Array<{ name: string, content: string }> = [];

    // Collect command files
    const commandFiles = await collectMarkdownFilesFromFolder(folderPath, allowedExtensions);
    
    if (commandFiles.length === 0) {
      vscode.window.showWarningMessage('No command files found in folder');
      return null;
    }

    for (const filePath of commandFiles) {
      // Read file content
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      const content = document.getText();
      
      // Get file name without extension
      const fileName = path.basename(filePath, path.extname(filePath));
      
      files.push({
        name: fileName,
        content: content
      });
    }

    // Create bundle object
    const bundle = { files };

    // Compress and encode the entire bundle
    const bundleJson = JSON.stringify(bundle);
    const compressedData = compressAndEncode(bundleJson);

    // Build shareable URL: cursortoys://COMMAND_BUNDLE:data
    return `cursortoys://COMMAND_BUNDLE:${compressedData}`;
  } catch (error) {
    vscode.window.showErrorMessage(`Error generating command bundle: ${error}`);
    return null;
  }
}

/**
 * Generates shareable bundle for all rule files in a folder
 * @param folderPath Rule folder path to share
 * @returns Single shareable URL containing all rule files as a bundle
 */
export async function generateShareableForRuleFolder(
  folderPath: string
): Promise<string | null> {
  try {
    // Check if folder exists
    const folderUri = vscode.Uri.file(folderPath);
    try {
      const stat = await vscode.workspace.fs.stat(folderUri);
      if (stat.type !== vscode.FileType.Directory) {
        vscode.window.showErrorMessage('Selected path is not a folder');
        return null;
      }
    } catch {
      vscode.window.showErrorMessage(`Folder not found: ${folderPath}`);
      return null;
    }

    // Get allowed extensions
    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);

    const files: Array<{ name: string, content: string }> = [];

    // Collect rule files
    const ruleFiles = await collectMarkdownFilesFromFolder(folderPath, allowedExtensions);
    
    if (ruleFiles.length === 0) {
      vscode.window.showWarningMessage('No rule files found in folder');
      return null;
    }

    for (const filePath of ruleFiles) {
      // Read file content
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      const content = document.getText();
      
      // Get file name without extension
      const fileName = path.basename(filePath, path.extname(filePath));
      
      files.push({
        name: fileName,
        content: content
      });
    }

    // Create bundle object
    const bundle = { files };

    // Compress and encode the entire bundle
    const bundleJson = JSON.stringify(bundle);
    const compressedData = compressAndEncode(bundleJson);

    // Build shareable URL: cursortoys://RULE_BUNDLE:data
    return `cursortoys://RULE_BUNDLE:${compressedData}`;
  } catch (error) {
    vscode.window.showErrorMessage(`Error generating rule bundle: ${error}`);
    return null;
  }
}

/**
 * Generates shareable bundle for all prompt files in a folder
 * @param folderPath Prompt folder path to share
 * @returns Single shareable URL containing all prompt files as a bundle
 */
export async function generateShareableForPromptFolder(
  folderPath: string
): Promise<string | null> {
  try {
    // Check if folder exists
    const folderUri = vscode.Uri.file(folderPath);
    try {
      const stat = await vscode.workspace.fs.stat(folderUri);
      if (stat.type !== vscode.FileType.Directory) {
        vscode.window.showErrorMessage('Selected path is not a folder');
        return null;
      }
    } catch {
      vscode.window.showErrorMessage(`Folder not found: ${folderPath}`);
      return null;
    }

    // Get allowed extensions
    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);

    const files: Array<{ name: string, content: string }> = [];

    // Collect prompt files
    const promptFiles = await collectMarkdownFilesFromFolder(folderPath, allowedExtensions);
    
    if (promptFiles.length === 0) {
      vscode.window.showWarningMessage('No prompt files found in folder');
      return null;
    }

    for (const filePath of promptFiles) {
      // Read file content
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      const content = document.getText();
      
      // Get file name without extension
      const fileName = path.basename(filePath, path.extname(filePath));
      
      files.push({
        name: fileName,
        content: content
      });
    }

    // Create bundle object
    const bundle = { files };

    // Compress and encode the entire bundle
    const bundleJson = JSON.stringify(bundle);
    const compressedData = compressAndEncode(bundleJson);

    // Build shareable URL: cursortoys://PROMPT_BUNDLE:data
    return `cursortoys://PROMPT_BUNDLE:${compressedData}`;
  } catch (error) {
    vscode.window.showErrorMessage(`Error generating prompt bundle: ${error}`);
    return null;
  }
}

/**
 * Generates shareable bundle for all skill folders in a folder
 * @param folderPath Skills folder path to share
 * @returns Single shareable URL containing all skill folders as a bundle
 */
export async function generateShareableForSkillFolder(
  folderPath: string
): Promise<string | null> {
  try {
    // Check if folder exists
    const folderUri = vscode.Uri.file(folderPath);
    try {
      const stat = await vscode.workspace.fs.stat(folderUri);
      if (stat.type !== vscode.FileType.Directory) {
        vscode.window.showErrorMessage('Selected path is not a folder');
        return null;
      }
    } catch {
      vscode.window.showErrorMessage(`Folder not found: ${folderPath}`);
      return null;
    }

    const skills: Array<{ name: string; files: Array<{ path: string; content: string }> }> = [];

    // Collect skill folders (folders containing SKILL.md)
    const skillFolders = await collectSkillFoldersFromFolder(folderPath);
    
    if (skillFolders.length === 0) {
      vscode.window.showWarningMessage('No skill folders found in folder');
      return null;
    }

    for (const skillFolderPath of skillFolders) {
      // Get skill folder name
      const skillName = path.basename(skillFolderPath);
      
      // Collect all files from the skill folder
      const skillFiles = await collectSkillFiles(skillFolderPath);
      
      skills.push({
        name: skillName,
        files: skillFiles
      });
    }

    // Create bundle object with new structure
    const bundle = { skills };

    // Compress and encode the entire bundle
    const bundleJson = JSON.stringify(bundle);
    const compressedData = compressAndEncode(bundleJson);

    // Build shareable URL: cursortoys://SKILL_BUNDLE:data
    return `cursortoys://SKILL_BUNDLE:${compressedData}`;
  } catch (error) {
    vscode.window.showErrorMessage(`Error generating skill bundle: ${error}`);
    return null;
  }
}

/**
 * Collects all files from a skill folder recursively
 * @param skillFolderPath Path to the skill folder
 * @returns Array of files with relative paths and contents
 */
async function collectSkillFiles(skillFolderPath: string): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = [];
  const skillFolderUri = vscode.Uri.file(skillFolderPath);
  
  // Directories to ignore
  const ignoredDirs = ['.git', 'node_modules', '.DS_Store'];
  
  async function collectRecursive(currentPath: string, relativeBase: string = ''): Promise<void> {
    try {
      const currentUri = vscode.Uri.file(currentPath);
      const entries = await vscode.workspace.fs.readDirectory(currentUri);
      
      for (const [name, type] of entries) {
        // Skip hidden files and ignored directories
        if (name.startsWith('.') && !ignoredDirs.includes(name)) {
          continue;
        }
        if (ignoredDirs.includes(name)) {
          continue;
        }
        
        const itemPath = path.join(currentPath, name);
        const relativePath = relativeBase ? path.join(relativeBase, name) : name;
        
        if (type === vscode.FileType.Directory) {
          // Recursively collect files from subdirectories
          await collectRecursive(itemPath, relativePath);
        } else if (type === vscode.FileType.File) {
          // Read file content
          try {
            const fileUri = vscode.Uri.file(itemPath);
            const fileContent = await vscode.workspace.fs.readFile(fileUri);
            const content = Buffer.from(fileContent).toString('utf8');
            files.push({
              path: relativePath.replace(/\\/g, '/'), // Normalize to forward slashes
              content: content
            });
          } catch (error) {
            console.error(`Error reading file ${itemPath}:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${currentPath}:`, error);
    }
  }
  
  await collectRecursive(skillFolderPath);
  return files;
}

/**
 * Collects all skill folders (folders containing SKILL.md) from a directory recursively
 * @param folderPath Base folder path to search
 * @returns Array of skill folder paths
 */
async function collectSkillFoldersFromFolder(folderPath: string): Promise<string[]> {
  const skillFolders: string[] = [];
  const folderUri = vscode.Uri.file(folderPath);

  try {
    const entries = await vscode.workspace.fs.readDirectory(folderUri);

    for (const [name, type] of entries) {
      const itemPath = path.join(folderPath, name);

      if (type === vscode.FileType.Directory) {
        // Check if this directory is a skill folder (contains SKILL.md)
        const skillFilePath = path.join(itemPath, 'SKILL.md');
        try {
          await vscode.workspace.fs.stat(vscode.Uri.file(skillFilePath));
          // This is a skill folder
          skillFolders.push(itemPath);
        } catch {
          // Not a skill folder, recursively search subdirectories
          const subSkillFolders = await collectSkillFoldersFromFolder(itemPath);
          skillFolders.push(...subSkillFolders);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${folderPath}:`, error);
  }

  return skillFolders;
}

/**
 * Generates shareable bundle for all notepad files in a folder
 * @param folderPath Notepad folder path to share
 * @returns Single shareable URL containing all notepad files as a bundle
 */
export async function generateShareableForNotepadFolder(
  folderPath: string
): Promise<string | null> {
  try {
    // Check if folder exists
    const folderUri = vscode.Uri.file(folderPath);
    try {
      const stat = await vscode.workspace.fs.stat(folderUri);
      if (stat.type !== vscode.FileType.Directory) {
        vscode.window.showErrorMessage('Selected path is not a folder');
        return null;
      }
    } catch {
      vscode.window.showErrorMessage(`Folder not found: ${folderPath}`);
      return null;
    }

    // Get allowed extensions
    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);

    const files: Array<{ name: string, content: string }> = [];

    // Collect notepad files
    const notepadFiles = await collectMarkdownFilesFromFolder(folderPath, allowedExtensions);
    
    if (notepadFiles.length === 0) {
      vscode.window.showWarningMessage('No notepad files found in folder');
      return null;
    }

    for (const filePath of notepadFiles) {
      // Read file content
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      const content = document.getText();
      
      // Get file name without extension
      const fileName = path.basename(filePath, path.extname(filePath));
      
      files.push({
        name: fileName,
        content: content
      });
    }

    // Create bundle object
    const bundle = { files };

    // Compress and encode the entire bundle
    const bundleJson = JSON.stringify(bundle);
    const compressedData = compressAndEncode(bundleJson);

    // Build shareable URL: cursortoys://NOTEPAD_BUNDLE:data
    return `cursortoys://NOTEPAD_BUNDLE:${compressedData}`;
  } catch (error) {
    vscode.window.showErrorMessage(`Error generating notepad bundle: ${error}`);
    return null;
  }
}

/**
 * Generates shareable bundle for all plan files in a folder
 * @param folderPath Plan folder path to share
 * @returns Single shareable URL containing all plan files as a bundle
 */
export async function generateShareableForPlanFolder(
  folderPath: string
): Promise<string | null> {
  try {
    // Check if folder exists
    const folderUri = vscode.Uri.file(folderPath);
    try {
      const stat = await vscode.workspace.fs.stat(folderUri);
      if (stat.type !== vscode.FileType.Directory) {
        vscode.window.showErrorMessage('Selected path is not a folder');
        return null;
      }
    } catch {
      vscode.window.showErrorMessage(`Folder not found: ${folderPath}`);
      return null;
    }

    const files: Array<{ name: string, content: string }> = [];

    // Collect plan files (only .plan.md)
    const planFiles: string[] = [];
    try {
      const folderUri = vscode.Uri.file(folderPath);
      const entries = await vscode.workspace.fs.readDirectory(folderUri);
      
      for (const [name, type] of entries) {
        const fullPath = path.join(folderPath, name);
        
        if (type === vscode.FileType.Directory) {
          // Recursively scan subdirectories
          const subFiles = await collectPlanFilesFromFolder(fullPath);
          planFiles.push(...subFiles);
        } else if (type === vscode.FileType.File) {
          // Check if file has .plan.md extension
          if (name.endsWith('.plan.md')) {
            planFiles.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`Error reading folder ${folderPath}:`, error);
    }
    
    if (planFiles.length === 0) {
      vscode.window.showWarningMessage('No plan files (.plan.md) found in folder');
      return null;
    }

    for (const filePath of planFiles) {
      // Read file content
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      const content = document.getText();
      
      // Get file name without extension
      const fileName = path.basename(filePath, '.plan.md');
      
      files.push({
        name: fileName,
        content: content
      });
    }

    // Create bundle object
    const bundle = { files };

    // Compress and encode the entire bundle
    const bundleJson = JSON.stringify(bundle);
    const compressedData = compressAndEncode(bundleJson);

    // Build shareable URL: cursortoys://PLAN_BUNDLE:data
    return `cursortoys://PLAN_BUNDLE:${compressedData}`;
  } catch (error) {
    vscode.window.showErrorMessage(`Error generating plan bundle: ${error}`);
    return null;
  }
}

/**
 * Recursively collects all plan files (.plan.md) from a folder
 * @param folderPath Folder path to scan
 * @returns Array of file paths
 */
async function collectPlanFilesFromFolder(folderPath: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const folderUri = vscode.Uri.file(folderPath);
    const entries = await vscode.workspace.fs.readDirectory(folderUri);
    
    for (const [name, type] of entries) {
      const fullPath = path.join(folderPath, name);
      
      if (type === vscode.FileType.Directory) {
        // Recursively scan subdirectories
        const subFiles = await collectPlanFilesFromFolder(fullPath);
        files.push(...subFiles);
      } else if (type === vscode.FileType.File) {
        // Check if file has .plan.md extension
        if (name.endsWith('.plan.md')) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading folder ${folderPath}:`, error);
  }
  
  return files;
}

/**
 * Generates shareable bundle for entire project (.cursor folder)
 * @param cursorFolderPath Path to .cursor folder
 * @returns Single shareable URL containing entire project as a bundle
 */
export async function generateShareableForProject(
  cursorFolderPath: string
): Promise<string | null> {
  try {
    // Check if folder exists
    const folderUri = vscode.Uri.file(cursorFolderPath);
    try {
      const stat = await vscode.workspace.fs.stat(folderUri);
      if (stat.type !== vscode.FileType.Directory) {
        vscode.window.showErrorMessage('Selected path is not a folder');
        return null;
      }
    } catch {
      vscode.window.showErrorMessage(`Folder not found: ${cursorFolderPath}`);
      return null;
    }

    // Get allowed extensions
    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
    const baseFolderName = path.basename(cursorFolderPath);

    const bundle: any = {
      commands: [],
      rules: [],
      prompts: [],
      notepads: [],
      plans: [],
      http: []
    };

    // Collect commands
    const commandsPath = path.join(cursorFolderPath, 'commands');
    try {
      const commandFiles = await collectMarkdownFilesFromFolder(commandsPath, allowedExtensions);
      for (const filePath of commandFiles) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        const fileName = path.basename(filePath, path.extname(filePath));
        bundle.commands.push({ name: fileName, content: document.getText() });
      }
    } catch {}

    // Collect rules
    const rulesPath = path.join(cursorFolderPath, 'rules');
    try {
      const ruleFiles = await collectMarkdownFilesFromFolder(rulesPath, allowedExtensions);
      for (const filePath of ruleFiles) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        const fileName = path.basename(filePath, path.extname(filePath));
        bundle.rules.push({ name: fileName, content: document.getText() });
      }
    } catch {}

    // Collect prompts
    const promptsPath = path.join(cursorFolderPath, 'prompts');
    try {
      const promptFiles = await collectMarkdownFilesFromFolder(promptsPath, allowedExtensions);
      for (const filePath of promptFiles) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        const fileName = path.basename(filePath, path.extname(filePath));
        bundle.prompts.push({ name: fileName, content: document.getText() });
      }
    } catch {}

    // Collect notepads
    const notepadsPath = path.join(cursorFolderPath, 'notepads');
    try {
      const notepadFiles = await collectMarkdownFilesFromFolder(notepadsPath, allowedExtensions);
      for (const filePath of notepadFiles) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        const fileName = path.basename(filePath, path.extname(filePath));
        bundle.notepads.push({ name: fileName, content: document.getText() });
      }
    } catch {}

    // Collect plans
    const plansPath = path.join(cursorFolderPath, 'plans');
    try {
      const planFiles = await collectPlanFilesFromFolder(plansPath);
      for (const filePath of planFiles) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        const fileName = path.basename(filePath, '.plan.md');
        bundle.plans.push({ name: fileName, content: document.getText() });
      }
    } catch {}

    // Collect HTTP files
    const httpPath = path.join(cursorFolderPath, 'http');
    try {
      const httpFiles = await collectHttpFilesFromFolder(httpPath);
      const environmentsFolderName = getEnvironmentsFolderName();
      
      for (const filePath of httpFiles) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        const normalizedPath = filePath.replace(/\\/g, '/');
        const httpMatch = normalizedPath.match(/\/http\/(.+)$/);
        const relativePath = httpMatch ? httpMatch[1] : path.basename(filePath);
        
        bundle.http.push({
          type: 'http',
          relativePath: relativePath,
          content: document.getText()
        });
      }
      
      // Collect environment files
      const environmentsPath = path.join(httpPath, environmentsFolderName);
      try {
        const envFiles = await collectEnvFilesFromFolder(environmentsPath);
        for (const filePath of envFiles) {
          const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
          const normalizedPath = filePath.replace(/\\/g, '/');
          const envMatch = normalizedPath.match(new RegExp(`\\/${environmentsFolderName}\\/(.+)$`));
          const relativePath = envMatch ? `${environmentsFolderName}/${envMatch[1]}` : path.basename(filePath);
          
          bundle.http.push({
            type: 'env',
            relativePath: relativePath,
            content: document.getText()
          });
        }
      } catch {}
    } catch {}

    // Check if we have any files
    const totalFiles = bundle.commands.length + bundle.rules.length + bundle.prompts.length + bundle.notepads.length + bundle.plans.length + bundle.http.length;
    if (totalFiles === 0) {
      vscode.window.showWarningMessage('No files found in project folder');
      return null;
    }

    // Compress and encode the entire bundle
    const bundleJson = JSON.stringify(bundle);
    const compressedData = compressAndEncode(bundleJson);

    // Build shareable URL: cursortoys://PROJECT_BUNDLE:data
    return `cursortoys://PROJECT_BUNDLE:${compressedData}`;
  } catch (error) {
    vscode.window.showErrorMessage(`Error generating project bundle: ${error}`);
    return null;
  }
}

/**
 * Generates a GitHub Gist for a single file
 * @param filePath File path
 * @param forcedType Forced type (optional)
 * @param context Extension context for GistManager
 * @returns Gist URL or null if failed
 */
export async function generateGistShareable(
  filePath: string,
  forcedType?: 'command' | 'rule' | 'prompt' | 'notepad' | 'http' | 'env' | 'hooks' | 'plan' | 'skill',
  context?: vscode.ExtensionContext
): Promise<string | null> {
  try {
    if (!context) {
      vscode.window.showErrorMessage('Extension context not available');
      return null;
    }

    const gistManager = GistManager.getInstance(context);

    // Ensure token is configured
    const hasToken = await gistManager.ensureTokenConfigured();
    if (!hasToken) {
      return null;
    }

    // Determine visibility
    const isPublic = await gistManager.determineVisibility();
    if (isPublic === null) {
      return null; // User cancelled
    }

    // Read configuration
    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md']);

    // Check if file exists
    const uri = vscode.Uri.file(filePath);
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      vscode.window.showErrorMessage(`File not found: ${filePath}`);
      return null;
    }

    // Detect or use forced type
    let fileType: 'command' | 'rule' | 'prompt' | 'notepad' | 'http' | 'env' | 'hooks' | 'plan' | 'skill' | null;
    if (forcedType) {
      fileType = forcedType;
    } else {
      fileType = getFileTypeFromPath(filePath);
      if (!fileType) {
        vscode.window.showErrorMessage('File must be in commands/, rules/, prompts/, notepads/, plans/, http/ or http/environments/ folder');
        return null;
      }
    }

    // Validate file extension based on type
    if (fileType === 'http') {
      const ext = path.extname(filePath).substring(1).toLowerCase();
      if (ext !== 'req' && ext !== 'request') {
        vscode.window.showErrorMessage('HTTP files must have .req or .request extension');
        return null;
      }
    } else if (fileType === 'env') {
      const fileName = path.basename(filePath);
      if (!fileName.startsWith('.env')) {
        vscode.window.showErrorMessage('Environment files must start with .env');
        return null;
      }
    } else if (fileType === 'plan') {
      // Plans must have .plan.md extension
      const fileName = path.basename(filePath);
      if (!fileName.endsWith('.plan.md')) {
        vscode.window.showErrorMessage('Plan files must have .plan.md extension');
        return null;
      }
    } else {
      // For command, rule, prompt, notepad - validate extension
      if (!isAllowedExtension(filePath, allowedExtensions)) {
        vscode.window.showErrorMessage(
          `File extension is not in the allowed extensions list: ${allowedExtensions.join(', ')}`
        );
        return null;
      }
    }

    // Read file content
    const document = await vscode.workspace.openTextDocument(uri);
    const content = document.getText();

    // Get file name with extension
    const fileName = path.basename(filePath);
    const fileNameWithoutExt = path.parse(filePath).name;

    // Build metadata (fileType cannot be null here)
    if (!fileType) {
      vscode.window.showErrorMessage('Unable to determine file type');
      return null;
    }

    const metadata = gistManager.buildMetadata(
      fileType,
      [{ name: fileName, type: fileType, size: content.length }]
    );

    // Build description
    const description = gistManager.buildGistDescription(
      fileType,
      fileNameWithoutExt
    );

    // Create gist files object
    const files: { [filename: string]: { content: string } } = {
      [fileName]: { content },
      '.cursortoys-metadata.json': { content: JSON.stringify(metadata, null, 2) }
    };

    // Create gist
    vscode.window.showInformationMessage('Creating Gist...');
    const gistUrl = await gistManager.createGist(files, description, isPublic);

    return gistUrl;
  } catch (error) {
    vscode.window.showErrorMessage(`Error creating Gist: ${error}`);
    return null;
  }
}

/**
 * Generates a GitHub Gist for a bundle (folder of files)
 * @param bundleType Type of bundle
 * @param folderPath Folder path to share
 * @param context Extension context for GistManager
 * @returns Gist URL or null if failed
 */
export async function generateGistShareableForBundle(
  bundleType: 'command' | 'rule' | 'prompt' | 'notepad' | 'http' | 'project' | 'plan',
  folderPath: string,
  context?: vscode.ExtensionContext
): Promise<string | null> {
  try {
    if (!context) {
      vscode.window.showErrorMessage('Extension context not available');
      return null;
    }

    const gistManager = GistManager.getInstance(context);

    // Ensure token is configured
    const hasToken = await gistManager.ensureTokenConfigured();
    if (!hasToken) {
      return null;
    }

    // Determine visibility
    const isPublic = await gistManager.determineVisibility();
    if (isPublic === null) {
      return null; // User cancelled
    }

    // Check if folder exists
    const folderUri = vscode.Uri.file(folderPath);
    try {
      const stat = await vscode.workspace.fs.stat(folderUri);
      if (stat.type !== vscode.FileType.Directory) {
        vscode.window.showErrorMessage('Selected path is not a folder');
        return null;
      }
    } catch {
      vscode.window.showErrorMessage(`Folder not found: ${folderPath}`);
      return null;
    }

    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
    const files: { [filename: string]: { content: string } } = {};
    const fileMetadata: Array<{ name: string; type: string; size: number }> = [];

    // Collect files based on bundle type
    if (bundleType === 'command') {
      const commandFiles = await collectMarkdownFilesFromFolder(folderPath, allowedExtensions);
      for (const filePath of commandFiles) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        const content = document.getText();
        const fileName = path.basename(filePath);
        files[fileName] = { content };
        fileMetadata.push({ name: fileName, type: 'command', size: content.length });
      }
    } else if (bundleType === 'rule') {
      const ruleFiles = await collectMarkdownFilesFromFolder(folderPath, allowedExtensions);
      for (const filePath of ruleFiles) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        const content = document.getText();
        const fileName = path.basename(filePath);
        files[fileName] = { content };
        fileMetadata.push({ name: fileName, type: 'rule', size: content.length });
      }
    } else if (bundleType === 'prompt') {
      const promptFiles = await collectMarkdownFilesFromFolder(folderPath, allowedExtensions);
      for (const filePath of promptFiles) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        const content = document.getText();
        const fileName = path.basename(filePath);
        files[fileName] = { content };
        fileMetadata.push({ name: fileName, type: 'prompt', size: content.length });
      }
    } else if (bundleType === 'notepad') {
      const notepadFiles = await collectMarkdownFilesFromFolder(folderPath, allowedExtensions);
      for (const filePath of notepadFiles) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        const content = document.getText();
        const fileName = path.basename(filePath);
        files[fileName] = { content };
        fileMetadata.push({ name: fileName, type: 'notepad', size: content.length });
      }
    } else if (bundleType === 'plan') {
      const planFiles = await collectPlanFilesFromFolder(folderPath);
      for (const filePath of planFiles) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        const content = document.getText();
        const fileName = path.basename(filePath);
        files[fileName] = { content };
        fileMetadata.push({ name: fileName, type: 'plan', size: content.length });
      }
    } else if (bundleType === 'http') {
      const httpFiles = await collectHttpFilesFromFolder(folderPath);
      for (const filePath of httpFiles) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        const content = document.getText();
        const fileName = path.basename(filePath);
        files[fileName] = { content };
        fileMetadata.push({ name: fileName, type: 'http', size: content.length });
      }

      // Also collect environment files if they exist
      const environmentsFolderName = getEnvironmentsFolderName();
      const environmentsPath = path.join(folderPath, environmentsFolderName);
      try {
        const envFiles = await collectEnvFilesFromFolder(environmentsPath);
        for (const filePath of envFiles) {
          const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
          const content = document.getText();
          const fileName = path.basename(filePath);
          files[fileName] = { content };
          fileMetadata.push({ name: fileName, type: 'env', size: content.length });
        }
      } catch {
        // No environment files, that's OK
      }
    } else if (bundleType === 'project') {
      // Collect all file types from project
      const commandsPath = path.join(folderPath, 'commands');
      const rulesPath = path.join(folderPath, 'rules');
      const promptsPath = path.join(folderPath, 'prompts');
      const notepadsPath = path.join(folderPath, 'notepads');
      const plansPath = path.join(folderPath, 'plans');
      const httpPath = path.join(folderPath, 'http');

      // Commands
      try {
        const commandFiles = await collectMarkdownFilesFromFolder(commandsPath, allowedExtensions);
        for (const filePath of commandFiles) {
          const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
          const content = document.getText();
          const fileName = `commands/${path.basename(filePath)}`;
          files[fileName] = { content };
          fileMetadata.push({ name: fileName, type: 'command', size: content.length });
        }
      } catch {}

      // Rules
      try {
        const ruleFiles = await collectMarkdownFilesFromFolder(rulesPath, allowedExtensions);
        for (const filePath of ruleFiles) {
          const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
          const content = document.getText();
          const fileName = `rules/${path.basename(filePath)}`;
          files[fileName] = { content };
          fileMetadata.push({ name: fileName, type: 'rule', size: content.length });
        }
      } catch {}

      // Prompts
      try {
        const promptFiles = await collectMarkdownFilesFromFolder(promptsPath, allowedExtensions);
        for (const filePath of promptFiles) {
          const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
          const content = document.getText();
          const fileName = `prompts/${path.basename(filePath)}`;
          files[fileName] = { content };
          fileMetadata.push({ name: fileName, type: 'prompt', size: content.length });
        }
      } catch {}

      // Notepads
      try {
        const notepadFiles = await collectMarkdownFilesFromFolder(notepadsPath, allowedExtensions);
        for (const filePath of notepadFiles) {
          const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
          const content = document.getText();
          const fileName = `notepads/${path.basename(filePath)}`;
          files[fileName] = { content };
          fileMetadata.push({ name: fileName, type: 'notepad', size: content.length });
        }
      } catch {}

      // Plans
      try {
        const planFiles = await collectPlanFilesFromFolder(plansPath);
        for (const filePath of planFiles) {
          const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
          const content = document.getText();
          const fileName = `plans/${path.basename(filePath)}`;
          files[fileName] = { content };
          fileMetadata.push({ name: fileName, type: 'plan', size: content.length });
        }
      } catch {}

      // HTTP files
      try {
        const httpFiles = await collectHttpFilesFromFolder(httpPath);
        for (const filePath of httpFiles) {
          const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
          const content = document.getText();
          const fileName = `http/${path.basename(filePath)}`;
          files[fileName] = { content };
          fileMetadata.push({ name: fileName, type: 'http', size: content.length });
        }
      } catch {}
    }

    if (Object.keys(files).length === 0) {
      vscode.window.showWarningMessage('No files found to share');
      return null;
    }

    // Build metadata
    const bundleTypeStr = `${bundleType}_bundle`;
    const metadata = gistManager.buildMetadata(
      'bundle',
      fileMetadata,
      bundleTypeStr
    );

    // Build description
    const folderName = path.basename(folderPath);
    const description = gistManager.buildGistDescription(
      'bundle',
      folderName,
      bundleTypeStr
    );

    // Add metadata file
    files['.cursortoys-metadata.json'] = { content: JSON.stringify(metadata, null, 2) };

    // Create gist
    vscode.window.showInformationMessage('Creating Gist bundle...');
    const gistUrl = await gistManager.createGist(files, description, isPublic);

    return gistUrl;
  } catch (error) {
    vscode.window.showErrorMessage(`Error creating Gist bundle: ${error}`);
    return null;
  }
}

/**
 * Generates a shareable link for a hooks.json file
 * @param filePath File path to hooks.json
 * @returns Shareable URL in format: cursortoys://HOOKS:name:compressedData
 */
export async function generateShareableForHooks(
  filePath: string
): Promise<string | null> {
  try {
    // Check if file exists
    const uri = vscode.Uri.file(filePath);
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      vscode.window.showErrorMessage(`File not found: ${filePath}`);
      return null;
    }

    // Validate that it's a hooks.json file
    const fileName = path.basename(filePath);
    if (fileName !== 'hooks.json') {
      vscode.window.showErrorMessage('File must be named hooks.json');
      return null;
    }

    // Read file content
    const document = await vscode.workspace.openTextDocument(uri);
    const content = document.getText();

    // Validate content size
    if (content.length > MAX_CONTENT_SIZE) {
      vscode.window.showErrorMessage(
        `File too large (${(content.length / 1024 / 1024).toFixed(2)} MB). Maximum size is 50 MB.`
      );
      return null;
    }

    // Validate JSON structure (basic check)
    try {
      const parsed = JSON.parse(content);
      if (!parsed.version || !parsed.hooks) {
        vscode.window.showErrorMessage('Invalid hooks.json structure. Must have version and hooks fields.');
        return null;
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Invalid JSON format: ${error}`);
      return null;
    }

    // Compress and encode content
    const compressedData = compressAndEncode(content);

    // Build shareable URL
    const shareable = `cursortoys://HOOKS:hooks:${compressedData}`;

    return shareable;
  } catch (error) {
    vscode.window.showErrorMessage(`Error generating shareable for hooks: ${error}`);
    return null;
  }
}

/**
 * Generates a GitHub Gist for a hooks.json file
 * @param filePath File path to hooks.json
 * @param context Extension context for GistManager
 * @returns Gist URL or null if failed
 */
export async function generateGistShareableForHooks(
  filePath: string,
  context?: vscode.ExtensionContext
): Promise<string | null> {
  try {
    if (!context) {
      vscode.window.showErrorMessage('Extension context not available');
      return null;
    }

    const gistManager = GistManager.getInstance(context);

    // Ensure token is configured
    const hasToken = await gistManager.ensureTokenConfigured();
    if (!hasToken) {
      return null;
    }

    // Determine visibility
    const isPublic = await gistManager.determineVisibility();
    if (isPublic === null) {
      return null; // User cancelled
    }

    // Check if file exists
    const uri = vscode.Uri.file(filePath);
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      vscode.window.showErrorMessage(`File not found: ${filePath}`);
      return null;
    }

    // Validate that it's a hooks.json file
    const fileName = path.basename(filePath);
    if (fileName !== 'hooks.json') {
      vscode.window.showErrorMessage('File must be named hooks.json');
      return null;
    }

    // Read file content
    const document = await vscode.workspace.openTextDocument(uri);
    const content = document.getText();

    // Validate JSON structure (basic check)
    try {
      const parsed = JSON.parse(content);
      if (!parsed.version || !parsed.hooks) {
        vscode.window.showErrorMessage('Invalid hooks.json structure. Must have version and hooks fields.');
        return null;
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Invalid JSON format: ${error}`);
      return null;
    }

    // Build metadata
    const metadata = gistManager.buildMetadata(
      'hooks',
      [{ name: fileName, type: 'hooks', size: content.length }]
    );

    // Build description
    const description = gistManager.buildGistDescription('hooks', 'Cursor Hooks Configuration');

    // Create gist files object
    const files: { [filename: string]: { content: string } } = {
      [fileName]: { content },
      '.cursortoys-metadata.json': { content: JSON.stringify(metadata, null, 2) }
    };

    // Create gist
    vscode.window.showInformationMessage('Creating Gist for hooks...');
    const gistUrl = await gistManager.createGist(files, description, isPublic);

    return gistUrl;
  } catch (error) {
    vscode.window.showErrorMessage(`Error creating Gist for hooks: ${error}`);
    return null;
  }
}


