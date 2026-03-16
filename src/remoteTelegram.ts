/**
 * CursorToys Remote Chat: bidirectional bridge to a connected channel (e.g. chat app).
 * The user creates the chat in Cursor and starts Remote Chat. Summaries are written to the session
 * folder and sent to the channel; incoming messages are injected into this same chat.
 * Currently backed by a single provider; API and UI are provider-agnostic. Commands: /new, /start, /summarize, /end.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { getRemotePath, getRemoteSessionDir, getCurrentSessionFilePath, getSkillsPath, getBaseFolderName } from './utils';

const OPEN_COMMANDS = ['composer.startComposerPrompt'];
const FOCUS_COMMANDS = ['aichat.newfollowupaction'];
const SUBMIT_COMMANDS = [
  'composer.submitComposerPrompt',
  'aichat.submitFollowupAction',
  'composer.sendPrompt',
  'cursor.chat.send'
];
const SEND_KEYBIND = 'cursor.sendKeyBinding';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function execPromise(cmd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(cmd, err => (err ? reject(err) : resolve()));
  });
}

/** OS-level keystroke to submit (Cmd+Enter on Mac, Ctrl+Enter on Linux). Used when IDE commands are not available. */
async function osLevelSend(): Promise<void> {
  if (process.platform === 'darwin') {
    await execPromise(`osascript -e 'tell application "Cursor" to activate'`);
    await delay(200);
    await execPromise(`osascript -e 'tell application "System Events" to keystroke return using {command down}'`);
  } else if (process.platform === 'linux') {
    await execPromise('wmctrl -a "Cursor"');
    await delay(200);
    await execPromise('xdotool key ctrl+Return');
  }
}

/** Triggers submit (Enter) on the current chat composer. Call after workbench.action.chat.open so the message is sent. */
async function submitCurrentChat(): Promise<void> {
  const cmds = await vscode.commands.getCommands(true);
  for (const id of FOCUS_COMMANDS) {
    if (cmds.includes(id)) {
      await vscode.commands.executeCommand(id);
      await delay(150);
      break;
    }
  }
  let submitted = false;
  for (const id of SUBMIT_COMMANDS) {
    if (cmds.includes(id)) {
      await vscode.commands.executeCommand(id);
      submitted = true;
      break;
    }
  }
  if (!submitted && cmds.includes(SEND_KEYBIND)) {
    await vscode.commands.executeCommand(SEND_KEYBIND, {
      text: process.platform === 'darwin' ? 'cmd+enter' : 'ctrl+enter'
    });
  } else if (!submitted) {
    try {
      await osLevelSend();
    } catch {
      // ignore
    }
  }
}

const TELEGRAM_API = 'https://api.telegram.org';
const WORKSPACE_STATE_KEY_RUNNING = 'cursorToys.remote.running';
const GLOBAL_STATE_KEY_ACTIVE_WORKSPACE = 'cursorToys.remote.activeWorkspaceFolder';
const SECRET_KEY_PREFIX = 'cursorToys.remote.telegram';
const POLL_INTERVAL_MS = 4000;
const CMD_NEW = '/new';
const CMD_START = '/start';
const CMD_END = '/end';
const HASHTAG_SUMMARIZE = '#summarize';
const HASHTAG_SUMMARY = '#summary';

const REMOTE_CHAT_SKILL_DIR = 'cursor-toys-remote-chat';
const REMOTE_CHAT_SKILL_NAME = 'cursor-toys-remote-chat';

/** Tag added to messages injected from the channel so the chat has context and the skill is considered active. */
export const REMOTE_CHAT_ACTIVATION_TAG = '[CursorToys:remote]';

/** Instruction appended to injected prompts so the agent runs the summary after the task. Uses session folder when current-session exists. */
function getSummaryPromptSuffix(_sessionId?: string): string {
  const baseFolder = getBaseFolderName();
  const remoteFolder = `.${baseFolder}/remote`;
  const sessionFolder = `${remoteFolder}/session`;
  const globalSkillPath = path.join(getSkillsPath(undefined, true), REMOTE_CHAT_SKILL_DIR, 'SKILL.md');
  return `\n\n---\nAfter completing the above, apply the cursor-toys-remote-chat skill: compose summary and current_status, then write the JSON to \`${sessionFolder}/summary-\${{date:YYYYMMDD-HHmmss}}.json\` (see \`${globalSkillPath}\`). Do not ask for confirmation.`;
}

