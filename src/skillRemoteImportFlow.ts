import * as path from 'path';
import * as vscode from 'vscode';
import { GistManager } from './gistManager';
import { createSkillFromStructure } from './shareableImporter';
import {
  discoverRemoteSkillsFromGitHubUrl,
  importRemoteSkillFromFolder,
  validateGitHubRepoUrl,
  type DiscoveredRemoteSkill,
  type ParsedGitHubRepoRef,
} from './skillRemoteImporter';
import { getSkillsPath, sanitizeFileName } from './utils';

export type RemoteSkillImportScope = 'personal' | 'project';

export interface RemoteSkillImportSummary {
  successCount: number;
  errorCount: number;
  imported: Array<{ skillName: string; skillPath: string; filesWritten: number }>;
  errors: Array<{ folderPath: string; message: string }>;
}

interface SkillPickItem extends vscode.QuickPickItem {
  folderPath: string;
  suggestedName: string;
}

interface ScopePickItem extends vscode.QuickPickItem {
  value: RemoteSkillImportScope;
}

async function getGitHubToken(): Promise<string | null> {
  try {
    return await GistManager.getInstance().getGitHubToken();
  } catch {
    return null;
  }
}

/**
 * Runs the interactive remote skill import flow from the command palette or Control Panel.
 */
export async function runAddSkillRemoteFlow(refreshSkillsTree?: () => void): Promise<void> {
  const remoteUrl = await vscode.window.showInputBox({
    prompt: 'Enter GitHub repository or folder URL',
    placeHolder: 'https://github.com/owner/repo or .../tree/main/path/to/skill-folder',
    validateInput: (value) => validateGitHubRepoUrl(value),
  });

  if (!remoteUrl) {
    return;
  }

  try {
    const githubToken = await getGitHubToken();
    const discovery = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Discovering skills in repository...',
        cancellable: false,
      },
      async () => discoverRemoteSkillsFromGitHubUrl(remoteUrl.trim(), githubToken)
    );

    if (discovery.skills.length === 0) {
      vscode.window.showErrorMessage('No skills found in the provided GitHub URL.');
      return;
    }

    const selectedSkills = await pickSkillsToImport(discovery.skills);
    if (selectedSkills.length === 0) {
      return;
    }

    const scope = await pickImportScope();
    if (!scope) {
      return;
    }

    const summary = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Importing remote skills...',
        cancellable: false,
      },
      async () =>
        importDiscoveredRemoteSkills({
          repo: discovery.repo,
          skills: selectedSkills,
          scope,
          githubToken,
          confirmOverwrite: true,
        })
    );

    showImportSummary(summary);
    refreshSkillsTree?.();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Error importing remote skill: ${errorMessage}`);
  }
}

async function pickSkillsToImport(skills: DiscoveredRemoteSkill[]): Promise<DiscoveredRemoteSkill[]> {
  if (skills.length === 1) {
    return skills;
  }

  const picked = await vscode.window.showQuickPick<SkillPickItem>(
    skills.map((skill) => ({
      label: skill.suggestedName,
      description: skill.folderPath || '(repository root)',
      detail: skill.folderPath,
      picked: true,
      folderPath: skill.folderPath,
      suggestedName: skill.suggestedName,
    })),
    {
      canPickMany: true,
      placeHolder: 'Select skills to import',
    }
  );

  if (!picked) {
    return [];
  }

  return picked.map((item) => ({
    folderPath: item.folderPath,
    suggestedName: item.suggestedName,
  }));
}

async function pickImportScope(): Promise<RemoteSkillImportScope | undefined> {
  const location = await vscode.window.showQuickPick<ScopePickItem>(
    [
      {
        label: 'Personal skill',
        description: 'Available in all projects (~/.cursor/skills)',
        value: 'personal',
      },
      {
        label: 'Project skill',
        description: 'Specific to this workspace',
        value: 'project',
      },
    ],
    { placeHolder: 'Where do you want to save these skills?' }
  );

  return location?.value;
}

/**
 * Imports discovered remote skills into personal or project skills folders.
 */
export async function importDiscoveredRemoteSkills(options: {
  repo: ParsedGitHubRepoRef;
  skills: DiscoveredRemoteSkill[];
  scope: RemoteSkillImportScope;
  githubToken?: string | null;
  overwrite?: boolean;
  confirmOverwrite?: boolean;
}): Promise<RemoteSkillImportSummary> {
  const isPersonal = options.scope === 'personal';
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!isPersonal && !workspaceFolder) {
    throw new Error('Open a workspace folder to install project skills');
  }

  const workspacePath = workspaceFolder?.uri.fsPath || '';
  const skillsPath = getSkillsPath(workspacePath, isPersonal);
  const summary: RemoteSkillImportSummary = {
    successCount: 0,
    errorCount: 0,
    imported: [],
    errors: [],
  };

  for (const skill of options.skills) {
    try {
      const skillFolderName = sanitizeFileName(skill.suggestedName) || 'imported-skill';
      const destinationSkillPath = path.join(skillsPath, skillFolderName);
      const destinationSkillUri = vscode.Uri.file(destinationSkillPath);

      let exists = false;
      try {
        await vscode.workspace.fs.stat(destinationSkillUri);
        exists = true;
      } catch {
        // Destination does not exist yet.
      }

      if (exists) {
        if (options.overwrite === true) {
          await vscode.workspace.fs.delete(destinationSkillUri, { recursive: true, useTrash: false });
        } else if (options.confirmOverwrite === true) {
          const overwrite = await vscode.window.showWarningMessage(
            `Skill "${skillFolderName}" already exists. Do you want to overwrite it?`,
            'Yes',
            'No'
          );
          if (overwrite !== 'Yes') {
            continue;
          }
          await vscode.workspace.fs.delete(destinationSkillUri, { recursive: true, useTrash: false });
        } else {
          summary.errors.push({
            folderPath: skill.folderPath,
            message: `Skill "${skillFolderName}" already exists`,
          });
          summary.errorCount++;
          continue;
        }
      }

      const imported = await importRemoteSkillFromFolder(
        options.repo,
        skill.folderPath,
        options.githubToken
      );
      await createSkillFromStructure(destinationSkillPath, imported.files);

      summary.successCount++;
      summary.imported.push({
        skillName: skillFolderName,
        skillPath: destinationSkillPath,
        filesWritten: imported.files.length,
      });
    } catch (error) {
      summary.errorCount++;
      summary.errors.push({
        folderPath: skill.folderPath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}

function showImportSummary(summary: RemoteSkillImportSummary): void {
  if (summary.successCount === 0 && summary.errorCount > 0) {
    vscode.window.showErrorMessage(`Failed to import ${summary.errorCount} skill(s).`);
    return;
  }

  if (summary.errorCount === 0) {
    vscode.window.showInformationMessage(`Successfully imported ${summary.successCount} skill(s)!`);
    return;
  }

  vscode.window.showWarningMessage(
    `Imported ${summary.successCount} skill(s), ${summary.errorCount} failed.`
  );
}
