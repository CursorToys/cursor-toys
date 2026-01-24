import * as vscode from 'vscode';
import { GeminiProvider } from './geminiProvider';

/**
 * Type for AI provider identifiers
 */
export type AIProviderType = 'gemini';

/**
 * Options for text refinement
 */
export interface RefinementOptions {
  prompt?: string;
  timeout?: number;
  model?: string;
}

/**
 * Interface for AI providers
 */
export interface AIProvider {
  /**
   * Refines the given text using AI
   * @param text Text to refine
   * @param options Refinement options
   * @returns Refined text
   */
  refineText(text: string, options?: RefinementOptions): Promise<string>;
}

/**
 * Gets the configured AI provider instance
 * @param context Extension context for secret storage
 * @returns AI provider instance or null if not configured
 */
export async function getAIProvider(
  context: vscode.ExtensionContext
): Promise<AIProvider | null> {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const providerType = config.get<AIProviderType>('aiProvider', 'gemini');

  switch (providerType) {
    case 'gemini':
      return new GeminiProvider(context);
    default:
      return null;
  }
}