function getRemoteChatSkillContent(): string {
  const baseFolder = getBaseFolderName();
  const remoteFolder = `.${baseFolder}/remote`;
  const sessionFolder = `${remoteFolder}/session`;
  return `---
name: ${REMOTE_CHAT_SKILL_NAME}
description: When this skill is active in a chat, write chat-end summaries to the remote session folder so the extension can send them to the connected channel (e.g. chat app). Use this to "mark" the chat as the one linked to Remote.
---

# CursorToys Remote Chat

## Init session from chat

If the user asks to **init** or **start** a remote session (e.g. \`/cursor-toys-remote-chat init chat\` or "init chat" or "start remote session"):

1. **If \`${remoteFolder}/current-session\` already exists**: do nothing; the session is already active. Reply briefly that the chat is already linked.
2. **Otherwise**, create the session: create \`${remoteFolder}\` and \`${sessionFolder}\` if missing; generate session id = \`session-YYYYMMDD-HHmmss\`; write \`${remoteFolder}/current-session\` with first line = sessionId; write one initial summary JSON to \`${sessionFolder}/summary-YYYYMMDD-HHmmss.json\` with \`message\`, \`summary\`, \`current_status\` so the extension sends it to the connected channel.
3. **Note**: The user must have started Remote Chat (CursorToys menu: Start Remote Chat) or run "Init session in this chat" at least once so the extension is watching.

---

When this skill is **active for this chat**, apply the rules below. The skill is active when:
- You have been asked to use it or it is explicitly referenced in the chat, **or**
- The current user message (or the conversation) contains the tag \`[CursorToys:remote]\` or references the skill path \`.${baseFolder}/skills/${REMOTE_CHAT_SKILL_DIR}\`. The extension adds these to messages from the remote channel; treat them as context, not as user content to repeat.

1. **Mandatory: write a summary at the end of every chat turn.** When the session is active, you **must** generate and save a conversation summary after each turn. This is not optional. Do not wait for the user to ask for a summary (\`#summarize\` is only for on-demand extra summaries). Every turn ends with writing the summary file.

2. **Check if the session is active**
   - Read the file \`${remoteFolder}/current-session\`. If it exists, the session is active.
   - **If \`current-session\` does not exist**: do **not** create a summary. The conversation may have been ended from the remote side. Skip writing and do not ask for confirmation.
   - If the file exists, write the summary JSON to \`${sessionFolder}/summary-\${{date:YYYYMMDD-HHmmss}}.json\`. Ensure \`${sessionFolder}\` exists (e.g. \`mkdir -p\`).

3. **Language**
   - Write the summary **in the same language as the conversation** (infer from the user's messages). If the user writes in Portuguese, respond in Portuguese; if in English, in English; and so on.

4. **Content**
   - Include **concrete content**: what was actually done in this turn (e.g. files changed, features added, bugs fixed), key decisions, blockers if any, and clear next steps. Avoid generic filler; the reader should understand what happened and what comes next.

5. **Format for the channel**
   - Prefer a \`message\` field: a single message ready to send (Markdown: use *bold* for titles, short lines, bullet points with "-" or "•"). Keep it readable on mobile (short paragraphs, max ~4000 chars).
   - If you provide \`message\`, the extension sends it as-is. Otherwise it builds a message from \`summary\` and \`current_status\`.
   - Also fill \`summary\` and \`current_status\` (used when \`message\` is absent or as fallback):
     - \`summary\`: concise recap of *this* turn with real content (what was done, decided, next steps).
     - \`current_status\`: brief snapshot of overall project progress.

   \`\`\`json: ${sessionFolder}/summary-\${{date:YYYYMMDD-HHmmss}}.json
   {
     "message": "<optional: single message formatted for the channel, same language as chat>",
     "summary": "<insert summary here>",
     "current_status": "<insert current_status here>"
   }
   \`\`\`

6. **End session (natural language)**: If the user asks to **end**, **close**, or **stop** the remote session (e.g. "end session", "encerrar", "close", "fechar sessão"), delete the file \`${remoteFolder}/current-session\` if it exists. That ends the session; do not ask for confirmation.

7. **Silence**: Do not ask for confirmation. Ensure the session directory exists (e.g. \`mkdir -p\`).
`;
}

