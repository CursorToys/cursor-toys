import * as vscode from 'vscode';
import * as path from 'path';
import { importRemoteSkillFromGitHubFolderUrl } from './skillRemoteImporter';
import { DEEPSPEC_SKILL_RELATIVE_PATH } from './deepspecPaths';

/** Official DeepSpec skill folder on GitHub. */
export const DEEPSPEC_SKILL_GITHUB_URL =
  'https://github.com/godrix/DeepSpec/tree/main/deep-spec';

const DEEPSPEC_SKILL_DIR_RELATIVE = '.cursor/skills/deep-spec';

/**
 * Returns true when SKILL.md exists at the workspace DeepSpec skill path.
 */
export async function deepspecSkillExists(workspaceFolder: vscode.Uri): Promise<boolean> {
  const skillUri = vscode.Uri.joinPath(workspaceFolder, DEEPSPEC_SKILL_RELATIVE_PATH);
  try {
    const stat = await vscode.workspace.fs.stat(skillUri);
    return stat.type === vscode.FileType.File;
  } catch {
    return false;
  }
}

/**
 * Downloads the DeepSpec skill from GitHub into `.cursor/skills/deep-spec/`.
 */
export async function installDeepspecSkill(workspaceFolder: vscode.Uri): Promise<void> {
  const imported = await importRemoteSkillFromGitHubFolderUrl(DEEPSPEC_SKILL_GITHUB_URL);
  const skillRootUri = vscode.Uri.joinPath(workspaceFolder, DEEPSPEC_SKILL_DIR_RELATIVE);

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
 * Ensures the DeepSpec skill is present; prompts to download from GitHub if missing.
 * @returns true if the skill exists (or was installed), false if the user declined or install failed.
 */
export async function ensureDeepspecSkillOrPromptDownload(
  workspaceFolder: vscode.Uri
): Promise<boolean> {
  if (await deepspecSkillExists(workspaceFolder)) {
    return true;
  }

  const choice = await vscode.window.showWarningMessage(
    `DeepSpec skill not found at ${DEEPSPEC_SKILL_RELATIVE_PATH}. Download it from GitHub?`,
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
        title: 'Downloading DeepSpec skill…',
        cancellable: false,
      },
      () => installDeepspecSkill(workspaceFolder)
    );
    vscode.window.showInformationMessage(
      `DeepSpec skill installed to ${DEEPSPEC_SKILL_DIR_RELATIVE}.`
    );
    return true;
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to download DeepSpec skill: ${error}. Source: ${DEEPSPEC_SKILL_GITHUB_URL}`
    );
    return false;
  }
}
