import * as vscode from 'vscode';

/**
 * Interface for AI providers that can refine text
 */
export interface AIProvider {
  /**
   * Provider identifier (e.g., 'gemini', 'openai')
   */
  name: string;

  /**
   * Human-readable display name (e.g., 'Google Gemini', 'OpenAI GPT')
   */
  displayName: string;

  /**
   * Gets the API key from secure storage
   * @returns API key or null if not configured
   */
  getApiKey(): Promise<string | null>;

  /**
   * Stores the API key securely
   * @param key API key to store
   */
  setApiKey(key: string): Promise<void>;

  /**
   * Removes the API key from secure storage
   */
  removeApiKey(): Promise<void>;

  /**
   * Prompts the user to enter their API key
   * @returns The API key entered by the user, or null if cancelled
   */
  promptForApiKey(): Promise<string | null>;

  /**
   * Ensures the API key is configured, prompting if necessary
   * @returns true if configured successfully, false otherwise
   */
  ensureApiKeyConfigured(): Promise<boolean>;

  /**
   * Validates an API key by making a test call
   * @param key API key to validate
   * @returns true if valid, false otherwise
   */
  validateApiKey(key: string): Promise<boolean>;

  /**
   * Refines text using the AI provider
   * @param text Text to refine
   * @param prompt System prompt for refinement instructions
   * @param model Optional model name (uses default if not specified)
   * @returns Refined text
   */
  refineText(text: string, prompt: string, model?: string): Promise<string>;

  /**
   * Gets available models for this provider
   * @returns Array of model identifiers
   */
  getAvailableModels(): string[];

  /**
   * Gets the default model for this provider
   * @returns Default model identifier
   */
  getDefaultModel(): string;
}

/**
 * Supported AI provider types
 * Expandable to include more providers in the future
 */
export type AIProviderType = 'gemini' | 'openai' | 'anthropic';

/**
 * Base class for AI providers with common functionality
 */
export abstract class BaseAIProvider implements AIProvider {
  protected context: vscode.ExtensionContext;
  abstract name: string;
  abstract displayName: string;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Gets the secret key identifier for this provider
   */
  protected getSecretKey(): string {
    return `cursorToys.aiProvider.${this.name}.apiKey`;
  }

  async getApiKey(): Promise<string | null> {
    try {
      const key = await this.context.secrets.get(this.getSecretKey());
      return key || null;
    } catch (error) {
      console.error(`Error retrieving ${this.displayName} API key:`, error);
      return null;
    }
  }

  async setApiKey(key: string): Promise<void> {
    try {
      await this.context.secrets.store(this.getSecretKey(), key);
    } catch (error) {
      console.error(`Error storing ${this.displayName} API key:`, error);
      throw new Error(`Failed to store ${this.displayName} API key`);
    }
  }

  async removeApiKey(): Promise<void> {
    try {
      await this.context.secrets.delete(this.getSecretKey());
    } catch (error) {
      console.error(`Error removing ${this.displayName} API key:`, error);
      throw new Error(`Failed to remove ${this.displayName} API key`);
    }
  }

  async ensureApiKeyConfigured(): Promise<boolean> {
    let key = await this.getApiKey();

    if (!key) {
      const userKey = await this.promptForApiKey();
      if (!userKey) {
        return false;
      }
      key = userKey;
    }

    return key !== null;
  }

  abstract promptForApiKey(): Promise<string | null>;
  abstract validateApiKey(key: string): Promise<boolean>;
  abstract refineText(text: string, prompt: string, model?: string): Promise<string>;
  abstract getAvailableModels(): string[];
  abstract getDefaultModel(): string;
}