/**
 * Ensures the cursor-toys-remote-chat skill exists in the global (user home) skills folder.
 * Same skill for all projects; no per-workspace copy.
 */
function ensureRemoteChatSkill(): void {
  const skillsDir = getSkillsPath(undefined, true);
  const skillDir = path.join(skillsDir, REMOTE_CHAT_SKILL_DIR);
  const skillPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }
    fs.writeFileSync(skillPath, getRemoteChatSkillContent(), 'utf8');
  }
}

let statusBarItem: vscode.StatusBarItem | undefined;
let watcherDisposable: vscode.Disposable | undefined;
let tmpWatcherDisposable: vscode.Disposable | undefined;
let pollingIntervalId: ReturnType<typeof setInterval> | undefined;
let lastUpdateId: number = 0;
let extensionContext: vscode.ExtensionContext | undefined;

function getWorkspaceFolderPath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/** Project name for Telegram replies (e.g. "my-app"). */
function getWorkspaceFolderName(): string {
  const p = getWorkspaceFolderPath();
  return p ? path.basename(p) : 'this workspace';
}

function getWorkspaceKey(): string {
  const folder = getWorkspaceFolderPath();
  if (!folder) {
    return '';
  }
  return crypto.createHash('sha256').update(folder).digest('hex').slice(0, 16);
}

/** Global secret keys for Telegram (same token/chat for all projects). */
function getGlobalSecretKey(kind: 'token' | 'chatId'): string {
  return `${SECRET_KEY_PREFIX}.${kind}`;
}

/**
 * Creates a new remote session folder and sets it as current. Used when /new is received.
 * @returns Session id (folder name) or empty string on failure
 */
function createAndSetCurrentSession(): string {
  const workspacePath = getWorkspaceFolderPath();
  if (!workspacePath) {
    return '';
  }
  const sessionDir = getRemoteSessionDir(workspacePath);
  const currentSessionPath = getCurrentSessionFilePath(workspacePath);
  if (!sessionDir || !currentSessionPath) {
    return '';
  }
  const now = new Date();
  const sessionId = `session-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  fs.writeFileSync(currentSessionPath, sessionId + '\n', 'utf8');
  return sessionId;
}

/**
 * Writes an initial summary JSON to the session folder so the watcher sends it to the connected channel.
 * Used when starting a session from the "Init session" command or when the skill inits from chat.
 */
function writeInitialSummaryToSession(_sessionId: string): void {
  const workspacePath = getWorkspaceFolderPath();
  if (!workspacePath) {
    return;
  }
  const sessionDir = getRemoteSessionDir(workspacePath);
  if (!sessionDir) {
    return;
  }
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const projectName = getWorkspaceFolderName();
  const summary = {
    message: `*CursorToys Remote Chat – session started*\nProject: _${projectName}_\n\nThis chat is now linked. Summaries will be sent here.`,
    summary: `Session started for project ${projectName}. Chat linked to remote channel.`,
    current_status: 'Remote session active.'
  };
  const filePath = path.join(sessionDir, `summary-${ts}.json`);
  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2), 'utf8');
}

/** Uses global keys so one token/chat ID works for all workspaces. */
function getSecretKey(kind: 'token' | 'chatId'): string {
  return getGlobalSecretKey(kind);
}

export function getRemoteContext(): vscode.ExtensionContext | undefined {
  return extensionContext;
}

function isRunning(): boolean {
  if (!extensionContext) {
    return false;
  }
  return extensionContext.workspaceState.get<boolean>(WORKSPACE_STATE_KEY_RUNNING, false);
}

function setRunning(running: boolean): void {
  if (extensionContext) {
    extensionContext.workspaceState.update(WORKSPACE_STATE_KEY_RUNNING, running);
  }
}

function updateStatusBar(): void {
  if (!statusBarItem) {
    return;
  }
  const running = isRunning();
  if (running) {
    statusBarItem.text = '$(broadcast) CursorToys Remote Chat';
    statusBarItem.tooltip = 'Remote Chat active. Click for menu';
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }
}

/**
 * Sends text to Telegram via Bot API.
 */
export async function sendToTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  if (!token || !chatId) {
    return false;
  }
  const url = `${TELEGRAM_API}/bot${token}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });
    if (!response.ok) {
      const err = await response.text();
      console.warn('Telegram API error:', response.status, err);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Telegram send failed:', e);
    return false;
  }
}

