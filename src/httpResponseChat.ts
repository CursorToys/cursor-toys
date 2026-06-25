import type { HttpResponsePayload } from './httpResponseTypes';
import { sendToChat } from './sendToChat';

/**
 * Formats request + response for chat analysis.
 */
export function formatHttpExchangeForChat(payload: HttpResponsePayload): string {
  const requestSection = payload.requestPayload
    ? `=== REQUEST ===\n${payload.requestLabel}\n\n${payload.requestPayload}`
    : `=== REQUEST ===\n${payload.requestLabel}`;

  return `${requestSection}\n\n=== RESPONSE ===\n${payload.rawFormatted}`;
}

/**
 * Sends the HTTP exchange raw text to Cursor chat.
 */
export async function sendHttpExchangeToChat(payload: HttpResponsePayload): Promise<void> {
  const text = formatHttpExchangeForChat(payload);
  await sendToChat(text, 'Analyze this HTTP request and response');
}
