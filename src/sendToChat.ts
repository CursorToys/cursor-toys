import * as vscode from 'vscode';

const DEEPLINK_BASE = 'cursor://anysphere.cursor-deeplink/prompt';
export const MAX_DEEPLINK_LENGTH = 8000;

/**
 * Constrói deeplink para prompt
 * @param text Texto a ser codificado no deeplink
 * @returns Deeplink formatado
 */
export function buildPromptDeeplink(text: string): string {
  const encodedText = encodeURIComponent(text);
  return `${DEEPLINK_BASE}?text=${encodedText}`;
}

/**
 * Envia texto diretamente para o chat do Cursor
 * @param text Texto a ser enviado
 * @param prompt Prompt opcional para adicionar antes do texto
 */
export async function sendToChat(text: string, prompt?: string): Promise<boolean> {
  try {
    // Combinar prompt e texto se fornecido
    const fullText = prompt 
      ? `${prompt}\n\n---\n\n${text}`
      : text;

    // Validar tamanho
    const deeplink = buildPromptDeeplink(fullText);
    if (deeplink.length > MAX_DEEPLINK_LENGTH) {
      vscode.window.showErrorMessage(
        `Text too long (${deeplink.length} characters). Limit: ${MAX_DEEPLINK_LENGTH} characters.`
      );
      return false;
    }

    // Abrir deeplink
    await vscode.env.openExternal(vscode.Uri.parse(deeplink));
    vscode.window.showInformationMessage('Sent to Cursor chat!');
    return true;
  } catch (error) {
    vscode.window.showErrorMessage(`Error sending to chat: ${error}`);
    return false;
  }
}

/**
 * Envia seleção atual do editor para o chat
 */
export async function sendSelectionToChat(prompt?: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor');
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);

  if (!selectedText.trim()) {
    vscode.window.showWarningMessage('No text selected');
    return;
  }

  // Incluir contexto do arquivo
  const fileName = editor.document.fileName;
  const language = editor.document.languageId;
  const contextPrompt = prompt 
    ? `${prompt}\n\nFile: ${fileName}\nLanguage: ${language}\n\n---\n\n`
    : `File: ${fileName}\nLanguage: ${language}\n\n---\n\n`;

  await sendToChat(selectedText, contextPrompt);
}