async function getStoredCredentials(): Promise<{ token: string; chatId: string }> {
  const tokenKey = getSecretKey('token');
  const chatIdKey = getSecretKey('chatId');
  if (!extensionContext || !tokenKey || !chatIdKey) {
    return { token: '', chatId: '' };
  }
  const token = (await extensionContext.secrets.get(tokenKey)) || '';
  const chatId = (await extensionContext.secrets.get(chatIdKey)) || '';
  return { token, chatId };
}

/**
 * Injects text into the current Cursor chat (same thread): open/focus composer, paste text, submit.
 * Same flow as cursor-autopilot: OPEN_COMMANDS -> FOCUS_COMMANDS -> paste (clipboard + sendKeyBinding) -> SUBMIT_COMMANDS or keybind or osLevelSend.
 * Exported so we can register cursorInject.send in extension.ts.
 */
export async function injectTextToChat(text: string): Promise<boolean> {
  const t = (text || '').trim();
  if (!t) {
    return false;
  }
  try {
    const cmds = await vscode.commands.getCommands(true);

    for (const id of OPEN_COMMANDS) {
      if (cmds.includes(id)) {
        await vscode.commands.executeCommand(id);
        break;
      }
    }
    await delay(300);

    for (const id of FOCUS_COMMANDS) {
      if (cmds.includes(id)) {
        await vscode.commands.executeCommand(id);
        break;
      }
    }
    await delay(200);

    await vscode.env.clipboard.writeText(t);
    if (cmds.includes(SEND_KEYBIND)) {
      await vscode.commands.executeCommand(SEND_KEYBIND, {
        text: process.platform === 'darwin' ? 'cmd+v' : 'ctrl+v'
      });
    } else {
      await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
    }
    await delay(100);

    let submitted = false;
    for (const id of SUBMIT_COMMANDS) {
      if (cmds.includes(id)) {
        await vscode.commands.executeCommand(id);
        submitted = true;
        break;
      }
    }
    if (!submitted && cmds.includes(SEND_KEYBIND)) {
      await vscode.commands.executeCommand(SEND_KEYBIND, {
        text: process.platform === 'darwin' ? 'cmd+enter' : 'ctrl+enter'
      });
      submitted = true;
    }
    if (!submitted) {
      try {
        await osLevelSend();
      } catch {
        // OS fallback failed (e.g. wmctrl/xdotool not installed on Linux)
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Wrapper for Telegram handler: try cursorInject.send (e.g. from cursor-autopilot) first, else our injectTextToChat. */
async function injectIntoChat(text: string): Promise<boolean> {
  const t = (text || '').trim();
  if (!t) {
    return false;
  }
  try {
    try {
      await vscode.commands.executeCommand('cursorInject.send', t);
      return true;
    } catch {
      // cursorInject.send not available or failed, use our implementation
    }
    return await injectTextToChat(t);
  } catch {
    return false;
  }
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number };
    chat: { id: number };
    text?: string;
  };
}

/** Fetches pending updates from Telegram and returns them; updates lastUpdateId. */
async function fetchTelegramUpdates(token: string): Promise<TelegramUpdate[]> {
  const url = `${TELEGRAM_API}/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=25`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { ok?: boolean; result?: TelegramUpdate[] };
    const updates = data?.result || [];
    if (updates.length > 0) {
      lastUpdateId = updates[updates.length - 1].update_id;
    }
    return updates;
  } catch {
    return [];
  }
}

/** Handles one incoming channel message: /start (short welcome), /end (end session), /new _text_ or plain text (injected into Cursor chat). */
async function handleIncomingMessage(
  token: string,
  chatIdStr: string,
  text: string,
  _messageId: number
): Promise<void> {
  const raw = (text || '').trim();
  const lower = raw.toLowerCase();

  const reply = async (msg: string) => {
    await sendToTelegram(token, chatIdStr, msg);
  };

  const projectName = getWorkspaceFolderName();

  if (lower === CMD_START || lower.startsWith(CMD_START + ' ')) {
    await reply('CursorToys Remote Chat. Your messages go to the linked Cursor chat. Ask to end the session when you are done.');
    return;
  }

  if (lower === CMD_END || lower.startsWith(CMD_END + ' ')) {
    const workspacePath = getWorkspaceFolderPath();
    const currentSessionPath = workspacePath ? getCurrentSessionFilePath(workspacePath) : '';
    if (currentSessionPath && fs.existsSync(currentSessionPath)) {
      try {
        fs.unlinkSync(currentSessionPath);
      } catch {
        // ignore
      }
      vscode.window.showInformationMessage('CursorToys Remote Chat: session ended from remote. Summaries will no longer be sent.');
    }
    try {
      await vscode.commands.executeCommand('workbench.action.chat.hide');
    } catch {
      // ignore
    }
    await reply('Session ended for project: _' + projectName + '_.');
    return;
  }

  let prompt = raw;
  const isNewTask = lower.startsWith(CMD_NEW + ' ');
  if (lower === CMD_NEW) {
    await reply('Send your message and it goes to the linked Cursor chat.');
    return;
  }
  if (isNewTask) {
    prompt = raw.slice(CMD_NEW.length).trim();
  }

  if (prompt) {
    // Prepend activation tag and skill path so the chat has context and the cursor-toys-remote-chat skill is applied.
    const baseFolder = getBaseFolderName();
    const skillPathRef = `.${baseFolder}/skills/${REMOTE_CHAT_SKILL_DIR}`;
    const textToInject = REMOTE_CHAT_ACTIVATION_TAG + '\n' + skillPathRef + '\n\n' + prompt;
    // Feedback: avoid long waits without communication. Cursor Hooks could be used later for richer progress.
    vscode.window.setStatusBarMessage('CursorToys Remote Chat: sending to Cursor chat...', 5000);
    const ok = await injectIntoChat(textToInject);
    if (ok) {
      vscode.window.setStatusBarMessage('CursorToys Remote Chat: sent.', 2000);
      await reply(isNewTask ? 'Task sent to linked Cursor chat.' : 'Sent to linked chat.');
    } else {
      vscode.window.setStatusBarMessage('', 0);
      await reply('Could not send to Cursor. Ensure the linked chat is open and CursorToys Remote Chat is started.');
    }
  }
}

/** Polling loop: get updates and process messages from our chat. Only the window that started Remote Chat processes. */
async function pollTelegram(): Promise<void> {
  const { token, chatId } = await getStoredCredentials();
  if (!token || !chatId || !isRunning() || !extensionContext) {
    return;
  }
  const activeFolder = extensionContext.globalState.get<string>(GLOBAL_STATE_KEY_ACTIVE_WORKSPACE);
  if (getWorkspaceFolderPath() !== activeFolder) {
    return;
  }
  const updates = await fetchTelegramUpdates(token);
  const chatIdNum = Number(chatId);
  for (const u of updates) {
    const msg = u.message;
    if (!msg || msg.chat.id !== chatIdNum || typeof msg.text !== 'string') {
      continue;
    }
    await handleIncomingMessage(token, chatId, msg.text, msg.message_id);
  }
}

function startPolling(): void {
  if (pollingIntervalId) return;
  pollingIntervalId = setInterval(() => {
    pollTelegram();
  }, POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = undefined;
  }
}

/**
 * Reads a summary JSON and sends it to Telegram. Returns true only when send succeeded,
 * so the watcher can mark the file as sent and avoid duplicate sends. If the file is
 * empty or invalid (e.g. still being written), returns false so onDidChange can retry.
 */
async function handleNewSummaryFile(uri: vscode.Uri): Promise<boolean> {
  if (!extensionContext) {
    return false;
  }
  const activeFolder = extensionContext.globalState.get<string>(GLOBAL_STATE_KEY_ACTIVE_WORKSPACE);
  if (getWorkspaceFolderPath() !== activeFolder) {
    return false;
  }
  const { token, chatId } = await getStoredCredentials();
  if (!token || !chatId) {
    return false;
  }
  const workspacePath = getWorkspaceFolderPath();
  if (!workspacePath) {
    return false;
  }
  const currentSessionPath = getCurrentSessionFilePath(workspacePath);
  if (!currentSessionPath || !fs.existsSync(currentSessionPath)) {
    return false;
  }
  const sessionDir = getRemoteSessionDir(workspacePath);
  if (!sessionDir) {
    return false;
  }
  const filePathNorm = path.normalize(uri.fsPath);
  const sessionDirNorm = path.normalize(sessionDir) + path.sep;
  if (!filePathNorm.startsWith(sessionDirNorm)) {
    return false;
  }
  try {
    vscode.window.setStatusBarMessage('CursorToys Remote Chat: sending summary...', 5000);
    const data = await vscode.workspace.fs.readFile(uri);
    const raw = Buffer.from(data).toString('utf8').trim();
    if (!raw) {
      vscode.window.setStatusBarMessage('', 0);
      return false;
    }
    const json = JSON.parse(raw) as {
      message?: string;
      telegram_message?: string;
      summary?: string;
      current_status?: string;
    };
    const channelMessage = typeof json.message === 'string' ? json.message.trim() : (typeof json.telegram_message === 'string' ? json.telegram_message.trim() : '');
    const summary = typeof json.summary === 'string' ? json.summary : '';
    const status = typeof json.current_status === 'string' ? json.current_status : '';
    const text = channelMessage
      ? channelMessage
      : [
          '**Summary**',
          summary || '(none)',
          '',
          '**Status**',
          status || '(none)'
        ].join('\n');
    const ok = await sendToTelegram(token, chatId, text);
    if (ok) {
      vscode.window.setStatusBarMessage('CursorToys Remote Chat: summary sent', 3000);
      return true;
    }
    vscode.window.setStatusBarMessage('', 0);
    vscode.window.showWarningMessage('CursorToys Remote Chat: failed to send. Check connection settings.');
    return false;
  } catch {
    vscode.window.setStatusBarMessage('', 0);
    return false;
  }
}

/**
 * Ensures the .cursor/remote folder and the cursor-toys-remote-chat skill (global) exist.
 * No rule: the skill alone drives summary writing when the chat is linked.
 */
function ensureRemoteFolderAndSkill(): void {
  const workspacePath = getWorkspaceFolderPath();
  if (!workspacePath) {
    return;
  }
  const remoteDir = getRemotePath(workspacePath);
  if (remoteDir && !fs.existsSync(remoteDir)) {
    fs.mkdirSync(remoteDir, { recursive: true });
  }
  ensureRemoteChatSkill();
}

function startWatcher(): void {
  if (watcherDisposable) {
    return;
  }
  ensureRemoteFolderAndSkill();
  const remoteDir = getRemotePath();
  if (!remoteDir) {
    return;
  }
  if (!fs.existsSync(remoteDir)) {
    fs.mkdirSync(remoteDir, { recursive: true });
  }
  const pattern = new vscode.RelativePattern(remoteDir, 'session/summary-*.json');
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  const sent = new Set<string>();
  const onEvent = async (uri: vscode.Uri) => {
    const key = uri.fsPath;
    if (sent.has(key)) {
      return;
    }
    const ok = await handleNewSummaryFile(uri);
    if (ok) {
      sent.add(key);
    }
  };
  watcher.onDidCreate(onEvent);
  watcher.onDidChange(onEvent);
  watcherDisposable = watcher;

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    const tmpPattern = new vscode.RelativePattern(workspaceFolder, 'tmp/summary-*.json');
    const tmpWatcher = vscode.workspace.createFileSystemWatcher(tmpPattern);
    tmpWatcher.onDidCreate(onEvent);
    tmpWatcher.onDidChange(onEvent);
    tmpWatcherDisposable = tmpWatcher;
  }

  if (extensionContext) {
    extensionContext.globalState.update(GLOBAL_STATE_KEY_ACTIVE_WORKSPACE, getWorkspaceFolderPath() ?? '');
  }
  setRunning(true);
  startPolling();
  updateStatusBar();
}

