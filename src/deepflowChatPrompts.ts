import * as path from 'path';
import * as vscode from 'vscode';

/** Activation commands from the DeepFlow skill (`.cursor/skills/deep-flow/SKILL.md`). */
export const DEEPFLOW_CMD_INITIALIZE = 'Initialize DeepFlow';
export const DEEPFLOW_CMD_CREATE_TASK_PREFIX = 'Create task';

/** Spec types when creating a new draft via the DeepFlow panel. */
export type DeepFlowSpecType = 'bug' | 'feature' | 'refactor' | 'chore' | 'docs' | 'spike';

export const DEEPFLOW_SPEC_TYPES: readonly { id: DeepFlowSpecType; label: string }[] = [
  { id: 'bug', label: 'Bug' },
  { id: 'feature', label: 'Feature' },
  { id: 'refactor', label: 'Refactor' },
  { id: 'chore', label: 'Chore' },
  { id: 'docs', label: 'Docs' },
  { id: 'spike', label: 'Spike' },
] as const;
export const DEEPFLOW_CMD_APPROVE_TASK = 'Approve task';
export const DEEPFLOW_CMD_COMPLETE_TASK = 'Complete task';

const DEEPFLOW_ROOT_RELATIVE = '.deepflow';

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
 * Bootstrap DeepFlow: `.deepflow/` folder ref + Initialize DeepFlow.
 */
export function buildInitializeChatMessage(): string {
  return `@${DEEPFLOW_ROOT_RELATIVE}\n\n${DEEPFLOW_CMD_INITIALIZE}`;
}

/**
 * Draft task folder ref (planning stage — no separate skill command; agent uses draft A-B-C rules).
 */
export function buildPlanChatMessage(
  workspaceFsPath: string,
  taskFolderUri: vscode.Uri
): string {
  return buildTaskFolderRef(workspaceFsPath, taskFolderUri);
}

/**
 * Draft task folder ref + Approve task (drafts → active).
 */
export function buildApproveChatMessage(
  workspaceFsPath: string,
  taskFolderUri: vscode.Uri
): string {
  return `${buildTaskFolderRef(workspaceFsPath, taskFolderUri)}\n\n${DEEPFLOW_CMD_APPROVE_TASK}`;
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
 * Active task folder ref + Complete task (active → archive).
 */
export function buildCompleteChatMessage(
  workspaceFsPath: string,
  taskFolderUri: vscode.Uri
): string {
  return `${buildTaskFolderRef(workspaceFsPath, taskFolderUri)}\n\n${DEEPFLOW_CMD_COMPLETE_TASK}`;
}

/**
 * Chat message to create a new draft task (skill: Create task [name]).
 */
export function buildCreateTaskChatMessage(
  specType: DeepFlowSpecType,
  taskSlug: string,
  description: string
): string {
  const trimmedDesc = description.trim();
  const body = trimmedDesc
    ? `\n\n**Type:** ${specType}\n\n${trimmedDesc}`
    : `\n\n**Type:** ${specType}`;
  return `@${DEEPFLOW_ROOT_RELATIVE}/specs/drafts\n\n${DEEPFLOW_CMD_CREATE_TASK_PREFIX} ${taskSlug}${body}`;
}

/**
 * Converts a title to a kebab-case task slug for folder names.
 */
export function slugifyDeepflowTaskName(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
