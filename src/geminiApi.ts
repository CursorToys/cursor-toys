/**
 * Gemini API client using native fetch (no external library)
 */

export interface GeminiApiOptions {
  apiKey: string;
  model?: string;
  prompt?: string;
  timeout?: number;
}

export interface GeminiApiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

export interface GeminiApiError {
  error: {
    code: number;
    message: string;
    status: string;
  };
}

/**
 * Calls the Google Gemini API to generate content
 * @param text Text to be processed
 * @param options API options including key, model, prompt, and timeout
 * @returns Refined text from the API
 * @throws Error if API call fails
 */
export async function callGeminiApi(
  text: string,
  options: GeminiApiOptions
): Promise<string> {
  const {
    apiKey,
    model = 'gemini-2.5-flash',
    prompt = '',
    timeout = 30000
  } = options;

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('Gemini API key is required');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('Text to process cannot be empty');
  }

  // Construct the prompt with text
  const fullPrompt = prompt
    ? `${prompt}\n\n${text}`
    : text;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: fullPrompt
          }]
        }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Try to parse error response
      let errorMessage = `API request failed with status ${response.status}`;
      try {
        const errorData: GeminiApiError = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error.message || errorMessage;
        }
      } catch {
        // If we can't parse error, use default message
        const responseText = await response.text();
        if (responseText) {
          errorMessage = responseText;
        }
      }
      throw new Error(errorMessage);
    }

    const data: GeminiApiResponse = await response.json();

    // Extract text from response
    if (
      data.candidates &&
      data.candidates.length > 0 &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts.length > 0
    ) {
      return data.candidates[0].content.parts[0].text;
    }

    throw new Error('Invalid response format from Gemini API');
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }

    throw new Error(`Unknown error: ${String(error)}`);
  }
}