function stopWatcher(): void {
  stopPolling();
  if (watcherDisposable) {
    watcherDisposable.dispose();
    watcherDisposable = undefined;
  }
  if (tmpWatcherDisposable) {
    tmpWatcherDisposable.dispose();
    tmpWatcherDisposable = undefined;
  }
  setRunning(false);
  updateStatusBar();
}

/**
 * Ensures a current session exists (for the chat the user has open). Creates session folder and
 * current-session file if missing. Call when starting Remote Chat so this Cursor chat is linked to the channel.
 */
function ensureCurrentSession(): string {
  const workspacePath = getWorkspaceFolderPath();
  if (!workspacePath) {
    return '';
  }
  const currentSessionPath = getCurrentSessionFilePath(workspacePath);
  if (!currentSessionPath) {
    return '';
  }
  if (fs.existsSync(currentSessionPath)) {
    const content = fs.readFileSync(currentSessionPath, 'utf8');
    const existing = content.split('\n')[0].trim();
    if (existing) {
      return existing;
    }
  }
  return createAndSetCurrentSession();
}

export async function remoteStart(): Promise<void> {
  if (!getWorkspaceFolderPath()) {
    vscode.window.showWarningMessage('CursorToys Remote Chat: open a workspace first.');
    return;
  }
  const { token, chatId } = await getStoredCredentials();
  if (!token || !chatId) {
    vscode.window.showInformationMessage(
      'CursorToys Remote Chat: configure token and chat ID first (click status bar or run CursorToys: Remote – Configure).'
    );
    return;
  }
  ensureRemoteFolderAndSkill();
  startWatcher();
  vscode.window.showInformationMessage(
    'CursorToys Remote Chat: enabled. Open a chat, run "Link this chat to Remote" or "Init session in this chat", then use the cursor-toys-remote-chat skill so summaries are sent to the connected channel.'
  );
}

