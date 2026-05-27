/**
 * Paste text into the Cursor chat composer and optionally submit (DeepFlow, refine, cursorInject.send).
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { getSkillsPath } from './utils';

const OPEN_COMMANDS = ['composer.startComposerPrompt'];
const FOCUS_COMMANDS = ['aichat.newfollowupaction'];
const SUBMIT_COMMANDS = [
  'composer.submitComposerPrompt',
  'aichat.submitFollowupAction',
  'composer.sendPrompt',
  'cursor.chat.send',
];
const SEND_KEYBIND = 'cursor.sendKeyBinding';

const REMOTE_CHAT_SKILL_DIR = 'cursor-toys-remote-chat';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function execPromise(cmd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(cmd, (err) => (err ? reject(err) : resolve()));
  });
}

/** Result of injecting text into the chat composer. */
export interface InjectTextToChatResult {
  pasted: boolean;
  submitted: boolean;
}

/** User-facing submit shortcut for the current platform. */
export function getChatSubmitShortcutLabel(): string {
  return process.platform === 'darwin' ? 'Cmd+Enter' : 'Ctrl+Enter';
}

/**
 * Warns when text was pasted but auto-submit failed (user must press the shortcut manually).
 */
export function notifyPasteWithoutSubmit(source = 'CursorToys'): void {
  let detail = `Press ${getChatSubmitShortcutLabel()} to submit.`;
  if (process.platform === 'linux') {
    detail += ' On Linux, install wmctrl and xdotool if auto-send keeps failing.';
  } else if (process.platform === 'win32') {
    detail += ' Ensure the Cursor window is focused.';
  }
  void vscode.window.showWarningMessage(
    `${source}: message pasted in chat but could not auto-send. ${detail}`
  );
}

/** OS-level keystroke to submit (Cmd+Enter / Ctrl+Enter). Used when IDE commands are not available. */
async function osLevelSend(): Promise<boolean> {
  try {
    if (process.platform === 'darwin') {
      await execPromise(`osascript -e 'tell application "Cursor" to activate'`);
      await delay(200);
      await execPromise(
        `osascript -e 'tell application "System Events" to keystroke return using {command down}'`
      );
      return true;
    }
    if (process.platform === 'linux') {
      await execPromise('wmctrl -a "Cursor"');
      await delay(200);
      await execPromise('xdotool key ctrl+Return');
      return true;
    }
    if (process.platform === 'win32') {
      const ps = [
        '$w = New-Object -ComObject WScript.Shell',
        "if (-not $w.AppActivate('Cursor')) { exit 1 }",
        'Start-Sleep -Milliseconds 250',
        "$w.SendKeys('^{ENTER}')",
      ].join('; ');
      await execPromise(`powershell -NoProfile -NonInteractive -Command "${ps}"`);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Tries Cursor composer submit commands, keybinding, then OS-level send. */
async function trySubmitComposer(cmds: readonly string[]): Promise<boolean> {
  for (const id of FOCUS_COMMANDS) {
    if (cmds.includes(id)) {
      await vscode.commands.executeCommand(id);
      await delay(150);
      break;
    }
  }
  for (const id of SUBMIT_COMMANDS) {
    if (cmds.includes(id)) {
      await vscode.commands.executeCommand(id);
      return true;
    }
  }
  if (cmds.includes(SEND_KEYBIND)) {
    await vscode.commands.executeCommand(SEND_KEYBIND, {
      text: process.platform === 'darwin' ? 'cmd+enter' : 'ctrl+enter',
    });
    return true;
  }
  return osLevelSend();
}

export interface InjectTextToChatOptions {
  /** When false, paste only and leave the composer for the user to edit and submit. Default: true. */
  submit?: boolean;
}

/**
 * Injects text into the current Cursor chat: open/focus composer, paste text, optionally submit.
 */
export async function injectTextToChat(
  text: string,
  options?: InjectTextToChatOptions
): Promise<InjectTextToChatResult> {
  const shouldSubmit = options?.submit !== false;
  const t = (text || '').trim();
  if (!t) {
    return { pasted: false, submitted: false };
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
        text: process.platform === 'darwin' ? 'cmd+v' : 'ctrl+v',
      });
    } else {
      await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
    }
    await delay(100);

    const submitted = shouldSubmit ? await trySubmitComposer(cmds) : false;
    return { pasted: true, submitted };
  } catch {
    return { pasted: false, submitted: false };
  }
}

/**
 * Removes the legacy cursor-toys-remote-chat skill folder from the user skills directory.
 */
export function removeLegacyRemoteChatSkill(): void {
  const skillDir = path.join(getSkillsPath(undefined, true), REMOTE_CHAT_SKILL_DIR);
  if (!fs.existsSync(skillDir)) {
    return;
  }
  try {
    fs.rmSync(skillDir, { recursive: true, force: true });
  } catch (error) {
    console.warn('Failed to remove legacy remote chat skill:', error);
  }
}
