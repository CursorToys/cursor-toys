import * as vscode from 'vscode';
import { GoogleGenAI } from '@google/genai';
import { BaseAIProvider } from './index';

/**
 * Google Gemini AI provider implementation
 */
export class GeminiProvider extends BaseAIProvider {
  private static instance: GeminiProvider | null = null;

  name = 'gemini';
  displayName = 'Google Gemini';

  private constructor(context: vscode.ExtensionContext) {
    super(context);
  }

  /**
   * Gets the singleton instance of GeminiProvider
   * @param context VS Code extension context
   * @returns GeminiProvider instance
   */
  public static getInstance(context: vscode.ExtensionContext): GeminiProvider {
    if (!GeminiProvider.instance) {
      GeminiProvider.instance = new GeminiProvider(context);
    }
    return GeminiProvider.instance;
  }

  /**
   * Prompts the user to enter their Gemini API key
   * @returns The API key or null if cancelled
   */
  async promptForApiKey(): Promise<string | null> {
    const key = await vscode.window.showInputBox({
      prompt: 'Enter your Google Gemini API Key',
      password: true,
      placeHolder: 'AIzaSy...',
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'API key cannot be empty';
        }
        if (value.length < 30) {
          return 'API key seems too short. Please verify.';
        }
        return null;
      }
    });

    if (!key) {
      return null;
    }

    // Validate the key
    const isValid = await this.validateApiKey(key);
    if (!isValid) {
      vscode.window.showErrorMessage('Invalid Google Gemini API key. Please check and try again.');
      return null;
    }

    // Save key
    await this.setApiKey(key);
    return key;
  }

  /**
   * Validates the API key by making a test call
   * @param key API key to validate
   * @returns true if valid, false otherwise
   */
  async validateApiKey(key: string): Promise<boolean> {
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      
      // Make a minimal test call to verify the key works
      await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Hello',
      });

      return true;
    } catch (error: any) {
      console.error('Gemini API key validation failed:', error);
      
      // Check for specific error types
      if (error.message?.includes('API key') || error.message?.includes('authentication')) {
        return false;
      }
      
      // If it's another type of error (rate limit, network, etc.), assume key might be valid
      // but there's a temporary issue
      return true;
    }
  }

  /**
   * Refines text using Google Gemini
   * @param text Text to refine
   * @param prompt System prompt for refinement
   * @param model Optional model (defaults to gemini-2.5-flash)
   * @returns Refined text
   */
  async refineText(text: string, prompt: string, model?: string): Promise<string> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('Google Gemini API key not configured');
    }

    const ai = new GoogleGenAI({ apiKey });
    const selectedModel = model || this.getDefaultModel();

    try {
      // Get timeout from configuration
      const config = vscode.workspace.getConfiguration('cursorToys');
      const timeoutSeconds = config.get<number>('aiRequestTimeout', 30);

      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), timeoutSeconds * 1000);
      });

      // Race between API call and timeout
      const response = await Promise.race([
        ai.models.generateContent({
          model: selectedModel,
          contents: `${prompt}\n\n---\n\n${text}`,
        }),
        timeoutPromise
      ]);

      if (!response.text) {
        throw new Error('No text in response');
      }

      return response.text;
    } catch (error: any) {
      console.error('Gemini API error:', error);

      // Provide user-friendly error messages
      if (error.message?.includes('timed out')) {
        throw new Error('Request timed out. Try increasing the timeout in settings or check your internet connection.');
      } else if (error.message?.includes('API key')) {
        throw new Error('Invalid API key. Please reconfigure using "CursorToys: Configure AI Provider".');
      } else if (error.message?.includes('quota') || error.message?.includes('limit')) {
        throw new Error('API quota exceeded. Please check your Gemini API usage limits.');
      } else if (error.message?.includes('network') || error.message?.includes('ENOTFOUND')) {
        throw new Error('Network error. Please check your internet connection.');
      } else {
        throw new Error(`Failed to refine text: ${error.message || 'Unknown error'}`);
      }
    }
  }

  /**
   * Gets available Gemini models
   * @returns Array of model identifiers
   */
  getAvailableModels(): string[] {
    return ['gemini-2.5-flash', 'gemini-2.5-pro'];
  }

  /**
   * Gets the default Gemini model
   * @returns Default model identifier
   */
  getDefaultModel(): string {
    return 'gemini-2.5-flash';
  }
}