/**
 * Links the current chat to Remote: creates a session and writes current-session so that
 * when the user marks this chat with the cursor-toys-remote-chat skill, summaries go to the
 * session folder and the extension sends them to the connected channel. Incoming messages
 * are injected into this chat and sent automatically (Enter).
 */
export async function remoteLinkThisChat(): Promise<void> {
  if (!getWorkspaceFolderPath()) {
    vscode.window.showWarningMessage('CursorToys Remote Chat: open a workspace first.');
    return;
  }
  const { token, chatId } = await getStoredCredentials();
  if (!token || !chatId) {
    vscode.window.showInformationMessage(
      'CursorToys Remote Chat: configure token and chat ID first (CursorToys: Remote – Configure).'
    );
    return;
  }
  ensureRemoteFolderAndSkill();
  const sessionId = createAndSetCurrentSession();
  if (!sessionId) {
    vscode.window.showWarningMessage('CursorToys Remote Chat: could not create session.');
    return;
  }
  if (!isRunning()) {
    startWatcher();
  }
  const baseFolder = getBaseFolderName();
  vscode.window.showInformationMessage(
    `CursorToys Remote Chat: this chat is linked (session: ${sessionId}). Use the cursor-toys-remote-chat skill so summaries are sent to the connected channel. Incoming messages will be added here automatically.`
  );
}

