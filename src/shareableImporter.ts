import * as vscode from 'vscode';
import * as path from 'path';
import * as zlib from 'zlib';
import { sanitizeFileName, getCommandsPath, getPromptsPath, getRulesPath, getNotepadsPath, getPlansPath, getSkillsPath, getHttpPath, getEnvironmentsPath, getHooksPath, createHttpLlmsFile } from './utils';
import { GistManager, GistResponse, CursorToysMetadata } from './gistManager';

interface ShareableParams {
  type: 'command' | 'prompt' | 'rule' | 'notepad' | 'http' | 'env' | 'hooks' | 'plan' | 'skill';
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
    if (shareableUrl.startsWith('cursortoys://NOTEPAD_BUNDLE:')) {
      await importNotepadBundle(shareableUrl);
      return;
    }
    if (shareableUrl.startsWith('cursortoys://PLAN_BUNDLE:')) {
      await importPlanBundle(shareableUrl);
      return;
    }
    if (shareableUrl.startsWith('cursortoys://SKILL_BUNDLE:')) {
      await importSkillBundle(shareableUrl);
      return;
    }
    if (shareableUrl.startsWith('cursortoys://PROJECT_BUNDLE:')) {
      await importProjectBundle(shareableUrl);
      return;
    }
    if (shareableUrl.startsWith('cursortoys://HOOKS:')) {
      await importHooks(shareableUrl);
      return;
    }

    // Parse URL
    const params = parseShareableUrl(shareableUrl);
    if (!params) {
      // Error message already shown in parseShareableUrl
      return;
    }

    // For commands, prompts, plans, and skills, ask if user wants to save as Project or Personal
    // Notepads and HTTP/ENV files are always saved in project workspace
    let isPersonal = false;
    if (params.type === 'command' || params.type === 'prompt' || params.type === 'plan' || params.type === 'skill') {
      const itemType = params.type === 'command' ? 'command' : params.type === 'prompt' ? 'prompt' : params.type === 'plan' ? 'plan' : 'skill';
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

    // Show appropriate message based on type
    if (params.type === 'skill') {
      vscode.window.showInformationMessage(`Skill created: ${params.name}`);
    } else {
      vscode.window.showInformationMessage(`File created: ${fileName}`);
    }
    
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
    
    // Create HTTP folder and llms.txt if needed
    let httpFolderCreated = false;
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(httpBasePath));
    } catch {
      // HTTP folder doesn't exist, create it
      await createDirectoryRecursive(httpBasePath);
      httpFolderCreated = true;
    }
    
    // Create llms.txt in HTTP folder if it was just created or doesn't exist
    if (httpFolderCreated) {
      await createHttpLlmsFile(httpBasePath);
    }
    
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
 * Imports a bundle of skill folders
 * @param bundleUrl Bundle URL in format: cursortoys://SKILL_BUNDLE:compressedData
 */
