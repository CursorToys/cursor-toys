import * as vscode from 'vscode';
import * as path from 'path';
import { importRemoteSkillFromGitHubFolderUrl } from './skillRemoteImporter';
import { DEEPFLOW_SKILL_RELATIVE_PATH } from './deepflowPaths';

/** Official DeepFlow skill folder on GitHub. */
export const DEEPFLOW_SKILL_GITHUB_URL =
  'https://github.com/godrix/deep-flow/tree/main/deep-flow';

const DEEPFLOW_SKILL_DIR_RELATIVE = '.cursor/skills/deep-flow';

/**
 * Returns true when SKILL.md exists at the workspace DeepFlow skill path.
 */
export async function deepflowSkillExists(workspaceFolder: vscode.Uri): Promise<boolean> {
  const skillUri = vscode.Uri.joinPath(workspaceFolder, DEEPFLOW_SKILL_RELATIVE_PATH);
  try {
    const stat = await vscode.workspace.fs.stat(skillUri);
    return stat.type === vscode.FileType.File;
  } catch {
    return false;
  }
}

/**
 * Downloads the DeepFlow skill from GitHub into `.cursor/skills/deep-flow/`.
 */
export async function installDeepflowSkill(workspaceFolder: vscode.Uri): Promise<void> {
  const imported = await importRemoteSkillFromGitHubFolderUrl(DEEPFLOW_SKILL_GITHUB_URL);
  const skillRootUri = vscode.Uri.joinPath(workspaceFolder, DEEPFLOW_SKILL_DIR_RELATIVE);

  for (const file of imported.files) {
    const fileUri = vscode.Uri.joinPath(skillRootUri, file.path);
    const parentUri = vscode.Uri.file(path.dirname(fileUri.fsPath));
    try {
      await vscode.workspace.fs.createDirectory(parentUri);
    } catch {
      // directory may already exist
    }
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(file.content, 'utf8'));
  }
}

/**
 * Ensures the DeepFlow skill is present; prompts to download from GitHub if missing.
 * @returns true if the skill exists (or was installed), false if the user declined or install failed.
 */
export async function ensureDeepflowSkillOrPromptDownload(
  workspaceFolder: vscode.Uri
): Promise<boolean> {
  if (await deepflowSkillExists(workspaceFolder)) {
    return true;
  }

  const choice = await vscode.window.showWarningMessage(
    `DeepFlow skill not found at ${DEEPFLOW_SKILL_RELATIVE_PATH}. Download it from GitHub?`,
    { modal: true },
    'Download',
    'Cancel'
  );

  if (choice !== 'Download') {
    return false;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Downloading DeepFlow skill…',
        cancellable: false,
      },
      () => installDeepflowSkill(workspaceFolder)
    );
    vscode.window.showInformationMessage(
      `DeepFlow skill installed to ${DEEPFLOW_SKILL_DIR_RELATIVE}.`
    );
    return true;
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to download DeepFlow skill: ${error}. Source: ${DEEPFLOW_SKILL_GITHUB_URL}`
    );
    return false;
  }
}