/**
 * Init session in this chat: create session, write initial summary (sent to channel), and start Remote Chat.
 * One command to link the chat and wake up the channel. Can also be triggered from chat by asking the
 * agent to run the cursor-toys-remote-chat skill with "init chat" (agent creates session + initial summary).
 */
export async function remoteInitSession(): Promise<void> {
  if (!getWorkspaceFolderPath()) {
    vscode.window.showWarningMessage('CursorToys Remote Chat: open a workspace first.');
    return;
  }
  const { token, chatId } = await getStoredCredentials();
  if (!token || !chatId) {
    vscode.window.showInformationMessage(
      'CursorToys Remote Chat: configure token and chat ID first (CursorToys: Remote – Configure). Credentials are global for all projects.'
    );
    await remoteConfigure();
    const retry = await getStoredCredentials();
    if (!retry.token || !retry.chatId) {
      return;
    }
  }
  ensureRemoteFolderAndSkill();
  const sessionId = createAndSetCurrentSession();
  if (!sessionId) {
    vscode.window.showWarningMessage('CursorToys Remote Chat: could not create session.');
    return;
  }
  writeInitialSummaryToSession(sessionId);
  if (!isRunning()) {
    startWatcher();
  }
  vscode.window.showInformationMessage(
    `CursorToys Remote Chat: session started (${sessionId}). Initial message sent. Use the cursor-toys-remote-chat skill in this chat so summaries are sent automatically.`
  );
}

