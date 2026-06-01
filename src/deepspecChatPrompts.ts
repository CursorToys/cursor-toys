import * as path from 'path';
import * as vscode from 'vscode';

/** Activation commands from the DeepSpec skill (`.cursor/skills/deep-spec/SKILL.md`). */
export const DEEPSPEC_CMD_INITIALIZE = 'Initialize DeepSpec';
export const DEEPSPEC_CMD_CREATE_TASK_PREFIX = 'Create task';

/** Spec types when creating a new draft via the DeepSpec panel. */
export type DeepSpecType = 'bug' | 'feature' | 'refactor' | 'chore' | 'docs' | 'spike';

export const DEEPSPEC_SPEC_TYPES: readonly { id: DeepSpecType; label: string }[] = [
  { id: 'feature', label: 'Feature' },
  { id: 'chore', label: 'Chore' },
  { id: 'bug', label: 'Bug' },
  { id: 'docs', label: 'Docs' },
  { id: 'refactor', label: 'Refactor' },
  { id: 'spike', label: 'Spike' },
] as const;
export const DEEPSPEC_CMD_APPROVE_TASK = 'Approve task';
export const DEEPSPEC_CMD_COMPLETE_TASK = 'Complete task';
export const DEEPSPEC_CMD_DISCARD_TASK = 'Discard task';
export const DEEPSPEC_CMD_REVISE_TASK = 'Revise task';

const DEEPSPEC_ROOT_RELATIVE = '.deepspec';

/**
 * Workspace-relative @ reference to `.deepspec/`.
 */
export function buildDeepspecRootRef(workspaceFsPath: string, deepspecRootUri?: vscode.Uri): string {
  if (deepspecRootUri) {
    const rel = path.relative(workspaceFsPath, deepspecRootUri.fsPath).replace(/\\/g, '/');
    return `@${rel}`;
  }
  return `@${DEEPSPEC_ROOT_RELATIVE}`;
}

/**
 * Workspace-relative @ reference to a task folder (not individual spec files).
 */
export function buildTaskFolderRef(
  workspaceFsPath: string,
  taskFolderUri: vscode.Uri
): string {
  const rel = path.relative(workspaceFsPath, taskFolderUri.fsPath).replace(/\\/g, '/');
  return `@${rel}`;
}

/**
 * Bootstrap DeepSpec: `.deepspec/` folder ref + Initialize DeepSpec.
 */
export function buildInitializeChatMessage(
  workspaceFsPath?: string,
  deepspecRootUri?: vscode.Uri
): string {
  const ref =
    workspaceFsPath && deepspecRootUri
      ? buildDeepspecRootRef(workspaceFsPath, deepspecRootUri)
      : `@${DEEPSPEC_ROOT_RELATIVE}`;
  return `${ref}\n\n${DEEPSPEC_CMD_INITIALIZE}`;
}

/** Label pasted with the draft task @ ref; user adds planning notes on the following lines. */
export const DEEPSPEC_PLAN_LABEL = 'Plan';

/**
 * Draft task folder ref + Plan label (planning stage — paste only, no auto-submit).
 * The user completes the message with their review or planning notes.
 */
export function buildPlanChatMessage(
  workspaceFsPath: string,
  taskFolderUri: vscode.Uri
): string {
  const ref = buildTaskFolderRef(workspaceFsPath, taskFolderUri);
  return `${ref}\n\n${DEEPSPEC_PLAN_LABEL}:\n`;
}

/**
 * Draft task folder ref + Approve task (drafts → active).
 */
export function buildApproveChatMessage(
  workspaceFsPath: string,
  taskFolderUri: vscode.Uri
): string {
  return `${buildTaskFolderRef(workspaceFsPath, taskFolderUri)}\n\n${DEEPSPEC_CMD_APPROVE_TASK}`;
}

/**
 * Active task folder ref (in development — agent follows APPROACH per skill).
 */
export function buildExecuteChatMessage(
  workspaceFsPath: string,
  taskFolderUri: vscode.Uri
): string {
  return buildTaskFolderRef(workspaceFsPath, taskFolderUri);
}

/**
 * Active task folder ref + Complete task (Review Gate → archive).
 */
export function buildCompleteChatMessage(
  workspaceFsPath: string,
  taskFolderUri: vscode.Uri
): string {
  return `${buildTaskFolderRef(workspaceFsPath, taskFolderUri)}\n\n${DEEPSPEC_CMD_COMPLETE_TASK}`;
}

/**
 * Active task in Review Gate + Revise task (post-impl feedback round).
 */
export function buildReviseChatMessage(
  workspaceFsPath: string,
  taskFolderUri: vscode.Uri,
  feedback?: string
): string {
  const trimmed = feedback?.trim();
  const body = trimmed ? `\n\n${trimmed}` : '\n\n';
  return `${buildTaskFolderRef(workspaceFsPath, taskFolderUri)}\n\n${DEEPSPEC_CMD_REVISE_TASK}${body}`;
}

/**
 * Draft task folder ref + Discard task (drafts → archive, no implementation).
 */
export function buildDiscardChatMessage(
  workspaceFsPath: string,
  taskFolderUri: vscode.Uri,
  reason?: string
): string {
  const trimmedReason = reason?.trim();
  const reasonBlock = trimmedReason ? `\n\nReason: ${trimmedReason}` : '';
  return `${buildTaskFolderRef(workspaceFsPath, taskFolderUri)}\n\n${DEEPSPEC_CMD_DISCARD_TASK}${reasonBlock}`;
}

/**
 * Chat message to create a new draft task (skill: Create task [name]).
 */
export function buildCreateTaskChatMessage(
  specType: DeepSpecType,
  taskSlug: string,
  description: string,
  workspaceFsPath?: string,
  deepspecRootUri?: vscode.Uri
): string {
  const trimmedDesc = description.trim();
  const body = trimmedDesc
    ? `\n\n**Type:** ${specType}\n\n${trimmedDesc}`
    : `\n\n**Type:** ${specType}`;
  const rootRef = buildDeepspecRootRef(workspaceFsPath ?? '', deepspecRootUri);
  return `${rootRef}/specs/drafts\n\n${DEEPSPEC_CMD_CREATE_TASK_PREFIX} ${taskSlug}${body}`;
}

/**
 * Converts a title to a kebab-case task slug for folder names.
 */
export function slugifyDeepspecTaskName(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
