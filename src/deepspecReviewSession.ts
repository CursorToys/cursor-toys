import * as vscode from 'vscode';
import type { DeepSpecStage, DeepSpecTreeStage } from './deepspecPaths';
import { buildTaskFolderRef } from './deepspecChatPrompts';

const MAX_EXCERPT_LENGTH = 500;

export interface DeepspecReviewComment {
  id: string;
  fileUri: string;
  fileName: string;
  startLine: number;
  endLine: number;
  /** Disjoint line picks (Ctrl/Cmd+click). When set, overrides contiguous range semantics. */
  lineNumbers?: number[];
  excerpt: string;
  body: string;
  createdAt: number;
}

/** In-memory review comments keyed by task folder path. */
const commentsByTask = new Map<string, DeepspecReviewComment[]>();

function taskKey(taskFolderUri: vscode.Uri): string {
  return taskFolderUri.fsPath;
}

function newCommentId(): string {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Builds a line-range excerpt from source lines (1-based inclusive).
 */
export function excerptFromLines(
  lines: string[],
  startLine: number,
  endLine: number,
  maxLength: number = MAX_EXCERPT_LENGTH
): string {
  const start = Math.max(1, Math.min(startLine, endLine));
  const end = Math.max(start, Math.max(startLine, endLine));
  let text = lines.slice(start - 1, end).join('\n');
  if (text.length > maxLength) {
    text = `${text.slice(0, maxLength)}…`;
  }
  return text;
}

/**
 * Builds an excerpt from non-contiguous line numbers (1-based).
 */
export function excerptFromLineNumbers(
  lines: string[],
  lineNumbers: number[],
  maxLength: number = MAX_EXCERPT_LENGTH
): string {
  const unique = [...new Set(lineNumbers)].sort((a, b) => a - b);
  let text = unique.map((n) => `L${n}: ${lines[n - 1] ?? ''}`).join('\n');
  if (text.length > maxLength) {
    text = `${text.slice(0, maxLength)}…`;
  }
  return text;
}

export function linesForComment(comment: DeepspecReviewComment): number[] {
  if (comment.lineNumbers?.length) {
    return [...comment.lineNumbers].sort((a, b) => a - b);
  }
  const lines: number[] = [];
  for (let n = comment.startLine; n <= comment.endLine; n++) {
    lines.push(n);
  }
  return lines;
}

export function isContiguousLineNumbers(lineNumbers: number[]): boolean {
  if (lineNumbers.length <= 1) {
    return true;
  }
  const sorted = [...lineNumbers].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      return false;
    }
  }
  return true;
}

/** Human-readable line label for UI and chat (e.g. L5, L12, L20 or L10–15). */
export function formatCommentLineLabel(comment: DeepspecReviewComment): string {
  const lines = linesForComment(comment);
  if (lines.length === 0) {
    return 'L?';
  }
  if (lines.length === 1) {
    return `L${lines[0]}`;
  }
  if (isContiguousLineNumbers(lines)) {
    return `L${lines[0]}–${lines[lines.length - 1]}`;
  }
  return lines.map((n) => `L${n}`).join(', ');
}

export function addComment(
  taskFolderUri: vscode.Uri,
  fileUri: vscode.Uri,
  fileName: string,
  startLine: number,
  endLine: number,
  excerpt: string,
  body: string,
  lineNumbers?: number[]
): DeepspecReviewComment {
  const key = taskKey(taskFolderUri);
  const list = commentsByTask.get(key) ?? [];
  const normalizedLines = lineNumbers?.length
    ? [...new Set(lineNumbers)].sort((a, b) => a - b)
    : undefined;
  const comment: DeepspecReviewComment = {
    id: newCommentId(),
    fileUri: fileUri.toString(),
    fileName,
    startLine: normalizedLines ? normalizedLines[0]! : Math.min(startLine, endLine),
    endLine: normalizedLines
      ? normalizedLines[normalizedLines.length - 1]!
      : Math.max(startLine, endLine),
    lineNumbers:
      normalizedLines && !isContiguousLineNumbers(normalizedLines)
        ? normalizedLines
        : undefined,
    excerpt,
    body: body.trim(),
    createdAt: Date.now(),
  };
  list.push(comment);
  commentsByTask.set(key, list);
  return comment;
}

export function removeComment(taskFolderUri: vscode.Uri, commentId: string): boolean {
  const key = taskKey(taskFolderUri);
  const list = commentsByTask.get(key);
  if (!list) {
    return false;
  }
  const next = list.filter((c) => c.id !== commentId);
  if (next.length === list.length) {
    return false;
  }
  commentsByTask.set(key, next.length ? next : []);
  if (!next.length) {
    commentsByTask.delete(key);
  }
  return true;
}

export function listForTask(taskFolderUri: vscode.Uri): DeepspecReviewComment[] {
  return [...(commentsByTask.get(taskKey(taskFolderUri)) ?? [])].sort(
    (a, b) =>
      a.fileName.localeCompare(b.fileName) ||
      a.startLine - b.startLine ||
      a.createdAt - b.createdAt
  );
}

export function listForFile(
  taskFolderUri: vscode.Uri,
  fileUri: vscode.Uri
): DeepspecReviewComment[] {
  const fileKey = fileUri.toString();
  return listForTask(taskFolderUri).filter((c) => c.fileUri === fileKey);
}

export function clearTask(taskFolderUri: vscode.Uri): void {
  commentsByTask.delete(taskKey(taskFolderUri));
}

/**
 * Formats review comments for chat (without task @ ref).
 */
export function formatCommentsForChat(comments: DeepspecReviewComment[]): string {
  if (comments.length === 0) {
    return '';
  }
  const blocks: string[] = [];
  for (const c of comments) {
    const range = formatCommentLineLabel(c);
    const excerptBlock = c.excerpt
      ? c.excerpt
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')
      : '> (empty)';
    blocks.push(
      `### ${c.fileName} ${range}\n${excerptBlock}\n\n**Comment:** ${c.body}`
    );
  }
  return blocks.join('\n\n');
}

/**
 * Full chat payload: @task ref + review instructions + formatted comments.
 */
export function formatReviewForChat(
  workspaceFsPath: string,
  taskFolderUri: vscode.Uri,
  stage: DeepSpecStage | DeepSpecTreeStage
): string {
  const comments = listForTask(taskFolderUri);
  const ref = buildTaskFolderRef(workspaceFsPath, taskFolderUri);
  const body = formatCommentsForChat(comments);
  const stageLabel =
    stage === 'drafts'
      ? 'draft'
      : stage === 'review'
        ? 'review gate'
        : stage === 'active'
          ? 'active'
          : 'archive';
  const hint =
    stage === 'review'
      ? 'please apply as a Review Round delta (see APPROACH ## Review Rounds)'
      : 'please update the spec, no code';
  return `${ref}\n\nReview feedback (${stageLabel} — ${hint}):\n\n${body}`;
}