export function remotePause(): void {
  stopWatcher();
  vscode.window.showInformationMessage('CursorToys Remote Chat: stopped.');
}

export async function remoteSendLastSummary(): Promise<void> {
  const remoteDir = getRemotePath();
  if (!remoteDir || !fs.existsSync(remoteDir)) {
    vscode.window.showWarningMessage('CursorToys Remote Chat: no remote folder or no summaries yet.');
    return;
  }
  const { token, chatId } = await getStoredCredentials();
  if (!token || !chatId) {
    vscode.window.showWarningMessage('CursorToys Remote Chat: configure token and chat ID first.');
    return;
  }
  const collected: { path: string; mtime: number }[] = [];
  const addDir = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        addDir(full);
      } else if (name.startsWith('summary-') && name.endsWith('.json')) {
        collected.push({ path: full, mtime: stat.mtime.getTime() });
      }
    }
  };
  addDir(remoteDir);
  collected.sort((a, b) => b.mtime - a.mtime);
  if (collected.length === 0) {
    vscode.window.showWarningMessage('CursorToys Remote Chat: no summary files in .cursor/remote/session.');
    return;
  }
  await handleNewSummaryFile(vscode.Uri.file(collected[0].path));
}

export async function remoteConfigure(): Promise<void> {
  if (!extensionContext) {
    vscode.window.showWarningMessage('CursorToys Remote Chat: extension not ready.');
    return;
  }
  const tokenKey = getSecretKey('token');
  const chatIdKey = getSecretKey('chatId');
  const token = await vscode.window.showInputBox({
    prompt: 'Bot token',
    placeHolder: 'e.g. from BotFather or your provider',
    ignoreFocusOut: true,
    value: (await extensionContext.secrets.get(tokenKey)) || undefined
  });
  if (token === undefined) {
    return;
  }
  const chatId = await vscode.window.showInputBox({
    prompt: 'Chat or channel ID',
    placeHolder: 'e.g. user id or group/channel id',
    ignoreFocusOut: true,
    value: (await extensionContext.secrets.get(chatIdKey)) || undefined
  });
  if (chatId === undefined) {
    return;
  }
  if (token.trim()) {
    await extensionContext.secrets.store(tokenKey, token.trim());
  }
  if (chatId.trim()) {
    await extensionContext.secrets.store(chatIdKey, chatId.trim());
  }
  ensureRemoteFolderAndSkill();
  vscode.window.showInformationMessage('CursorToys Remote Chat: connection saved globally (same for all projects). Folder created if missing.');
}

export function remoteOpenFolder(): void {
  const remoteDir = getRemotePath();
  if (!remoteDir) {
    vscode.window.showWarningMessage('CursorToys Remote Chat: open a workspace first.');
    return;
  }
  if (!fs.existsSync(remoteDir)) {
    fs.mkdirSync(remoteDir, { recursive: true });
  }
  vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(remoteDir));
}

const MENU_STOP = 'Stop';
const MENU_CONFIGURE = 'Configure';

export async function remoteShowMenu(): Promise<void> {
  const items = [
    { label: MENU_STOP, description: 'Stop CursorToys Remote Chat' },
    { label: MENU_CONFIGURE, description: 'Set connection (token and chat/channel ID, global)' }
  ];
  const chosen = await vscode.window.showQuickPick(items, {
    placeHolder: 'CursorToys Remote Chat',
    matchOnDescription: true
  });
  if (!chosen) {
    return;
  }
  switch (chosen.label) {
    case MENU_STOP:
      remotePause();
      break;
    case MENU_CONFIGURE:
      await remoteConfigure();
      break;
    default:
      break;
  }
}

/**
 * Initializes Cursor Remote: status bar and optional watcher if state was running.
 */
export function initRemote(context: vscode.ExtensionContext): void {
  extensionContext = context;
  const folder = getWorkspaceFolderPath();
  if (!folder) {
    return;
  }

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusBarItem.command = 'cursor-toys.remote.showMenu';
  context.subscriptions.push(statusBarItem);
  updateStatusBar();

  if (isRunning()) {
    startWatcher();
  }

  context.subscriptions.push({
    dispose: () => {
      stopWatcher();
    }
  });
}
