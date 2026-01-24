import * as vscode from 'vscode';
import { GoogleGenAI } from '@google/genai';
import { AIProvider, RefinementOptions } from './index';

/**
 * Google Gemini AI Provider implementation
 */
export class GeminiProvider implements AIProvider {
  private readonly context: vscode.ExtensionContext;
  private readonly SECRET_KEY = 'cursorToys.geminiApiKey';

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Gets the API key from secret storage
   */
  private async getApiKey(): Promise<string | null> {
    try {
      const secret = await this.context.secrets.get(this.SECRET_KEY);
      return secret || null;
    } catch (error) {
      console.error('Error getting API key:', error);
      return null;
    }
  }

  /**
   * Stores the API key in secret storage
   */
  async setApiKey(apiKey: string): Promise<void> {
    try {
      await this.context.secrets.store(this.SECRET_KEY, apiKey);
    } catch (error) {
      console.error('Error storing API key:', error);
      throw new Error('Failed to store API key');
    }
  }

  /**
   * Removes the API key from secret storage
   */
  async removeApiKey(): Promise<void> {
    try {
      await this.context.secrets.delete(this.SECRET_KEY);
    } catch (error) {
      console.error('Error removing API key:', error);
      throw new Error('Failed to remove API key');
    }
  }

  /**
   * Checks if API key is configured
   */
  async hasApiKey(): Promise<boolean> {
    const apiKey = await this.getApiKey();
    return apiKey !== null && apiKey.length > 0;
  }

  /**
   * Refines text using Google Gemini API
   */
  async refineText(text: string, options?: RefinementOptions): Promise<string> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('Gemini API key not configured. Please configure it first.');
    }

    const config = vscode.workspace.getConfiguration('cursorToys');
    const defaultPrompt = config.get<string>(
      'aiRefinePrompt',
      'You must return ONLY the refined text, nothing else. Do not add introductions like "Here\'s the refined version" or "Okay, here is". Do not add markdown separators (---). Do not add explanations or notes. Just return the improved text directly.\n\nFix typos, improve clarity, and enhance the flow of the following text:'
    );
    const defaultTimeout = config.get<number>('aiRequestTimeout', 30);
    const defaultModel = config.get<string>('aiModel', '');

    const prompt = options?.prompt || defaultPrompt;
    const timeout = options?.timeout || defaultTimeout;
    // Use gemini-2.5-flash as default (more stable and available in free tier)
    // If user specified a model, use it; otherwise use config or default
    const modelName = options?.model || defaultModel || 'gemini-2.5-flash';

    try {
      const genAI = new GoogleGenAI({ apiKey });
      
      const fullPrompt = `${prompt}\n\n${text}`;

      // Create a promise with timeout
      const requestPromise = genAI.models.generateContent({
        model: modelName,
        contents: fullPrompt
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timeout after ${timeout} seconds`));
        }, timeout * 1000);
      });

      const response = await Promise.race([requestPromise, timeoutPromise]);
      const refinedText = response.text || '';

      if (!refinedText || refinedText.trim().length === 0) {
        throw new Error('Empty response from AI');
      }

      return refinedText.trim();
    } catch (error: any) {
      // Handle timeout errors
      if (error.message?.includes('timeout')) {
        throw new Error(`Request timeout after ${timeout} seconds`);
      }
      
      // Extract error details - handle both direct error and nested error.error structure
      const errorObj = error.error || error;
      const errorCode = errorObj.code || error.code;
      const errorStatus = errorObj.status || error.status;
      const errorMessage = errorObj.message || error.message || String(error);
      
      // Handle API key errors
      if (errorMessage?.includes('API key') || errorCode === 401 || errorCode === 403) {
        throw new Error('Invalid API key. Please check your Gemini API key.');
      }
      
      // Handle quota/rate limit errors (429 or RESOURCE_EXHAUSTED)
      if (errorCode === 429 || errorStatus === 'RESOURCE_EXHAUSTED' || 
          errorMessage?.includes('quota') || errorMessage?.includes('Quota exceeded') ||
          errorMessage?.includes('RESOURCE_EXHAUSTED')) {
        // Try to extract retry time from error message
        const retryMatch = errorMessage.match(/retry in ([\d.]+)s/i);
        const retryAfter = retryMatch ? retryMatch[1] : null;
        
        let message = 'API quota exceeded. ';
        if (retryAfter) {
          const seconds = Math.ceil(parseFloat(retryAfter));
          message += `Please retry in ${seconds} second${seconds !== 1 ? 's' : ''}. `;
        }
        message += 'You may need to check your Google AI Studio quota or wait before trying again.';
        throw new Error(message);
      }
      
      // Handle other errors
      throw new Error(`Failed to refine text: ${errorMessage}`);
    }
  }
}