async function importSkillBundle(bundleUrl: string): Promise<void> {
  try {
    const withoutProtocol = bundleUrl.substring('cursortoys://SKILL_BUNDLE:'.length);
    const decompressed = decodeAndDecompress(withoutProtocol);
    const bundle = JSON.parse(decompressed);
    
    if (!bundle.files || !Array.isArray(bundle.files)) {
      vscode.window.showErrorMessage('Invalid bundle format');
      return;
    }

    // Ask if user wants to save as Project or Personal
    const itemLocation = await vscode.window.showQuickPick(
      [
        { label: 'Personal skills', description: 'Available in all projects (~/.cursor/skills)', value: true },
        { label: 'Project skills', description: 'Specific to this workspace', value: false }
      ],
      { placeHolder: 'Where do you want to save these skills?' }
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
    const skillsPath = getSkillsPath(workspacePath, isPersonal);
    
    let successCount = 0;
    let errorCount = 0;

    for (const file of bundle.files) {
      try {
        const { name, content } = file;
        // For skills, create a folder with the skill name and put SKILL.md inside
        const skillFolderPath = path.join(skillsPath, sanitizeFileName(name));
        const skillFilePath = path.join(skillFolderPath, 'SKILL.md');
        
        // Create directory if needed
        await createDirectoryRecursive(skillFolderPath);
        
        // Write SKILL.md file
        const fileUri = vscode.Uri.file(skillFilePath);
        const fileContent = Buffer.from(content, 'utf8');
        await vscode.workspace.fs.writeFile(fileUri, fileContent);
        
        successCount++;
      } catch (error) {
        console.error(`Error importing skill ${file.name}:`, error);
        errorCount++;
      }
    }

    if (errorCount === 0) {
      vscode.window.showInformationMessage(`Successfully imported ${successCount} skill(s)!`);
    } else {
      vscode.window.showWarningMessage(`Imported ${successCount} skill(s), ${errorCount} failed.`);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error importing skill bundle: ${error}`);
  }
}

/**
 * Imports a bundle of notepad files
 * @param bundleUrl Bundle URL in format: cursortoys://NOTEPAD_BUNDLE:compressedData
 */
async function importNotepadBundle(bundleUrl: string): Promise<void> {
  try {
    const withoutProtocol = bundleUrl.substring('cursortoys://NOTEPAD_BUNDLE:'.length);
    const decompressed = decodeAndDecompress(withoutProtocol);
    const bundle = JSON.parse(decompressed);
    
    if (!bundle.files || !Array.isArray(bundle.files)) {
      vscode.window.showErrorMessage('Invalid bundle format');
      return;
    }

    // Notepads are always saved in project workspace
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace open. Notepads are workspace-specific.');
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const notepadsPath = getNotepadsPath(workspacePath, false);
    
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
        const fullPath = path.join(notepadsPath, fileName);
        
        // Create directory if needed
        await createDirectoryRecursive(notepadsPath);
        
        // Write file
        const fileUri = vscode.Uri.file(fullPath);
        const fileContent = Buffer.from(content, 'utf8');
        await vscode.workspace.fs.writeFile(fileUri, fileContent);
        
        successCount++;
      } catch (error) {
        console.error(`Error importing notepad ${file.name}:`, error);
        errorCount++;
      }
    }

    if (errorCount === 0) {
      vscode.window.showInformationMessage(`Successfully imported ${successCount} notepad(s) to project!`);
    } else {
      vscode.window.showWarningMessage(`Imported ${successCount} notepad(s), ${errorCount} failed.`);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error importing notepad bundle: ${error}`);
  }
}

/**
 * Imports a bundle of plan files
 * @param bundleUrl Bundle URL in format: cursortoys://PLAN_BUNDLE:compressedData
 */
async function importPlanBundle(bundleUrl: string): Promise<void> {
  try {
    const withoutProtocol = bundleUrl.substring('cursortoys://PLAN_BUNDLE:'.length);
    const decompressed = decodeAndDecompress(withoutProtocol);
    const bundle = JSON.parse(decompressed);
    
    if (!bundle.files || !Array.isArray(bundle.files)) {
      vscode.window.showErrorMessage('Invalid bundle format');
      return;
    }

    // Ask if user wants to save as Project or Personal
    const itemLocation = await vscode.window.showQuickPick(
      [
        { label: 'Personal plans', description: 'Available in all projects (~/.cursor/plans)', value: true },
        { label: 'Project plans', description: 'Specific to this workspace', value: false }
      ],
      { placeHolder: 'Where do you want to save these plans?' }
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
    const plansPath = getPlansPath(workspacePath, isPersonal);

    let successCount = 0;
    let errorCount = 0;

    for (const file of bundle.files) {
      try {
        const { name, content } = file;
        const fileName = `${name}.plan.md`;
        const fullPath = path.join(plansPath, fileName);
        
        // Create directory if needed
        await createDirectoryRecursive(plansPath);
        
        // Write file
        const fileUri = vscode.Uri.file(fullPath);
        const fileContent = Buffer.from(content, 'utf8');
        await vscode.workspace.fs.writeFile(fileUri, fileContent);
        
        successCount++;
      } catch (error) {
        console.error(`Error importing plan ${file.name}:`, error);
        errorCount++;
      }
    }

    if (errorCount === 0) {
      const location = isPersonal ? 'personal' : 'project';
      vscode.window.showInformationMessage(`Successfully imported ${successCount} plan(s) to ${location}!`);
    } else {
      vscode.window.showWarningMessage(`Imported ${successCount} plan(s), ${errorCount} failed.`);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error importing plan bundle: ${error}`);
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

    // Import notepads
    if (bundle.notepads && Array.isArray(bundle.notepads)) {
      const notepadsPath = getNotepadsPath(workspacePath, false);
      await createDirectoryRecursive(notepadsPath);
      
      for (const file of bundle.notepads) {
        try {
          const fileName = `${file.name}.${defaultExtension}`;
          const fullPath = path.join(notepadsPath, fileName);
          const fileUri = vscode.Uri.file(fullPath);
          await vscode.workspace.fs.writeFile(fileUri, Buffer.from(file.content, 'utf8'));
          totalSuccess++;
        } catch (error) {
          console.error(`Error importing notepad ${file.name}:`, error);
          totalError++;
        }
      }
    }

    // Import plans
    if (bundle.plans && Array.isArray(bundle.plans)) {
      const plansPath = getPlansPath(workspacePath);
      await createDirectoryRecursive(plansPath);
      
      for (const file of bundle.plans) {
        try {
          const fileName = `${file.name}.plan.md`;
          const fullPath = path.join(plansPath, fileName);
          const fileUri = vscode.Uri.file(fullPath);
          await vscode.workspace.fs.writeFile(fileUri, Buffer.from(file.content, 'utf8'));
          totalSuccess++;
        } catch (error) {
          console.error(`Error importing plan ${file.name}:`, error);
          totalError++;
        }
      }
    }

    // Import HTTP files
    if (bundle.http && Array.isArray(bundle.http)) {
      const httpBasePath = getHttpPath(workspacePath);
      
      // Create HTTP folder and llms.txt if needed
      let httpFolderCreated = false;
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(httpBasePath));
      } catch {
        // HTTP folder doesn't exist, create it
        await createDirectoryRecursive(httpBasePath);
        httpFolderCreated = true;
      }
      
      // Create llms.txt in HTTP folder if it was just created or doesn't exist
      if (httpFolderCreated) {
        await createHttpLlmsFile(httpBasePath);
      }
      
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
 * Imports a hooks.json file from a shareable URL
 * @param shareableUrl Shareable URL in format: cursortoys://HOOKS:name:compressedData
 */
async function importHooks(shareableUrl: string): Promise<void> {
  try {
    // Remove protocol
    const withoutProtocol = shareableUrl.substring('cursortoys://HOOKS:'.length);
    
    // Split to get name:data
    const parts = withoutProtocol.split(':');
    if (parts.length < 2) {
      vscode.window.showErrorMessage('Invalid hooks shareable format');
      return;
    }

    // Extract compressed data (everything after the first colon)
    const compressedData = parts.slice(1).join(':');
    
    // Decompress content
    const content = decodeAndDecompress(compressedData);
    
    // Validate JSON structure
    try {
      const parsed = JSON.parse(content);
      if (!parsed.version || !parsed.hooks) {
        vscode.window.showErrorMessage('Invalid hooks.json structure. Must have version and hooks fields.');
        return;
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Invalid JSON format: ${error}`);
      return;
    }

    // Ask if user wants to save as Project or Personal
    const itemLocation = await vscode.window.showQuickPick(
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
      { placeHolder: 'Where do you want to save this hooks.json?' }
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
    const hooksPath = getHooksPath(workspacePath, isPersonal);
    
    // Check if file already exists
    const fileUri = vscode.Uri.file(hooksPath);
    let fileExists = false;
    try {
      await vscode.workspace.fs.stat(fileUri);
      fileExists = true;
    } catch {
      // File doesn't exist
    }

    if (fileExists) {
      const overwrite = await vscode.window.showWarningMessage(
        'hooks.json already exists. Do you want to overwrite it?',
        'Yes',
        'No'
      );
      if (overwrite !== 'Yes') {
        return;
      }
    }

    // Create directory if needed
    const dirPath = path.dirname(hooksPath);
    await createDirectoryRecursive(dirPath);

    // Write file
    const fileContent = Buffer.from(content, 'utf8');
    await vscode.workspace.fs.writeFile(fileUri, fileContent);

    vscode.window.showInformationMessage('Hooks imported successfully!');
    
    // Open file
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);
  } catch (error) {
    vscode.window.showErrorMessage(`Error importing hooks: ${error}`);
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
    let type: 'command' | 'prompt' | 'notepad' | 'rule' | 'http' | 'env' | 'hooks' | 'plan' | 'skill';
    let hasPath = false;
    let relativePath: string | undefined;
    
    if (typeStr === 'COMMAND') {
      type = 'command';
    } else if (typeStr === 'PROMPT') {
      type = 'prompt';
    } else if (typeStr === 'NOTEPAD') {
      type = 'notepad';
    } else if (typeStr === 'RULE') {
      type = 'rule';
    } else if (typeStr === 'HTTP') {
      type = 'http';
    } else if (typeStr === 'ENV') {
      type = 'env';
    } else if (typeStr === 'HOOKS') {
      type = 'hooks';
    } else if (typeStr === 'PLAN') {
      type = 'plan';
    } else if (typeStr === 'SKILL') {
      type = 'skill';
    } else if (typeStr === 'HTTP_PATH') {
      type = 'http';
      hasPath = true;
    } else if (typeStr === 'ENV_PATH') {
      type = 'env';
      hasPath = true;
    } else {
      vscode.window.showErrorMessage(`Invalid type: ${typeStr}. Must be COMMAND, PROMPT, NOTEPAD, RULE, HTTP, ENV, HOOKS, PLAN, SKILL, HTTP_PATH, or ENV_PATH.`);
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
    case 'notepad':
      folderPath = getNotepadsPath(workspacePath, isPersonal);
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
    case 'hooks':
      // Hooks files (hooks.json)
      folderPath = path.dirname(getHooksPath(workspacePath, isPersonal));
      fileName = 'hooks.json';
      break;
    case 'plan':
      // Plans can be personal or workspace-specific
      folderPath = getPlansPath(workspacePath, isPersonal);
      fileName = `${params.name}.plan.md`;
      break;
    case 'skill':
      // Skills are folders containing SKILL.md
      const skillsBasePath = getSkillsPath(workspacePath, isPersonal);
      folderPath = path.join(skillsBasePath, sanitizeFileName(params.name));
      fileName = 'SKILL.md';
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

/**
 * Imports a file or bundle from a GitHub Gist
 * @param gistIdOrUrl Gist ID or URL
 * @param context Extension context for GistManager
 */
export async function importFromGist(
  gistIdOrUrl: string,
  context?: vscode.ExtensionContext
): Promise<void> {
  try {
    if (!context) {
      vscode.window.showErrorMessage('Extension context not available');
      return;
    }

    const gistManager = GistManager.getInstance(context);

    // Parse and validate URL/ID
    const gistId = gistManager.parseGistUrl(gistIdOrUrl);
    if (!gistId) {
      vscode.window.showErrorMessage('Invalid Gist URL or ID. Please check and try again.');
      return;
    }

    // Fetch gist
    vscode.window.showInformationMessage('Fetching Gist...');
    const gist = await gistManager.fetchGist(gistId);

    // Validate format
    if (!gistManager.validateGistFormat(gist)) {
      vscode.window.showErrorMessage('This Gist does not appear to be a valid CursorToys share.');
      return;
    }

    // Extract metadata if available
    const metadata = gistManager.extractMetadata(gist);

    // Detect type and import
    const gistType = detectGistType(gist, metadata);

    if (gistType === 'single') {
      await importSingleFileFromGist(gist, metadata);
    } else if (gistType === 'bundle') {
      await importBundleFromGist(gist, metadata);
    } else {
      vscode.window.showErrorMessage('Unable to determine Gist type. Please check the format.');
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error importing from Gist: ${error}`);
  }
}

/**
 * Detects if a Gist contains a single file or a bundle
 */
function detectGistType(gist: GistResponse, metadata: CursorToysMetadata | null): 'single' | 'bundle' | 'unknown' {
  if (metadata) {
    // Use metadata to determine type
    if (metadata.cursortoys.type === 'bundle') {
      return 'bundle';
    } else {
      return 'single';
    }
  }

  // Fallback: count non-metadata files
  const fileNames = Object.keys(gist.files).filter(name => name !== '.cursortoys-metadata.json');
  
  if (fileNames.length === 0) {
    return 'unknown';
  } else if (fileNames.length === 1) {
    return 'single';
  } else {
    return 'bundle';
  }
}

/**
 * Imports a single file from a Gist
 */
async function importSingleFileFromGist(
  gist: GistResponse,
  metadata: CursorToysMetadata | null
): Promise<void> {
  // Get the file (skip metadata file)
  const fileNames = Object.keys(gist.files).filter(name => name !== '.cursortoys-metadata.json');
  
  if (fileNames.length === 0) {
    vscode.window.showErrorMessage('No files found in Gist');
    return;
  }

  const fileName = fileNames[0];
  const file = gist.files[fileName];
  
  if (!file.content) {
    vscode.window.showErrorMessage('File content not available');
    return;
  }

  // Determine file type
  let fileType: 'command' | 'rule' | 'prompt' | 'notepad' | 'http' | 'env' | 'hooks' | 'plan' | 'skill';
  
  if (metadata && metadata.cursortoys.type !== 'bundle') {
    fileType = metadata.cursortoys.type;
  } else {
    // Fallback: detect by extension or filename
    if (fileName === 'hooks.json') {
      fileType = 'hooks';
    } else if (fileName.endsWith('.plan.md')) {
      fileType = 'plan';
    } else if (fileName.endsWith('.md') || fileName.endsWith('.mdc')) {
      // Default to command if can't determine
      fileType = 'command';
    } else if (fileName.endsWith('.req') || fileName.endsWith('.request')) {
      fileType = 'http';
    } else if (fileName.startsWith('.env')) {
      fileType = 'env';
    } else {
      vscode.window.showErrorMessage('Unable to determine file type');
      return;
    }
  }

  // For commands, prompts, plans, and hooks, ask if user wants to save as Project or Personal
  let isPersonal = false;
  if (fileType === 'command' || fileType === 'prompt' || fileType === 'plan' || fileType === 'hooks') {
    let itemType: string;
    let folderName: string;
    
    if (fileType === 'command') {
      itemType = 'command';
      folderName = 'commands';
    } else if (fileType === 'prompt') {
      itemType = 'prompt';
      folderName = 'prompts';
    } else if (fileType === 'plan') {
      itemType = 'plan';
      folderName = 'plans';
    } else {
      itemType = 'hooks';
      folderName = '';
    }
    
    const itemLocation = await vscode.window.showQuickPick(
      [
        { 
          label: `Personal ${itemType}${fileType === 'hooks' ? '' : 's'}`, 
          description: `Available in all projects (~/.cursor/${folderName || 'hooks.json'})`, 
          value: true 
        },
        { 
          label: `Project ${itemType}${fileType === 'hooks' ? '' : 's'}`, 
          description: 'Specific to this workspace', 
          value: false 
        }
      ],
      {
        placeHolder: `Where do you want to save this ${itemType}?`
      }
    );

    if (itemLocation === undefined) {
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

  const workspacePath = workspaceFolder?.uri.fsPath || '';
  
  // Determine destination path
  let folderPath: string;
  let finalFileName = fileName;
  
  switch (fileType) {
    case 'command':
      folderPath = getCommandsPath(workspacePath, isPersonal);
      break;
    case 'rule':
      folderPath = getRulesPath(workspacePath, isPersonal);
      break;
    case 'prompt':
      folderPath = getPromptsPath(workspacePath, isPersonal);
      break;
    case 'notepad':
      folderPath = getNotepadsPath(workspacePath, isPersonal);
      break;
    case 'http':
      folderPath = getHttpPath(workspacePath);
      break;
    case 'env':
      folderPath = getEnvironmentsPath(workspacePath);
      break;
    case 'hooks':
      folderPath = path.dirname(getHooksPath(workspacePath, isPersonal));
      break;
    case 'plan':
      folderPath = getPlansPath(workspacePath, isPersonal);
      break;
    case 'skill':
      // Skills are folders containing SKILL.md
      const skillsBasePath = getSkillsPath(workspacePath, isPersonal);
      folderPath = path.join(skillsBasePath, sanitizeFileName(fileName));
      finalFileName = 'SKILL.md';
      break;
  }

  // Create directory if needed
  await createDirectoryRecursive(folderPath);
  
  // Create llms.txt in HTTP folder if importing HTTP file
  if (fileType === 'http') {
    await createHttpLlmsFile(folderPath);
  }

  // For plans, ensure the file name ends with .plan.md
  if (fileType === 'plan' && !finalFileName.endsWith('.plan.md')) {
    // Remove any existing extension and add .plan.md
    const nameWithoutExt = path.parse(finalFileName).name;
    finalFileName = `${nameWithoutExt}.plan.md`;
  }

  // Check if file exists
  const fileUri = vscode.Uri.file(path.join(folderPath, finalFileName));
  let fileExists = false;
  try {
    await vscode.workspace.fs.stat(fileUri);
    fileExists = true;
  } catch {
    // File doesn't exist, that's fine
  }

  if (fileExists) {
    const overwrite = await vscode.window.showWarningMessage(
      `File ${finalFileName} already exists. Do you want to overwrite it?`,
      'Yes',
      'No'
    );
    if (overwrite !== 'Yes') {
      return;
    }
  }

  // Write file
  const content = Buffer.from(file.content, 'utf8');
  await vscode.workspace.fs.writeFile(fileUri, content);

  vscode.window.showInformationMessage(`File imported successfully: ${finalFileName}`);
  
  // Open file
  const document = await vscode.workspace.openTextDocument(fileUri);
  await vscode.window.showTextDocument(document);
}

/**
 * Imports a bundle of files from a Gist
 */
async function importBundleFromGist(
  gist: GistResponse,
  metadata: CursorToysMetadata | null
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace open. Please open a folder first.');
    return;
  }

  const workspacePath = workspaceFolder.uri.fsPath;
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const defaultExtension = allowedExtensions[0] || 'md';

  let successCount = 0;
  let errorCount = 0;

  // Get bundle type from metadata
  const bundleType = metadata?.cursortoys.bundleType;

  // Process each file
  for (const [fileName, file] of Object.entries(gist.files)) {
    // Skip metadata file
    if (fileName === '.cursortoys-metadata.json') {
      continue;
    }

    if (!file.content) {
      errorCount++;
      continue;
    }

    try {
      let destPath: string;

      // Determine destination based on file type and bundle type
      if (bundleType === 'project_bundle') {
        // Project bundle: files already have folder prefix (commands/, rules/, etc)
        destPath = path.join(workspacePath, `.cursor`, fileName);
      } else if (bundleType === 'command_bundle') {
        destPath = path.join(getCommandsPath(workspacePath, false), fileName);
      } else if (bundleType === 'rule_bundle') {
        destPath = path.join(getRulesPath(workspacePath, false), fileName);
      } else if (bundleType === 'prompt_bundle') {
        destPath = path.join(getPromptsPath(workspacePath, false), fileName);
      } else if (bundleType === 'notepad_bundle') {
        destPath = path.join(getNotepadsPath(workspacePath, false), fileName);
      } else if (bundleType === 'plan_bundle') {
        // Ensure .plan.md extension
        let finalFileName = fileName;
        if (!fileName.endsWith('.plan.md')) {
          const nameWithoutExt = path.parse(fileName).name;
          finalFileName = `${nameWithoutExt}.plan.md`;
        }
        destPath = path.join(getPlansPath(workspacePath), finalFileName);
      } else if (bundleType === 'http_bundle') {
        if (fileName.startsWith('.env')) {
          destPath = path.join(getEnvironmentsPath(workspacePath), fileName);
        } else {
          destPath = path.join(getHttpPath(workspacePath), fileName);
        }
      } else {
        // Fallback: detect by extension
        if (fileName.endsWith('.plan.md')) {
          destPath = path.join(getPlansPath(workspacePath), fileName);
        } else if (fileName.endsWith('.md') || fileName.endsWith('.mdc')) {
          destPath = path.join(getCommandsPath(workspacePath, false), fileName);
        } else if (fileName.endsWith('.req') || fileName.endsWith('.request')) {
          destPath = path.join(getHttpPath(workspacePath), fileName);
        } else if (fileName.startsWith('.env')) {
          destPath = path.join(getEnvironmentsPath(workspacePath), fileName);
        } else {
          errorCount++;
          continue;
        }
      }

      // Create directory if needed
      const dirPath = path.dirname(destPath);
      await createDirectoryRecursive(dirPath);
      
      // Create llms.txt in HTTP folder if importing HTTP file
      if (bundleType === 'http_bundle' || fileName.endsWith('.req') || fileName.endsWith('.request')) {
        const httpPath = getHttpPath(workspacePath);
        await createHttpLlmsFile(httpPath);
      }

      // Write file
      const fileUri = vscode.Uri.file(destPath);
      const content = Buffer.from(file.content, 'utf8');
      await vscode.workspace.fs.writeFile(fileUri, content);

      successCount++;
    } catch (error) {
      console.error(`Error importing file ${fileName}:`, error);
      errorCount++;
    }
  }

  // Show summary
  if (errorCount === 0) {
    vscode.window.showInformationMessage(`Gist imported successfully: ${successCount} file(s) imported.`);
  } else {
    vscode.window.showWarningMessage(`Imported ${successCount} file(s), ${errorCount} failed.`);
  }
}

