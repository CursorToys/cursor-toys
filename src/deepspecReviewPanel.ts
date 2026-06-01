import * as vscode from 'vscode';
import * as path from 'path';
import type { AbcFileKind, DeepSpecStage, DeepSpecTreeStage } from './deepspecPaths';
import { ABC_FILE_NAMES, getStageFromTaskUri, isTaskInReviewGate } from './deepspecPaths';
import { openDeepspecSpecFile } from './deepspecFileOps';
import {
  addComment,
  excerptFromLineNumbers,
  excerptFromLines,
  formatCommentLineLabel,
  formatReviewForChat,
  isContiguousLineNumbers,
  linesForComment,
  listForTask,
  removeComment,
  type DeepspecReviewComment,
} from './deepspecReviewSession';
import {
  buildApproveChatMessage,
  buildCompleteChatMessage,
  buildReviseChatMessage,
  buildTaskFolderRef,
  DEEPSPEC_CMD_APPROVE_TASK,
  DEEPSPEC_CMD_COMPLETE_TASK,
  DEEPSPEC_CMD_REVISE_TASK,
} from './deepspecChatPrompts';
import { sendDeepspecToChat } from './deepspecSendToChat';
import {
  parseMarkdownBlocks,
  renderFencedCodeBlock,
  renderMarkdownTable,
  renderMermaidBlock,
} from './markdownBlocks';
import { escapeHtml, renderMarkdownLine } from './markdownLite';

const MAX_FILE_BYTES = 500 * 1024;

/** How the spec review webview is placed in the editor area (`active` = full column, `beside` = split). */
export type DeepspecReviewPanelColumn = 'active' | 'beside';

/**
 * Resolves the editor column for the DeepSpec review webview from workspace settings.
 */
export function getDeepspecReviewViewColumn(): vscode.ViewColumn {
  const mode = vscode.workspace
    .getConfiguration('cursorToys')
    .get<DeepspecReviewPanelColumn>('deepspec.reviewPanelColumn', 'active');
  return mode === 'beside' ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active;
}

export interface DeepspecReviewPanelContext {
  fileUri: vscode.Uri;
  taskFolderUri: vscode.Uri;
  stage: DeepSpecStage;
  treeStage?: DeepSpecTreeStage;
  abcKind?: AbcFileKind;
  taskId?: string;
}

const CHAT_ADD_ICON_SVG = `<svg class="chat-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
  <path fill="currentColor" d="M1 2.5A1.5 1.5 0 0 1 2.5 1h11A1.5 1.5 0 0 1 15 2.5v7A1.5 1.5 0 0 1 13.5 11H9l-2.5 2.5V11H2.5A1.5 1.5 0 0 1 1 9.5v-7z"/>
</svg>`;

/** Filled bubble — always shown on lines that already have a comment. */
const COMMENT_MARKER_ICON_SVG = `<svg class="comment-marker-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
  <path fill="currentColor" d="M1 2.5A1.5 1.5 0 0 1 2.5 1h11A1.5 1.5 0 0 1 15 2.5v7A1.5 1.5 0 0 1 13.5 11H9.121l-2.792 2.793L6 11H2.5A1.5 1.5 0 0 1 1 9.5v-7zm3.25 3a.75.75 0 1 0 0 1.5h7.5a.75.75 0 0 0 0-1.5h-7.5zm0 2.5a.75.75 0 1 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5z"/>
</svg>`;

/**
 * Webview panel for DeepSpec spec review (rendered markdown, line comments, send to chat, approve).
 */
export class DeepspecReviewPanel {
  private static currentPanel: DeepspecReviewPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private sourceLines: string[] = [];
  private fileName = '';
  private treeStage: DeepSpecTreeStage = 'drafts';

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private context: DeepspecReviewPanelContext,
    private readonly extensionUri: vscode.Uri
  ) {
    this.fileName = path.basename(context.fileUri.fsPath);
    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'deepspec.svg');
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    void this.reloadAndRender();
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.onMessage(msg),
      null,
      this.disposables
    );
  }

  static async createOrShow(
    extensionUri: vscode.Uri,
    ctx: DeepspecReviewPanelContext
  ): Promise<void> {
    const column = getDeepspecReviewViewColumn();
    if (DeepspecReviewPanel.currentPanel) {
      DeepspecReviewPanel.currentPanel.context = ctx;
      DeepspecReviewPanel.currentPanel.panel.reveal(column);
      await DeepspecReviewPanel.currentPanel.reloadAndRender();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'cursorToysDeepspecReview',
      'DeepSpec Review',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    DeepspecReviewPanel.currentPanel = new DeepspecReviewPanel(panel, ctx, extensionUri);
  }

  private dispose(): void {
    DeepspecReviewPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  private async reloadAndRender(): Promise<void> {
    const { fileUri, taskFolderUri, stage, taskId } = this.context;
    try {
      const stat = await vscode.workspace.fs.stat(fileUri);
      if (stat.size > MAX_FILE_BYTES) {
        vscode.window.showWarningMessage(
          `Spec file is large (${Math.round(stat.size / 1024)} KB). Review may be slow.`
        );
      }
      const data = await vscode.workspace.fs.readFile(fileUri);
      const text = Buffer.from(data).toString('utf8');
      this.sourceLines = text.split(/\r?\n/);
    } catch (error) {
      vscode.window.showErrorMessage(`Could not load spec file: ${error}`);
      this.sourceLines = [];
    }

    const titleParts = [taskId ?? path.basename(taskFolderUri.fsPath), this.fileName];
    this.panel.title = `Review: ${titleParts.join(' / ')}`;

    const fsStage = getStageFromTaskUri(taskFolderUri) ?? stage;
    if (this.context.treeStage) {
      this.treeStage = this.context.treeStage;
    } else if (fsStage === 'active' && (await isTaskInReviewGate(taskFolderUri))) {
      this.treeStage = 'review';
    } else {
      this.treeStage = fsStage;
    }

    const comments = listForTask(taskFolderUri);
    this.panel.webview.html = this.buildHtml(comments, this.treeStage);
  }

  private async onMessage(message: {
    command: string;
    startLine?: number;
    endLine?: number;
    lineNumbers?: number[];
    body?: string;
    commentId?: string;
  }): Promise<void> {
    switch (message.command) {
      case 'addComment':
        await this.handleAddComment(
          message.startLine,
          message.endLine,
          message.body,
          message.lineNumbers
        );
        break;
      case 'removeComment':
        if (message.commentId) {
          removeComment(this.context.taskFolderUri, message.commentId);
          await this.reloadAndRender();
        }
        break;
      case 'sendToChat':
        await this.handleSendToChat();
        break;
      case 'approve':
        await this.handleApprove();
        break;
      case 'revise':
        await this.handleRevise();
        break;
      case 'openInEditor':
        await openDeepspecSpecFile(this.context.fileUri);
        break;
      default:
        break;
    }
  }

  private async handleAddComment(
    startLine?: number,
    endLine?: number,
    body?: string,
    lineNumbers?: number[]
  ): Promise<void> {
    const text = (body ?? '').trim();
    const nums = lineNumbers?.filter((n) => n > 0).sort((a, b) => a - b);
    const start = nums?.length ? nums[0]! : (startLine ?? 0);
    const end = nums?.length ? nums[nums.length - 1]! : (endLine ?? start);
    if (!start || !text) {
      void vscode.window.showWarningMessage('Select a line or block and enter a comment.');
      return;
    }
    const disjoint = nums && nums.length > 1 && !isContiguousLineNumbers(nums);
    const excerpt =
      disjoint && nums
        ? excerptFromLineNumbers(this.sourceLines, nums)
        : excerptFromLines(this.sourceLines, start, end);
    addComment(
      this.context.taskFolderUri,
      this.context.fileUri,
      this.fileName,
      start,
      end,
      excerpt,
      text,
      disjoint ? nums : undefined
    );
    await this.reloadAndRender();
  }

  private async handleSendToChat(): Promise<void> {
    const comments = listForTask(this.context.taskFolderUri);
    if (comments.length === 0) {
      void vscode.window.showWarningMessage('Add at least one review comment before sending to chat.');
      return;
    }
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('Open a workspace folder to send review to chat.');
      return;
    }
    const payload = formatReviewForChat(
      workspaceFolder.uri.fsPath,
      this.context.taskFolderUri,
      this.treeStage
    );
    const sent = await sendDeepspecToChat(payload);
    if (sent) {
      this.postClearSelection();
      void vscode.window.showInformationMessage(
        `DeepSpec: sent ${comments.length} review comment(s) to chat.`
      );
    } else {
      vscode.window.showErrorMessage('DeepSpec: could not send review to chat.');
    }
  }

  /** Resets line selection and inline draft composer in the webview after chat send. */
  private postClearSelection(): void {
    if (this.panel.visible) {
      void this.panel.webview.postMessage({ command: 'clearSelection' });
    }
  }

  private async handleApprove(): Promise<void> {
    const { taskFolderUri } = this.context;
    if (this.treeStage === 'archive') {
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('Open a workspace folder to approve.');
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const taskComments = listForTask(taskFolderUri);
    let includeComments = false;

    if (taskComments.length > 0) {
      const commentChoice = await vscode.window.showWarningMessage(
        `This spec has ${taskComments.length} review comment(s). Continue without sending them to chat, or include them in the message?`,
        { modal: true },
        'Continue without comments',
        'Include comments'
      );
      if (!commentChoice) {
        return;
      }
      includeComments = commentChoice === 'Include comments';
    } else if (this.treeStage === 'drafts') {
      const choice = await vscode.window.showWarningMessage(
        'Approve this spec and send Approve task to chat (draft → active)?',
        { modal: true },
        'Approve spec'
      );
      if (choice !== 'Approve spec') {
        return;
      }
    } else if (this.treeStage === 'review') {
      const choice = await vscode.window.showWarningMessage(
        'Send Complete task to chat and archive after agent confirmation?',
        { modal: true },
        'Complete task'
      );
      if (choice !== 'Complete task') {
        return;
      }
    }

    if (this.treeStage === 'drafts') {
      const payload = includeComments
        ? `${formatReviewForChat(workspacePath, taskFolderUri, this.treeStage)}\n\n---\n\n${DEEPSPEC_CMD_APPROVE_TASK}`
        : buildApproveChatMessage(workspacePath, taskFolderUri);
      const sent = await sendDeepspecToChat(payload);
      if (sent) {
        if (includeComments) {
          this.postClearSelection();
        }
        void vscode.window.showInformationMessage(
          includeComments
            ? 'DeepSpec: approval sent to chat with review comments.'
            : 'DeepSpec: approval sent to chat.'
        );
      }
      return;
    }

    if (this.treeStage === 'review') {
      const payload = includeComments
        ? `${formatReviewForChat(workspacePath, taskFolderUri, this.treeStage)}\n\n---\n\n${DEEPSPEC_CMD_COMPLETE_TASK}`
        : buildCompleteChatMessage(workspacePath, taskFolderUri);
      const sent = await sendDeepspecToChat(payload);
      if (sent) {
        if (includeComments) {
          this.postClearSelection();
        }
        void vscode.window.showInformationMessage(
          includeComments
            ? 'DeepSpec: Complete task sent to chat with review comments.'
            : 'DeepSpec: Complete task sent to chat.'
        );
      }
      return;
    }

    if (this.treeStage === 'active') {
      if (includeComments) {
        const payload = `${formatReviewForChat(workspacePath, taskFolderUri, this.treeStage)}\n\n---\n\nSpec review approved (LGTM). No folder move; no code changes requested.`;
        const sent = await sendDeepspecToChat(payload);
        if (sent) {
          this.postClearSelection();
          void vscode.window.showInformationMessage(
            'DeepSpec: LGTM sent to chat with review comments.'
          );
        }
      } else {
        void vscode.window.showInformationMessage('Spec review approved (LGTM).');
        const lgtm = `${buildTaskFolderRef(workspacePath, taskFolderUri)}\n\nSpec review approved (LGTM). No folder move; no code changes requested.`;
        await sendDeepspecToChat(lgtm, { submit: false });
      }
    }
  }

  private async handleRevise(): Promise<void> {
    if (this.treeStage !== 'review') {
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('Open a workspace folder to request changes.');
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const { taskFolderUri } = this.context;
    const taskComments = listForTask(taskFolderUri);

    const feedback = await vscode.window.showInputBox({
      title: 'Request changes (Review Round)',
      prompt: 'Describe what should change before you approve (optional if you added line comments)',
      placeHolder: 'e.g. Add tests for AC-3, update APPROACH step 2…',
      ignoreFocusOut: true,
    });
    if (feedback === undefined) {
      return;
    }

    let payload: string;
    if (taskComments.length > 0) {
      payload = `${formatReviewForChat(workspacePath, taskFolderUri, this.treeStage)}\n\n---\n\n${DEEPSPEC_CMD_REVISE_TASK}${feedback.trim() ? `\n\n${feedback.trim()}` : ''}`;
    } else {
      payload = buildReviseChatMessage(workspacePath, taskFolderUri, feedback);
    }

    const sent = await sendDeepspecToChat(payload);
    if (sent) {
      if (taskComments.length > 0) {
        this.postClearSelection();
      }
      void vscode.window.showInformationMessage('DeepSpec: Revise task sent to chat.');
    }
  }

  private buildLineRowsHtml(
    comments: DeepspecReviewComment[],
    fileKey: string
  ): string {
    const commentByLine = commentOnLineMap(comments, fileKey);
    const fileComments = comments.filter((c) => c.fileUri === fileKey);
    const renderedCommentIds = new Set<string>();
    const blocks = parseMarkdownBlocks(this.sourceLines);
    const rows: string[] = [];

    for (const block of blocks) {
      switch (block.kind) {
        case 'table':
          rows.push(
            this.buildBlockRowHtml(
              block.startLine,
              block.endLine,
              renderMarkdownTable(block.lines),
              commentByLine,
              fileKey,
              'block-table'
            )
          );
          this.appendCommentBubblesAfterRow(
            rows,
            block.endLine,
            fileComments,
            renderedCommentIds
          );
          break;
        case 'mermaid':
          rows.push(
            this.buildBlockRowHtml(
              block.startLine,
              block.endLine,
              renderMermaidBlock(block.content),
              commentByLine,
              fileKey,
              'block-mermaid'
            )
          );
          this.appendCommentBubblesAfterRow(
            rows,
            block.endLine,
            fileComments,
            renderedCommentIds
          );
          break;
        case 'fenced':
          rows.push(
            this.buildBlockRowHtml(
              block.startLine,
              block.endLine,
              renderFencedCodeBlock(block.content, block.lang),
              commentByLine,
              fileKey,
              'block-fenced in-code'
            )
          );
          this.appendCommentBubblesAfterRow(
            rows,
            block.endLine,
            fileComments,
            renderedCommentIds
          );
          break;
        case 'lines':
          for (let num = block.startLine; num <= block.endLine; num++) {
            rows.push(this.buildSingleLineRowHtml(num, commentByLine));
            this.appendCommentBubblesAfterRow(rows, num, fileComments, renderedCommentIds);
          }
          break;
      }
    }

    return rows.join('');
  }

  /** Inserts saved-comment bubbles below the anchor line for comments not yet rendered. */
  private appendCommentBubblesAfterRow(
    rows: string[],
    rowEndLine: number,
    fileComments: DeepspecReviewComment[],
    renderedCommentIds: Set<string>
  ): void {
    for (const comment of fileComments) {
      if (renderedCommentIds.has(comment.id)) {
        continue;
      }
      const anchorLine = Math.max(...linesForComment(comment));
      if (anchorLine === rowEndLine) {
        rows.push(this.buildSavedCommentBubbleHtml(comment));
        renderedCommentIds.add(comment.id);
      }
    }
  }

  private buildSavedCommentBubbleHtml(comment: DeepspecReviewComment): string {
    const range = formatCommentLineLabel(comment);
    const linesJson = escapeHtml(JSON.stringify(linesForComment(comment)));
    return `<div class="saved-comment-row" data-comment-id="${escapeHtml(comment.id)}" data-lines="${linesJson}" data-start="${comment.startLine}" data-end="${comment.endLine}">
  <div class="inline-comment-gutter"></div>
  <div class="saved-comment-bubble">
    <div class="saved-comment-header">
      <span class="saved-comment-range">${escapeHtml(range)}</span>
      <button type="button" class="comment-remove" data-remove="${escapeHtml(comment.id)}" title="Remove comment" aria-label="Remove comment on ${escapeHtml(range)}">×</button>
    </div>
    <div class="saved-comment-body">${escapeHtml(comment.body)}</div>
  </div>
</div>`;
  }

  private buildMarkerHtml(
    onLine: DeepspecReviewComment | undefined
  ): string {
    if (!onLine) {
      return '<span class="comment-marker-slot"></span>';
    }
    const rangeLabel = formatCommentLineLabel(onLine);
    const commentLinesJson = escapeHtml(JSON.stringify(linesForComment(onLine)));
    return `<button type="button" class="comment-marker" data-comment-id="${escapeHtml(onLine.id)}" data-lines="${commentLinesJson}" data-start="${onLine.startLine}" data-end="${onLine.endLine}" title="View comment (${escapeHtml(rangeLabel)})" aria-label="View comment on ${escapeHtml(rangeLabel)}">
      ${COMMENT_MARKER_ICON_SVG}
    </button>`;
  }

  private findCommentInRange(
    startLine: number,
    endLine: number,
    commentByLine: Map<number, DeepspecReviewComment>
  ): DeepspecReviewComment | undefined {
    for (let n = startLine; n <= endLine; n++) {
      const c = commentByLine.get(n);
      if (c) {
        return c;
      }
    }
    return undefined;
  }

  private buildSingleLineRowHtml(
    num: number,
    commentByLine: Map<number, DeepspecReviewComment>
  ): string {
    const line = this.sourceLines[num - 1] ?? '';
    const onLine = commentByLine.get(num);
    const rowClasses = ['line-row', onLine ? 'has-comment-line' : ''].filter(Boolean).join(' ');
    const rendered = renderMarkdownLine(line);

    return `<div class="${rowClasses}" data-line="${num}">
  <div class="line-gutter">
    <button type="button" class="chat-btn" data-line="${num}" title="Add comment — Ctrl/Cmd+click for separate lines, Shift+click for range" aria-label="Add comment on line ${num}">
      ${CHAT_ADD_ICON_SVG}
    </button>
    ${this.buildMarkerHtml(onLine)}
    <span class="line-num" data-line="${num}">${num}</span>
  </div>
  <div class="line-content md-rendered">${rendered}</div>
</div>`;
  }

  private buildBlockRowHtml(
    startLine: number,
    endLine: number,
    contentHtml: string,
    commentByLine: Map<number, DeepspecReviewComment>,
    _fileKey: string,
    extraClass: string
  ): string {
    const onLine = this.findCommentInRange(startLine, endLine, commentByLine);
    const isRange = endLine > startLine;
    const lineAttr = isRange
      ? `data-line-start="${startLine}" data-line-end="${endLine}"`
      : `data-line="${startLine}"`;
    const numLabel = isRange ? `${startLine}–${endLine}` : `${startLine}`;
    const rowClasses = ['line-row', 'block-row', extraClass, onLine ? 'has-comment-line' : '']
      .filter(Boolean)
      .join(' ');

    return `<div class="${rowClasses}" ${lineAttr}>
  <div class="line-gutter">
    <button type="button" class="chat-btn" ${lineAttr} title="Add comment on lines ${numLabel}" aria-label="Add comment on lines ${numLabel}">
      ${CHAT_ADD_ICON_SVG}
    </button>
    ${this.buildMarkerHtml(onLine)}
    <span class="line-num line-num-range" ${lineAttr}>${numLabel}</span>
  </div>
  <div class="line-content md-rendered">${contentHtml}</div>
</div>`;
  }

  private buildHtml(comments: DeepspecReviewComment[], stage: DeepSpecTreeStage): string {
    const nonce = getNonce();
    const webview = this.panel.webview;
    const fileKey = this.context.fileUri.toString();
    const linesHtml = this.buildLineRowsHtml(comments, fileKey);

    const abcLabel = this.context.abcKind
      ? ABC_FILE_NAMES[this.context.abcKind]
      : this.fileName;
    const stageBadge =
      stage === 'drafts'
        ? 'Draft'
        : stage === 'active'
          ? 'In development'
          : stage === 'review'
            ? 'Review gate'
            : 'Archive';
    const showApprove = stage !== 'archive';
    const approveLabel =
      stage === 'review' ? 'Complete task' : stage === 'drafts' ? 'Approve spec' : 'LGTM';
    const showRevise = stage === 'review';
    const actionButtons = [
      '<button type="button" class="secondary" id="btn-editor">Open in editor</button>',
      '<button type="button" id="btn-send">Send review to chat</button>',
      showApprove ? `<button type="button" id="btn-approve">${approveLabel}</button>` : '',
      showRevise
        ? '<button type="button" class="secondary" id="btn-revise">Request changes</button>'
        : '',
    ]
      .filter(Boolean)
      .join('\n      ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}' https://cdn.jsdelivr.net;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DeepSpec Review</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    .topbar {
      padding: 12px 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }
    .topbar h1 { margin: 0 0 4px; font-size: 1.1em; font-weight: 600; }
    .badges { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.link-btn {
      background: transparent;
      color: var(--vscode-textLink-foreground);
      padding: 0;
      margin-top: 6px;
      font-size: 12px;
    }
    .main {
      flex: 1;
      display: flex;
      min-height: 0;
    }
    .doc-wrap {
      flex: 1;
      overflow: auto;
    }
    .doc {
      padding: 12px 16px 24px;
      max-width: 100%;
    }
    .line-row {
      display: flex;
      align-items: flex-start;
      min-height: 1.6em;
      border-left: 3px solid transparent;
    }
    .line-row:hover {
      background: var(--vscode-list-hoverBackground);
      border-left-color: var(--vscode-focusBorder);
    }
    .line-row.selected {
      background: var(--vscode-editor-selectionBackground);
      border-left-color: var(--vscode-textLink-activeForeground);
    }
    .line-row.has-comment-line {
      border-left-color: var(--vscode-charts-blue, var(--vscode-textLink-foreground));
    }
    .line-row.has-comment-line.selected {
      border-left-color: var(--vscode-textLink-activeForeground);
    }
    .line-row.in-code {
      font-family: var(--vscode-editor-font-family);
      font-size: calc(var(--vscode-editor-font-size) * 0.95);
    }
    .line-gutter {
      flex: 0 0 68px;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-end;
      gap: 1px;
      padding: 2px 6px 2px 2px;
      user-select: none;
    }
    .comment-marker-slot {
      flex: 0 0 16px;
      width: 16px;
      height: 16px;
    }
    .line-num {
      flex: 0 0 auto;
      min-width: 1.5em;
      font-size: 11px;
      line-height: 1.4;
      text-align: right;
      color: var(--vscode-editorLineNumber-foreground);
      cursor: pointer;
      padding: 2px 0;
    }
    .line-num:hover { color: var(--vscode-editorLineNumber-activeForeground); }
    .chat-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 18px;
      width: 18px;
      height: 18px;
      padding: 0;
      border: none;
      border-radius: 3px;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }
    .line-row:hover .chat-btn,
    .line-row.selected .chat-btn {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      background: var(--vscode-toolbar-hoverBackground);
      color: var(--vscode-textLink-foreground);
    }
    .comment-marker {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 16px;
      width: 16px;
      height: 16px;
      padding: 0;
      border: none;
      border-radius: 3px;
      background: transparent;
      color: var(--vscode-charts-blue, var(--vscode-textLink-foreground));
      cursor: pointer;
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
    }
    .comment-marker:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }
    .line-row.comment-highlight {
      background: var(--vscode-editor-findMatchHighlightBackground, var(--vscode-list-hoverBackground));
    }
    .line-content {
      flex: 1;
      min-width: 0;
      padding: 2px 16px 4px 8px;
      line-height: 1.5;
    }
    .md-rendered h1, .md-rendered h2, .md-rendered h3,
    .md-rendered h4, .md-rendered h5, .md-rendered h6 {
      margin: 0.15em 0;
      font-weight: 600;
      line-height: 1.35;
    }
    .md-rendered h1 { font-size: 1.45em; }
    .md-rendered h2 { font-size: 1.25em; }
    .md-rendered h3 { font-size: 1.1em; }
    .md-rendered h4, .md-rendered h5, .md-rendered h6 { font-size: 1em; }
    .md-rendered p.md-para { margin: 0.1em 0; }
    .md-rendered blockquote.md-quote {
      margin: 0.2em 0;
      padding-left: 12px;
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      color: var(--vscode-textBlockQuote-foreground);
    }
    .md-rendered .md-list-item {
      display: flex;
      gap: 8px;
      margin: 0.1em 0;
    }
    .md-rendered .md-bullet {
      flex: 0 0 auto;
      color: var(--vscode-descriptionForeground);
    }
    .md-rendered code {
      font-family: var(--vscode-editor-font-family);
      font-size: 0.92em;
      background: var(--vscode-textCodeBlock-background);
      padding: 0 4px;
      border-radius: 3px;
    }
    .md-rendered pre.md-fence,
    .md-rendered pre.md-code-line {
      margin: 0;
      padding: 0;
      background: transparent;
    }
    .md-rendered pre.md-code-line code {
      display: block;
      padding: 0 6px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 3px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .md-rendered pre.md-fence code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
    }
    .md-rendered hr.md-hr {
      margin: 0.4em 0;
      border: none;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .md-rendered a {
      color: var(--vscode-textLink-foreground);
    }
    .md-rendered img {
      max-width: 100%;
    }
    .md-table-wrap {
      overflow-x: auto;
      margin: 4px 0 8px;
    }
    .md-table {
      border-collapse: collapse;
      width: 100%;
      font-size: 0.95em;
    }
    .md-table th,
    .md-table td {
      border: 1px solid var(--vscode-panel-border);
      padding: 6px 10px;
      text-align: left;
      vertical-align: top;
    }
    .md-table th {
      background: var(--vscode-editor-inactiveSelectionBackground);
      font-weight: 600;
    }
    .md-table tr:nth-child(even) td {
      background: var(--vscode-list-hoverBackground);
    }
    .md-mermaid-wrap {
      margin: 8px 0 12px;
      padding: 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      background: var(--vscode-sideBar-background);
      overflow-x: auto;
    }
    .md-mermaid-wrap .mermaid {
      margin: 0;
      background: transparent;
    }
    .md-fenced-wrap {
      margin: 4px 0 8px;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid var(--vscode-panel-border);
    }
    .md-code-lang {
      font-size: 11px;
      padding: 4px 8px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .md-fenced {
      margin: 0;
      padding: 10px 12px;
      overflow-x: auto;
      background: var(--vscode-textCodeBlock-background);
    }
    .md-fenced code {
      font-family: var(--vscode-editor-font-family);
      white-space: pre;
    }
    .line-row.block-row .line-content {
      padding-top: 6px;
      padding-bottom: 8px;
    }
    .line-num-range {
      font-size: 10px;
      white-space: nowrap;
    }
    .inline-comment-row,
    .saved-comment-row {
      display: flex;
      align-items: flex-start;
    }
    .inline-comment-row {
      border-left: 3px solid var(--vscode-focusBorder);
      background: var(--vscode-editor-inactiveSelectionBackground);
    }
    .saved-comment-row {
      border-left: 3px solid var(--vscode-charts-blue, var(--vscode-textLink-foreground));
    }
    .saved-comment-row.active .saved-comment-bubble {
      border-color: var(--vscode-focusBorder);
      outline: 1px solid var(--vscode-focusBorder);
    }
    .inline-comment-gutter {
      flex: 0 0 68px;
    }
    .inline-comment-inner {
      flex: 1;
      min-width: 0;
      margin: 6px 16px 14px 0;
      padding: 10px 12px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      background: var(--vscode-input-background);
    }
    .saved-comment-bubble {
      flex: 1;
      min-width: 0;
      margin: 4px 16px 12px 0;
      padding: 8px 10px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      background: var(--vscode-input-background);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    }
    .saved-comment-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
    }
    .saved-comment-range {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
    }
    .comment-remove {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 22px;
      width: 22px;
      height: 22px;
      padding: 0;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
    }
    .comment-remove:hover {
      background: var(--vscode-toolbar-hoverBackground);
      color: var(--vscode-errorForeground);
    }
    .saved-comment-body {
      font-size: 13px;
      white-space: pre-wrap;
      line-height: 1.45;
    }
    .inline-comment-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--vscode-foreground);
    }
    textarea {
      width: 100%;
      min-height: 72px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 8px;
      font-family: inherit;
      resize: vertical;
    }
    .inline-comment-body {
      width: 100%;
      min-height: 72px;
      margin-bottom: 8px;
    }
    .inline-comment-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .inline-comment-actions button {
      font-size: 12px;
      padding: 4px 12px;
    }
  </style>
</head>
<body>
  <div class="topbar">
    <h1>${escapeHtml(abcLabel)}</h1>
    <div class="badges">
      <span class="badge">${escapeHtml(stageBadge)}</span>
      <span class="badge">${escapeHtml(this.context.taskId ?? '')}</span>
    </div>
    <div class="actions">
      ${actionButtons}
    </div>
  </div>
  <div class="main">
    <div class="doc-wrap">
      <div class="doc" id="doc">${linesHtml}</div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let selectedLines = [];
    let rangeAnchor = null;
    let draftComposer = null;

    function isMeta(e) {
      return e.ctrlKey || e.metaKey;
    }

    function linesContiguous(nums) {
      if (nums.length <= 1) return true;
      const s = [...nums].sort((a, b) => a - b);
      for (let i = 1; i < s.length; i++) {
        if (s[i] !== s[i - 1] + 1) return false;
      }
      return true;
    }

    function fillRange(from, to) {
      const a = Math.min(from, to);
      const b = Math.max(from, to);
      const out = [];
      for (let i = a; i <= b; i++) out.push(i);
      return out;
    }

    function getSelection() {
      if (!selectedLines.length) return null;
      const sorted = [...selectedLines].sort((a, b) => a - b);
      return { start: sorted[0], end: sorted[sorted.length - 1], lines: sorted };
    }

    function formatLinesLabel(sorted) {
      if (sorted.length === 1) return 'line ' + sorted[0];
      if (linesContiguous(sorted)) return 'lines ' + sorted[0] + '–' + sorted[sorted.length - 1];
      return 'lines ' + sorted.join(', ');
    }

    function formatLinesLabelShort(sorted) {
      if (sorted.length === 1) return 'L' + sorted[0];
      if (linesContiguous(sorted)) return 'L' + sorted[0] + '–' + sorted[sorted.length - 1];
      return sorted.map((n) => 'L' + n).join(', ');
    }

    function setSelectedLines(lines) {
      selectedLines = [...new Set(lines)].sort((a, b) => a - b);
      rangeAnchor = selectedLines.length === 1 ? selectedLines[0] : null;
      applySelectionHighlight();
    }

    function applySelectionHighlight() {
      const set = new Set(selectedLines);
      document.querySelectorAll('.line-row').forEach((row) => {
        let nums = [];
        if (row.hasAttribute('data-line-start')) {
          const start = parseInt(row.getAttribute('data-line-start'), 10);
          const end = parseInt(row.getAttribute('data-line-end'), 10);
          nums = fillRange(start, end);
        } else if (row.hasAttribute('data-line')) {
          nums = [parseInt(row.getAttribute('data-line'), 10)];
        }
        const selected = nums.length > 0 && nums.some((n) => set.has(n));
        row.classList.toggle('selected', selected);
      });
    }

    function highlightCommentBubble(commentId) {
      document.querySelectorAll('.saved-comment-row').forEach((row) => {
        row.classList.toggle('active', row.getAttribute('data-comment-id') === commentId);
      });
    }

    function parseLinesAttribute(el) {
      const raw = el.getAttribute('data-lines');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) return parsed.map(Number);
        } catch (_) { /* fall through */ }
      }
      const start = parseInt(el.getAttribute('data-start'), 10);
      const end = parseInt(el.getAttribute('data-end'), 10);
      return fillRange(start, end);
    }

    function highlightCommentLines(lines, commentId) {
      const set = new Set(lines);
      document.querySelectorAll('.line-row').forEach((row) => {
        let nums = [];
        if (row.hasAttribute('data-line-start')) {
          const start = parseInt(row.getAttribute('data-line-start'), 10);
          const end = parseInt(row.getAttribute('data-line-end'), 10);
          nums = fillRange(start, end);
        } else if (row.hasAttribute('data-line')) {
          nums = [parseInt(row.getAttribute('data-line'), 10)];
        }
        const hit = nums.some((n) => set.has(n));
        row.classList.toggle('comment-highlight', hit);
      });
      highlightCommentBubble(commentId);
      const bubble = document.querySelector('.saved-comment-row[data-comment-id="' + commentId + '"]');
      if (bubble) bubble.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function clearSelectionState() {
      closeInlineComposer({ confirmIfDirty: false });
      selectedLines = [];
      rangeAnchor = null;
      applySelectionHighlight();
      document.querySelectorAll('.line-row').forEach((r) => r.classList.remove('comment-highlight'));
      document.querySelectorAll('.saved-comment-row').forEach((r) => r.classList.remove('active'));
    }

    function findAnchorRowForLines(lines) {
      const sorted = [...lines].sort((a, b) => a - b);
      const lastLine = sorted[sorted.length - 1];
      let blockRow = null;
      document.querySelectorAll('.line-row[data-line-start]').forEach((row) => {
        const start = parseInt(row.getAttribute('data-line-start'), 10);
        const end = parseInt(row.getAttribute('data-line-end'), 10);
        if (lastLine >= start && lastLine <= end) {
          blockRow = row;
        }
      });
      if (blockRow) return blockRow;
      return document.querySelector('.line-row[data-line="' + lastLine + '"]');
    }

    function closeInlineComposer({ confirmIfDirty = false, clearSelection = false } = {}) {
      const row = document.querySelector('.inline-comment-row');
      if (!row) {
        draftComposer = null;
        if (clearSelection) {
          selectedLines = [];
          rangeAnchor = null;
          applySelectionHighlight();
          document.querySelectorAll('.line-row').forEach((r) => r.classList.remove('comment-highlight'));
          document.querySelectorAll('.saved-comment-row').forEach((r) => r.classList.remove('active'));
        }
        return true;
      }
      const ta = row.querySelector('.inline-comment-body');
      if (confirmIfDirty && ta && ta.value.trim()) {
        if (!confirm('Discard unsaved comment?')) return false;
      }
      row.remove();
      draftComposer = null;
      if (clearSelection) {
        selectedLines = [];
        rangeAnchor = null;
        applySelectionHighlight();
        document.querySelectorAll('.line-row').forEach((r) => r.classList.remove('comment-highlight'));
        document.querySelectorAll('.saved-comment-row').forEach((r) => r.classList.remove('active'));
      }
      return true;
    }

    function openInlineComposer(lines) {
      if (!lines || !lines.length) return;
      const canClose = closeInlineComposer({ confirmIfDirty: true });
      if (canClose === false) return;

      setSelectedLines(lines);
      const sel = getSelection();
      if (!sel) return;

      const anchorRow = findAnchorRowForLines(sel.lines);
      if (!anchorRow) return;

      const label = 'Comment on ' + formatLinesLabelShort(sel.lines);
      const composer = document.createElement('div');
      composer.className = 'inline-comment-row';
      composer.setAttribute('data-composer', 'true');
      composer.innerHTML =
        '<div class="inline-comment-gutter"></div>' +
        '<div class="inline-comment-inner">' +
        '<label class="inline-comment-label">' + label + '</label>' +
        '<textarea class="inline-comment-body" placeholder="Review note for the agent…" aria-label="' + label + '"></textarea>' +
        '<div class="inline-comment-actions">' +
        '<button type="button" class="secondary inline-comment-cancel" aria-label="Cancel comment">Cancel</button>' +
        '<button type="button" class="inline-comment-add" aria-label="Add comment">Add comment</button>' +
        '</div></div>';

      anchorRow.insertAdjacentElement('afterend', composer);
      draftComposer = { lines: sel.lines };

      const ta = composer.querySelector('.inline-comment-body');
      ta.focus();

      composer.querySelector('.inline-comment-cancel').addEventListener('click', () => {
        closeInlineComposer({ confirmIfDirty: true, clearSelection: true });
      });

      composer.querySelector('.inline-comment-add').addEventListener('click', () => {
        const body = ta.value.trim();
        if (!body) return;
        const payload = {
          command: 'addComment',
          startLine: sel.start,
          endLine: sel.end,
          body
        };
        if (sel.lines.length > 1) payload.lineNumbers = sel.lines;
        vscode.postMessage(payload);
      });
    }

    function toggleLine(line) {
      const idx = selectedLines.indexOf(line);
      if (idx >= 0) selectedLines.splice(idx, 1);
      else selectedLines.push(line);
      selectedLines.sort((a, b) => a - b);
      rangeAnchor = null;
      applySelectionHighlight();
    }

    function handleLineClick(line, e) {
      if (isMeta(e)) {
        toggleLine(line);
        return;
      }
      if (e.shiftKey && selectedLines.length > 0) {
        const base = Math.min(...selectedLines, line);
        const top = Math.max(...selectedLines, line);
        setSelectedLines(fillRange(base, top));
        rangeAnchor = null;
        return;
      }
      if (selectedLines.includes(line)) {
        selectedLines = selectedLines.filter((n) => n !== line);
        rangeAnchor = selectedLines.length === 1 ? selectedLines[0] : null;
        applySelectionHighlight();
        return;
      }
      if (rangeAnchor !== null && selectedLines.length === 1 && selectedLines[0] === rangeAnchor) {
        setSelectedLines(fillRange(rangeAnchor, line));
        rangeAnchor = null;
        return;
      }
      selectedLines = [line];
      rangeAnchor = line;
      applySelectionHighlight();
    }

    function scrollToLine(line) {
      const row = document.querySelector('.line-row[data-line="' + line + '"]');
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function resolveClickLines(el) {
      if (el.hasAttribute('data-line-start')) {
        const start = parseInt(el.getAttribute('data-line-start'), 10);
        const end = parseInt(el.getAttribute('data-line-end'), 10);
        return { start, end, lines: fillRange(start, end) };
      }
      const line = parseInt(el.getAttribute('data-line'), 10);
      return { start: line, end: line, lines: [line] };
    }

    function handleLineOrBlockClick(el, e) {
      const ctx = resolveClickLines(el);
      if (isMeta(e)) {
        ctx.lines.forEach((line) => {
          const idx = selectedLines.indexOf(line);
          if (idx >= 0) selectedLines.splice(idx, 1);
          else selectedLines.push(line);
        });
        selectedLines.sort((a, b) => a - b);
        rangeAnchor = null;
        applySelectionHighlight();
        return;
      }
      if (e.shiftKey && selectedLines.length > 0) {
        const base = Math.min(...selectedLines, ctx.start);
        const top = Math.max(...selectedLines, ctx.end);
        setSelectedLines(fillRange(base, top));
        rangeAnchor = null;
        return;
      }
      if (ctx.lines.length > 1) {
        const allBlockSelected = ctx.lines.every((l) => selectedLines.includes(l));
        if (!e.shiftKey && allBlockSelected) {
          selectedLines = selectedLines.filter((l) => !ctx.lines.includes(l));
          rangeAnchor = null;
          applySelectionHighlight();
          return;
        }
        setSelectedLines(ctx.lines);
        rangeAnchor = null;
        return;
      }
      handleLineClick(ctx.start, e);
    }

    document.getElementById('doc').addEventListener('click', (e) => {
      const markerBtn = e.target.closest('.comment-marker');
      if (markerBtn) {
        e.preventDefault();
        e.stopPropagation();
        closeInlineComposer({ confirmIfDirty: true });
        const lines = parseLinesAttribute(markerBtn);
        const commentId = markerBtn.getAttribute('data-comment-id');
        setSelectedLines(lines);
        highlightCommentLines(lines, commentId);
        scrollToLine(lines[0]);
        return;
      }

      const chatBtn = e.target.closest('.chat-btn');
      if (chatBtn) {
        e.preventDefault();
        e.stopPropagation();
        handleLineOrBlockClick(chatBtn, e);
        document.querySelectorAll('.line-row').forEach((r) => r.classList.remove('comment-highlight'));
        document.querySelectorAll('.saved-comment-row').forEach((r) => r.classList.remove('active'));
        const sel = getSelection();
        if (sel) openInlineComposer(sel.lines);
        return;
      }

      const removeBtn = e.target.closest('.comment-remove');
      if (removeBtn) {
        e.preventDefault();
        e.stopPropagation();
        vscode.postMessage({ command: 'removeComment', commentId: removeBtn.getAttribute('data-remove') });
        return;
      }

      const numEl = e.target.closest('.line-num');
      if (numEl) {
        e.preventDefault();
        handleLineOrBlockClick(numEl, e);
        document.querySelectorAll('.line-row').forEach((r) => r.classList.remove('comment-highlight'));
        document.querySelectorAll('.saved-comment-row').forEach((r) => r.classList.remove('active'));
        return;
      }
    });

    document.getElementById('btn-editor').addEventListener('click', () => {
      vscode.postMessage({ command: 'openInEditor' });
    });
    document.getElementById('btn-send').addEventListener('click', () => {
      vscode.postMessage({ command: 'sendToChat' });
    });
    const approveBtn = document.getElementById('btn-approve');
    if (approveBtn) {
      approveBtn.addEventListener('click', () => vscode.postMessage({ command: 'approve' }));
    }
    const reviseBtn = document.getElementById('btn-revise');
    if (reviseBtn) {
      reviseBtn.addEventListener('click', () => vscode.postMessage({ command: 'revise' }));
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg && msg.command === 'clearSelection') {
        clearSelectionState();
      }
    });

  </script>
  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/mermaid@10.9.3/dist/mermaid.min.js"></script>
  <script nonce="${nonce}">
    (function () {
      if (typeof mermaid === 'undefined') return;
      try {
        const dark =
          document.body.classList.contains('vscode-dark') ||
          document.body.classList.contains('vscode-high-contrast');
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? 'dark' : 'default',
          securityLevel: 'strict',
        });
        mermaid.run({ querySelector: '.md-mermaid-wrap .mermaid' }).catch(function () {});
      } catch (_) {
        /* ignore render errors */
      }
    })();
  </script>
</body>
</html>`;
  }
}

/** Maps each line number to the comment that covers it (for gutter markers). */
function commentOnLineMap(
  comments: DeepspecReviewComment[],
  fileUri: string
): Map<number, DeepspecReviewComment> {
  const map = new Map<number, DeepspecReviewComment>();
  for (const c of comments) {
    if (c.fileUri !== fileUri) {
      continue;
    }
    for (const line of linesForComment(c)) {
      if (!map.has(line)) {
        map.set(line, c);
      }
    }
  }
  return map;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
