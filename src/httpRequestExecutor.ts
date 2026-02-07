import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getHttpResponsePath } from './utils';
import { EnvironmentManager } from './environmentManager';

// Store execution times for response files
const executionTimes: Map<string, string> = new Map();

/**
 * Interface for structured HTTP request format
 */
interface HttpRequestConfig {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | object;
}

/**
 * Result of HTTP request execution
 */
interface HttpRequestResult {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  error?: string;
}

/**
 * Parses REST Client format (HTTP Request File format)
 * Format: METHOD URL\nHeader: Value\n\nBody
 * Standard separator: ### (three hashes) for multiple requests
 * Only the first request is parsed (before the first ### separator)
 * @param content The file content
 * @returns The parsed HTTP request configuration or null if parsing fails
 */
function parseRestClientFormat(content: string): HttpRequestConfig | null {
  const trimmed = content.trim();
  
  // Split by ### separator (REST Client standard) and take first request
  const firstRequest = trimmed.split('###')[0].trim();
  if (!firstRequest) {
    return null;
  }
  
  // Split lines but preserve original content for body
  const rawLines = firstRequest.split('\n');
  const lines = rawLines.map(line => line.trim());
  
  if (lines.length === 0) {
    return null;
  }
  
  // Find the first line that is an HTTP method (skip comments and empty lines)
  let methodLineIndex = -1;
  let method: string | null = null;
  let url: string | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip empty lines and comments
    if (line && !line.startsWith('#')) {
      const methodUrlMatch = line.match(/^(\w+)\s+(.+)$/);
      if (methodUrlMatch) {
        const potentialMethod = methodUrlMatch[1].toUpperCase();
        const potentialUrl = methodUrlMatch[2].trim().replace(/^["']|["']$/g, '');
        
        // Check if it's a valid HTTP method and URL
        if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(potentialMethod) &&
            (potentialUrl.match(/^https?:\/\//i) || potentialUrl.match(/\{\{/))) {
          methodLineIndex = i;
          method = potentialMethod;
          url = potentialUrl;
          break;
        }
      }
    }
  }
  
  if (!method || !url || methodLineIndex === -1) {
    return null;
  }
  
  const headers: Record<string, string> = {};
  let bodyStartIndex = -1;
  
  // Parse headers (lines with Header: Value format, starting after the method line)
  for (let i = methodLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    
    // Empty line indicates end of headers and start of body
    if (line === '') {
      bodyStartIndex = i + 1;
      break;
    }
    
    // Check if line is a header (format: Header: Value)
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const headerKey = line.substring(0, colonIndex).trim();
      const headerValue = line.substring(colonIndex + 1).trim();
      if (headerKey && headerValue) {
        headers[headerKey] = headerValue;
      }
    } else {
      // If line doesn't have colon and is not empty, it might be start of body
      // But only if it's not a valid HTTP method line (which would be a new request)
      if (!line.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+https?:\/\/.+$/i)) {
        bodyStartIndex = i;
        break;
      }
    }
  }
  
  // Parse body if present (use raw lines to preserve formatting)
  let body: string | undefined;
  if (bodyStartIndex >= 0 && bodyStartIndex < rawLines.length) {
    const bodyLines = rawLines.slice(bodyStartIndex);
    body = bodyLines.join('\n').trim();
    if (body === '') {
      body = undefined;
    }
  }
  
  return {
    method,
    url,
    headers,
    body
  };
}

/**
 * Detects if content is in REST Client format
 * @param content The file content
 * @returns true if content appears to be REST Client format
 */
function isRestClientFormat(content: string): boolean {
  const trimmed = content.trim();
  const lines = trimmed.split('\n');
  
  // Find the first non-comment, non-empty line that matches METHOD URL pattern
  // Accept URLs starting with http:// or https://, or containing variables like {{BASE_URL}}
  for (const line of lines) {
    const trimmedLine = line.trim();
    // Skip empty lines and comments
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const methodUrlMatch = trimmedLine.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/|\{\{).+$/i);
      if (methodUrlMatch) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Parses the content of an HTTP request file
 * Supports structured JSON format, REST Client format, and raw curl commands
 * @param content The file content
 * @returns The parsed HTTP request configuration or null if parsing fails
 */
export function parseHttpRequest(content: string): HttpRequestConfig | null {
  const trimmed = content.trim();
  
  // Try to parse as JSON (structured format)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.url) {
        return {
          method: parsed.method || 'GET',
          url: parsed.url,
          headers: parsed.headers || {},
          body: parsed.body
        };
      }
    } catch {
      // Not valid JSON, continue to other formats
    }
  }
  
  // Try to parse as REST Client format (HTTP Request File)
  if (isRestClientFormat(trimmed)) {
    const restClientConfig = parseRestClientFormat(trimmed);
    if (restClientConfig) {
      return restClientConfig;
    }
  }
  
  // Try to parse as curl command
  return parseCurlCommand(trimmed);
}

/**
 * Parses a curl command string and extracts HTTP request parameters
 * @param curlCommand The curl command string
 * @returns The parsed HTTP request configuration or null if parsing fails
 */
function parseCurlCommand(curlCommand: string): HttpRequestConfig | null {
  // Normalize: remove line breaks and extra spaces, but preserve quoted strings
  let command = curlCommand.trim();
  
  // Remove 'curl' prefix if present
  if (command.toLowerCase().startsWith('curl')) {
    command = command.substring(4).trim();
  }
  
  // Replace line breaks with spaces, but preserve content within quotes
  command = command.replace(/\s+/g, ' ').trim();
  
  // Extract URL (usually the last argument or after -X)
  // Try to match URLs with or without quotes
  const urlPatterns = [
    /['"]https?:\/\/[^'"]+['"]/i,
    /https?:\/\/[^\s"']+/i
  ];
  
  let url: string | null = null;
  for (const pattern of urlPatterns) {
    const urlMatch = command.match(pattern);
    if (urlMatch) {
      url = urlMatch[0].replace(/['"]/g, '');
      break;
    }
  }
  
  if (!url) {
    return null;
  }
  
  // Extract method (-X GET, -X POST, etc.)
  const methodMatch = command.match(/-X\s+(\w+)/i);
  const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';
  
  // Extract headers (-H "Header: Value" or --header "Header: Value")
  const headers: Record<string, string> = {};
  // Match -H or --header with quoted or unquoted values
  // Handle both single and double quotes, and escaped quotes
  const headerRegex = /(?:-H|--header)\s+(["'])((?:(?:\\.|(?!\1)[^\\])*))\1/gi;
  let headerMatch;
  while ((headerMatch = headerRegex.exec(command)) !== null) {
    const headerLine = headerMatch[2];
    const colonIndex = headerLine.indexOf(':');
    if (colonIndex > 0) {
      const key = headerLine.substring(0, colonIndex).trim();
      const value = headerLine.substring(colonIndex + 1).trim();
      headers[key] = value;
    }
  }
  
  // Extract body (-d, --data, --data-raw, or --data-binary)
  // Try to match with quotes first, then without
  let body: string | undefined;
  const bodyPatterns = [
    /(?:--data-raw|--data-binary)\s+(["'])((?:(?:\\.|(?!\1)[^\\])*))\1/i,
    /(?:-d|--data)\s+(["'])((?:(?:\\.|(?!\1)[^\\])*))\1/i,
    /(?:--data-raw|--data-binary)\s+([^\s]+)/i,
    /(?:-d|--data)\s+([^\s]+)/i
  ];
  
  for (const pattern of bodyPatterns) {
    const bodyMatch = command.match(pattern);
    if (bodyMatch) {
      body = bodyMatch[2] || bodyMatch[1];
      break;
    }
  }
  
  return {
    method,
    url,
    headers,
    body
  };
}

/**
 * Builds a curl command from HTTP request configuration
 * @param config The HTTP request configuration
 * @returns The curl command string
 */
function buildCurlCommand(config: HttpRequestConfig): string {
  let curlCmd = 'curl';
  
  // Add include headers flag to capture HTTP headers
  curlCmd += ' -i';
  
  // Add silent flag to suppress progress (but keep errors)
  curlCmd += ' -s';
  
  // Add show error flag to capture errors
  curlCmd += ' -S';
  
  // Add write-out to ensure we get status code (as fallback)
  // Format: http_code:status_code
  curlCmd += ' -w "\\nHTTPSTATUS:%{http_code}"';
  
  // Add method
  if (config.method && config.method !== 'GET') {
    curlCmd += ` -X ${config.method}`;
  }
  
  // Add headers
  if (config.headers) {
    for (const [key, value] of Object.entries(config.headers)) {
      // Escape quotes in header values
      const escapedValue = value.replace(/"/g, '\\"');
      curlCmd += ` -H "${key}: ${escapedValue}"`;
    }
  }
  
  // Add body
  if (config.body) {
    const bodyStr = typeof config.body === 'string' ? config.body : JSON.stringify(config.body);
    // Escape single quotes for shell
    const escapedBody = bodyStr.replace(/'/g, "'\\''");
    curlCmd += ` -d '${escapedBody}'`;
  }
  
  // Add URL (must be last)
  // Escape quotes in URL
  const escapedUrl = config.url.replace(/"/g, '\\"');
  curlCmd += ` "${escapedUrl}"`;
  
  return curlCmd;
}

/**
 * Executes an HTTP request using curl
 * @param config The HTTP request configuration
 * @param timeout Timeout in seconds (default: 10)
 * @returns Promise with the HTTP request result
 */
export async function executeHttpRequest(
  config: HttpRequestConfig,
  timeout: number = 10
): Promise<HttpRequestResult> {
  return new Promise((resolve, reject) => {
    const curlCommand = buildCurlCommand(config);
    
    // Execute curl command
    const child = child_process.exec(curlCommand, {
      timeout: timeout * 1000,
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    }, (error, stdout, stderr) => {
      if (error) {
        // Check if it's a timeout
        if (error.signal === 'SIGTERM') {
          const timeoutResult: HttpRequestResult = {
            statusCode: 0,
            statusText: 'Timeout',
            headers: {},
            body: `Request timeout after ${timeout} seconds`,
            error: `Request timeout after ${timeout} seconds`
          };
          resolve(timeoutResult);
          return;
        }
        
        // Check if curl is not found
        if (error.message.includes('curl: command not found') || 
            error.message.includes('curl: not found')) {
          const curlNotFoundResult: HttpRequestResult = {
            statusCode: 0,
            statusText: 'Error',
            headers: {},
            body: 'curl command not found. Please install curl to use this feature.',
            error: 'curl command not found. Please install curl to use this feature.'
          };
          resolve(curlNotFoundResult);
          return;
        }
        
        // Capture curl errors (like invalid URL, connection errors, etc.)
        // Format as HTTP response with error details
        const errorMessage = error.message || String(error);
        let errorOutput = '';
        
        // Combine stdout and stderr to get full raw output
        if (stdout) {
          errorOutput += stdout;
        }
        if (stderr) {
          if (errorOutput) errorOutput += '\n';
          errorOutput += stderr;
        }
        // If no output, use error message
        if (!errorOutput) {
          errorOutput = errorMessage;
        }
        
        // Remove HTTPSTATUS marker if present
        errorOutput = errorOutput.replace(/HTTPSTATUS:\d+\s*/g, '').trim();
        
        // Try to parse as HTTP response if it looks like one
        const parsedResponse = parseCurlResponse(stdout, stderr);
        if (parsedResponse.statusCode > 0) {
          // It's actually an HTTP response, use it
          resolve(parsedResponse);
          return;
        }
        
        // Format as error HTTP response
        const errorResult: HttpRequestResult = {
          statusCode: 0,
          statusText: 'Error',
          headers: {},
          body: errorOutput,
          error: errorMessage
        };
        resolve(errorResult);
        return;
      }
      
      // Parse the response
      const result = parseCurlResponse(stdout, stderr);
      resolve(result);
    });
  });
}

/**
 * Gets HTTP status text from status code
 * @param code The HTTP status code
 * @returns The status text
 */
function getStatusText(code: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    422: 'Unprocessable Entity',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable'
  };
  return statusTexts[code] || 'Unknown';
}

/**
 * Parses curl response output and extracts HTTP status, headers, and body
 * @param stdout Standard output from curl
 * @param stderr Standard error from curl
 * @returns The parsed HTTP request result
 */
function parseCurlResponse(stdout: string, stderr: string): HttpRequestResult {
  // Combine stdout and stderr (curl with -i outputs headers to stdout)
  // stderr usually contains error messages or progress info
  let output = stdout.trim();
  
  // If stdout is empty but stderr has content, check if it's actually the response
  if (!output && stderr) {
    // Sometimes curl outputs to stderr, check if it looks like HTTP response
    if (stderr.includes('HTTP/')) {
      output = stderr.trim();
    }
  }
  
  // Default values
  let statusCode = 0;
  let statusText = 'Unknown';
  const headers: Record<string, string> = {};
  let bodySection = '';
  
  if (!output) {
    return {
      statusCode,
      statusText,
      headers,
      body: bodySection
    };
  }
  
  // First, remove HTTPSTATUS marker from output (added by -w flag) and extract status code
  const httpStatusMatch = output.match(/HTTPSTATUS:(\d{3})/);
  if (httpStatusMatch) {
    statusCode = parseInt(httpStatusMatch[1], 10);
    statusText = getStatusText(statusCode);
    // Remove the HTTPSTATUS line from output (can be anywhere in the output)
    output = output.replace(/HTTPSTATUS:\d{3}\s*/g, '').trim();
  }
  
  // Try to find HTTP status line - it should be at the beginning
  // Look for patterns like: HTTP/1.1 200 OK or HTTP/2 200
  // Only if we don't already have status code from HTTPSTATUS
  if (statusCode === 0) {
    const httpStatusPatterns = [
      /^HTTP\/[\d.]+ (\d{3}) (.+?)(?:\r?\n|$)/m,  // HTTP/1.1 200 OK
      /^HTTP\/[\d.]+ (\d{3})(?:\r?\n|$)/m,        // HTTP/1.1 200
      /< HTTP\/[\d.]+ (\d{3}) (.+?)(?:\r?\n|$)/m, // < HTTP/1.1 200 OK (verbose mode)
      /< HTTP\/[\d.]+ (\d{3})(?:\r?\n|$)/m        // < HTTP/1.1 200
    ];
    
    for (const pattern of httpStatusPatterns) {
      const match = output.match(pattern);
      if (match) {
        statusCode = parseInt(match[1], 10);
        statusText = match[2] ? match[2].trim() : getStatusText(statusCode);
        break;
      }
    }
  }
  
  // If still no status code, try to extract from first line
  if (statusCode === 0) {
    const firstLine = output.split(/\r?\n/)[0];
    const statusMatch = firstLine.match(/(\d{3})/);
    if (statusMatch) {
      statusCode = parseInt(statusMatch[1], 10);
      statusText = getStatusText(statusCode);
    }
  }
  
  // Split response into headers and body
  // Look for double newline (can be \r\n\r\n or \n\n)
  let headerBodySplit = output.indexOf('\r\n\r\n');
  let headerSection: string;
  
  if (headerBodySplit >= 0) {
    headerSection = output.substring(0, headerBodySplit);
    bodySection = output.substring(headerBodySplit + 4);
  } else {
    // Try with \n\n
    headerBodySplit = output.indexOf('\n\n');
    if (headerBodySplit >= 0) {
      headerSection = output.substring(0, headerBodySplit);
      bodySection = output.substring(headerBodySplit + 2);
    } else {
      // No clear separation, try to find where headers end
      // Headers end when we find a line that doesn't contain ':'
      const lines = output.split(/\r?\n/);
      let headerEndIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Skip HTTP status line
        if (line.startsWith('HTTP/')) {
          continue;
        }
        // If line doesn't contain ':' and is not empty, it might be body start
        if (line && !line.includes(':')) {
          headerEndIndex = i;
          break;
        }
        headerEndIndex = i + 1;
      }
      headerSection = lines.slice(0, headerEndIndex).join('\n');
      bodySection = lines.slice(headerEndIndex).join('\n');
    }
  }
  
  // Parse headers from header section
  const headerLines = headerSection.split(/\r?\n/);
  for (const line of headerLines) {
    const trimmedLine = line.trim();
    // Skip HTTP status line (already parsed, don't include in headers)
    if (trimmedLine.startsWith('HTTP/')) {
      continue;
    }
    // Parse header line (Key: Value)
    if (trimmedLine.includes(':')) {
      const colonIndex = trimmedLine.indexOf(':');
      const key = trimmedLine.substring(0, colonIndex).trim();
      const value = trimmedLine.substring(colonIndex + 1).trim();
      if (key) {
        headers[key] = value;
      }
    }
  }
  
  // Clean up body - remove any remaining HTTPSTATUS markers
  bodySection = bodySection.replace(/HTTPSTATUS:\d{3}\s*/g, '').trim();
  
  return {
    statusCode,
    statusText,
    headers,
    body: bodySection
  };
}

/**
 * Formats the response body to make it more readable
 * @param body The raw body string
 * @param contentType The Content-Type header value (optional)
 * @returns Formatted body string
 */
function formatResponseBody(body: string, contentType?: string): string {
  if (!body || !body.trim()) {
    return body;
  }

  const trimmedBody = body.trim();

  // Try to format JSON
  if (contentType?.includes('application/json') || 
      (trimmedBody.startsWith('{') && trimmedBody.endsWith('}')) ||
      (trimmedBody.startsWith('[') && trimmedBody.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmedBody);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // Not valid JSON, continue
    }
  }

  // Try to format XML if content type indicates XML
  if (contentType?.includes('xml') || 
      (trimmedBody.startsWith('<?xml') || trimmedBody.startsWith('<')) && trimmedBody.endsWith('>')) {
    // Simple XML formatting (indent with 2 spaces)
    try {
      return formatXML(trimmedBody);
    } catch {
      // If formatting fails, return original
    }
  }

  // Return original body if no formatting applied
  return body;
}

/**
 * Simple XML formatter with indentation
 * @param xml The XML string to format
 * @returns Formatted XML string
 */
function formatXML(xml: string): string {
  // Remove existing whitespace between tags
  const compressed = xml.replace(/>\s+</g, '><').trim();
  
  let formatted = '';
  let indent = 0;
  const tab = '  '; // 2 spaces
  const regex = /(>)(<)(\/*)/g;
  let lastIndex = 0;
  let match;
  
  // Add newlines and indentation
  while ((match = regex.exec(compressed)) !== null) {
    const matchIndex = match.index;
    formatted += compressed.substring(lastIndex, matchIndex + 1);
    
    if (match[2] === '<' && match[3] !== '/') {
      // Opening tag
      formatted += '\n' + tab.repeat(indent);
      indent++;
    } else if (match[2] === '<' && match[3] === '/') {
      // Closing tag
      indent--;
      formatted += '\n' + tab.repeat(indent);
    }
    
    formatted += match[2] + match[3];
    lastIndex = regex.lastIndex;
  }
  
  formatted += compressed.substring(lastIndex);
  
  return formatted;
}

/**
 * Formats HTTP response as a string
 * @param result The HTTP request result
 * @param requestPayload Optional request payload to include at the top
 * @returns Formatted response string
 */
export function formatHttpResponse(result: HttpRequestResult, requestPayload?: string): string {
  let response = '';
  
  const statusCode = result.statusCode > 0 ? result.statusCode : 0;
  const isError = statusCode === 0;
  
  // For errors, show response first, then payload at the end
  // For success, show payload first, then response
  if (!isError && requestPayload) {
    // Success: payload at top
    response += '=== REQUEST PAYLOAD ===\n';
    response += requestPayload;
    response += '\n\n';
    response += '=== RESPONSE ===\n';
  }
  
  // Always format as HTTP response, even for errors
  const statusText = result.statusText || 'Error';
  response += `HTTP/1.1 ${statusCode} ${statusText}\n`;
  
  // Add headers (if any)
  for (const [key, value] of Object.entries(result.headers)) {
    response += `${key}: ${value}\n`;
  }
  
  // Empty line before body
  response += '\n';
  
  // Format and add body
  if (result.body) {
    // For errors, body is usually plain text (curl error message)
    // For HTTP responses, try to format as JSON if applicable
    if (statusCode > 0) {
      const contentType = result.headers['Content-Type'] || result.headers['content-type'];
      const formattedBody = formatResponseBody(result.body, contentType);
      response += formattedBody;
    } else {
      // For curl errors, just output the raw error message
      response += result.body;
    }
  }
  
  // For errors, add payload at the end as DEBUG PAYLOAD
  if (isError && requestPayload) {
    response += '\n\n';
    response += '# DEBUG PAYLOAD\n';
    response += requestPayload;
  }
  
  return response;
}

/**
 * Updates the tab title to include execution time
 * @param uri The URI of the response file
 * @param executionTime The execution time in seconds (as string)
 */
function updateTabTitleWithExecutionTime(uri: vscode.Uri, executionTime: string): void {
  try {
    // Store execution time
    executionTimes.set(uri.toString(), executionTime);
    
    // Wait a bit for the tab to be fully loaded, then update the title
    setTimeout(() => {
      try {
        const tabGroups = vscode.window.tabGroups.all;
        for (const group of tabGroups) {
          for (const tab of group.tabs) {
            if (tab.input instanceof vscode.TabInputText && 
                tab.input.uri.toString() === uri.toString()) {
              // Get the base file name
              const fileName = path.basename(uri.fsPath);
              const fileNameWithoutExt = path.parse(fileName).name;
              const ext = path.extname(fileName);
              
              // Create custom label with execution time
              const customLabel = `${fileNameWithoutExt} (${executionTime}s)${ext}`;
              
              // Note: The tab.label property is read-only in the VS Code API
              // We need to use a different approach
              // The best way is to reopen the document with a custom TextEditorInput
              // But for now, we'll add the time to the document itself as a comment
              // and update the tab through the document's language service
              
              // Alternative: Use vscode.window.createTextEditorDecorationType
              // or modify the document to include the time in a comment at the top
              break;
            }
          }
        }
      } catch (error) {
        // Silently fail if tab API is not available
      }
    }, 300);
  } catch (error) {
    // Silently fail
  }
}

/**
 * Gets the execution time for a URI
 * @param uri The URI of the response file
 * @returns The execution time in seconds (as string) or undefined
 */
export function getExecutionTime(uri: vscode.Uri): string | undefined {
  return executionTimes.get(uri.toString());
}

/**
 * Converts REST Client format to curl command
 * @param config The HTTP request configuration
 * @returns The curl command string
 */
function convertRestClientToCurl(config: HttpRequestConfig): string {
  return buildCurlCommand(config);
}

/**
 * Extracts HTTP request content from a specific section of the document
 * Supports both curl commands and REST Client format
 * Respects ### separator (stops at separator)
 * @param document The document to extract from
 * @param startLine Start line of the section (0-based)
 * @param endLine End line of the section (0-based)
 * @returns The request content string (curl or REST Client format) or null if not found
 */
function extractRequestFromSection(
  document: vscode.TextDocument,
  startLine: number,
  endLine: number
): string | null {
  const lines: string[] = [];
  
  // Extract lines from the section
  for (let i = startLine; i <= endLine && i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const text = line.text.trim();
    
    // Stop at separator ### (REST Client standard)
    if (text.startsWith('###')) {
      break;
    }
    
    // Skip only markdown headers (##) but keep comments (including # @var), empty lines, and HTTP requests
    if (!text.startsWith('##')) {
      // Remove trailing backslash and whitespace for line continuation
      const cleanedLine = text.replace(/\\\s*$/, '').trim();
      // Keep the line even if it's empty or a comment (for proper parsing)
      lines.push(cleanedLine);
    }
  }
  
  if (lines.length === 0) {
    return null;
  }
  
  // Find the first line that is an HTTP method (skip comments and empty lines)
  let firstHttpLine: string | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (trimmed && !trimmed.startsWith('#')) {
      // Check if it's an HTTP method line
      if (trimmed.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/|\{\{).+$/i)) {
        firstHttpLine = trimmed;
        break;
      }
    }
  }
  
  // Check if it's REST Client format (found HTTP method line)
  if (firstHttpLine) {
    // Return REST Client format (preserve line breaks and empty lines for body separation)
    // Rebuild with original line breaks, preserving empty lines and comments (including # @var)
    const originalLines: string[] = [];
    for (let i = startLine; i <= endLine && i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const text = line.text.trim();
      
      // Stop at separator ### (REST Client standard)
      if (text.startsWith('###')) {
        break;
      }
      
      // Include all lines except markdown headers (##) but preserve empty lines and comments
      if (!text.startsWith('##')) {
        originalLines.push(line.text);
      }
    }
    return originalLines.join('\n');
  }
  
  // Check if it's a curl command
  // Join lines with spaces (backslashes already removed)
  let curlCommand = lines.join(' ').trim();
  
  if (curlCommand.toLowerCase().startsWith('curl')) {
    return curlCommand;
  }
  
  // Try to find curl in the joined text
  const curlMatch = curlCommand.match(/curl\s+.*/i);
  if (curlMatch) {
    return curlMatch[0];
  }
  
  return null;
}

/**
 * Extracts curl command from a specific section of the document
 * Supports both curl commands and REST Client format (converts to curl)
 * @param document The document to extract from
 * @param startLine Start line of the section (0-based)
 * @param endLine End line of the section (0-based)
 * @returns The curl command string or null if not found
 */
function extractCurlFromSection(
  document: vscode.TextDocument,
  startLine: number,
  endLine: number
): string | null {
  const requestContent = extractRequestFromSection(document, startLine, endLine);
  if (!requestContent) {
    return null;
  }
  
  // If it's already a curl command, return it
  if (requestContent.toLowerCase().startsWith('curl')) {
    return requestContent;
  }
  
  // If it's REST Client format, convert to curl
  if (isRestClientFormat(requestContent)) {
    const config = parseRestClientFormat(requestContent);
    if (config) {
      return convertRestClientToCurl(config);
    }
  }
  
  return null;
}

/**
 * Finds the environment decorator for a specific section
 * Only searches backwards from section header until another ## or non-comment line
 * @param document The document to search
 * @param startLine Start line of the section (0-based)
 * @returns Environment name or null if not found
 */
function findSectionEnvironment(
  document: vscode.TextDocument,
  startLine: number
): string | null {
  // Find the section header (##) at or before startLine
  let sectionHeaderLine = startLine;
  for (let i = startLine; i >= 0; i--) {
    const line = document.lineAt(i).text.trim();
    if (line.startsWith('##')) {
      sectionHeaderLine = i;
      break;
    }
  }
  
  // Search backwards from section header for # @env decorator
  // Stop when we find another section header or reach the top
  for (let i = sectionHeaderLine - 1; i >= 0; i--) {
    const line = document.lineAt(i).text.trim();
    
    // Skip empty lines
    if (!line) {
      continue;
    }
    
    // Match decorator: # @env qa  or  #@env qa
    const match = line.match(/^#\s*@env\s+(\w+)/i);
    if (match) {
      return match[1];
    }
    
    // Stop if we find another section header (no decorator for this section)
    if (line.startsWith('##')) {
      return null;
    }
    
    // Stop if we find a non-comment line (no decorator for this section)
    if (!line.startsWith('#')) {
      return null;
    }
  }
  
  return null;
}

/**
 * Finds the environment from the previous section (inheritance)
 * @param document The document to search
 * @param startLine Start line of the current section (0-based)
 * @returns Environment name or null if no previous section
 */
function findPreviousSectionEnvironment(
  document: vscode.TextDocument,
  startLine: number
): string | null {
  // Find the header of the current section
  let currentSectionLine = -1;
  for (let i = startLine; i >= 0; i--) {
    const line = document.lineAt(i).text.trim();
    if (line.startsWith('##')) {
      currentSectionLine = i;
      break;
    }
  }
  
  if (currentSectionLine === -1) {
    return null;
  }
  
  // Search for the previous section (next ## above)
  for (let i = currentSectionLine - 1; i >= 0; i--) {
    const line = document.lineAt(i).text.trim();
    if (line.startsWith('##')) {
      // Found previous section, get its environment recursively
      return getEnvironmentForSection(document, i);
    }
  }
  
  return null;
}

/**
 * Finds the global environment decorator at the top of the file
 * Searches from top until the first ## is found
 * @param document The document to search
 * @returns Environment name or null if not found
 */
function findGlobalEnvironment(
  document: vscode.TextDocument
): string | null {
  // Search from top until the first ##
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text.trim();
    
    // Stop when we find the first section header
    if (line.startsWith('##')) {
      return null;
    }
    
    // Skip empty lines and regular comments
    if (!line || (line.startsWith('#') && !line.match(/^#\s*@env/i))) {
      continue;
    }
    
    // Match global decorator
    const match = line.match(/^#\s*@env\s+(\w+)/i);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Detects the environment decorator for a section with cascading support
 * Implements 3-level cascading: section-specific > previous section > global
 * @param document The document to search
 * @param startLine Start line of the section (0-based)
 * @returns Environment name or null if not found
 */
function getEnvironmentForSection(
  document: vscode.TextDocument,
  startLine: number
): string | null {
  // 1. First, try to find section-specific decorator
  const sectionEnv = findSectionEnvironment(document, startLine);
  if (sectionEnv) {
    return sectionEnv;
  }
  
  // 2. If not found, inherit from previous section
  const previousSectionEnv = findPreviousSectionEnvironment(document, startLine);
  if (previousSectionEnv) {
    return previousSectionEnv;
  }
  
  // 3. If no previous section, use global environment
  const globalEnv = findGlobalEnvironment(document);
  return globalEnv;
}

/**
 * Interface for helper functions
 */
interface HelperFunction {
  name: string;
  description: string;
  execute: (...args: string[]) => Promise<string> | string;
}

/**
 * Registry of helper functions
 */
const helperFunctions: Map<string, HelperFunction> = new Map();

/**
 * Initialize helper functions
 */
function initializeHelpers(): void {
  // Random number helper: @randomIn(min, max)
  helperFunctions.set('randomIn', {
    name: 'randomIn',
    description: 'Generates a random integer between min and max (inclusive)',
    execute: (min: string, max: string) => {
      const minNum = parseInt(min, 10);
      const maxNum = parseInt(max, 10);
      if (isNaN(minNum) || isNaN(maxNum) || minNum > maxNum) {
        return '0';
      }
      const random = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
      return random.toString();
    }
  });

  // Datetime helper: @datetime or @datetime("format")
  helperFunctions.set('datetime', {
    name: 'datetime',
    description: 'Returns current date/time. Optional format: ISO, timestamp, or custom format',
    execute: (format?: string) => {
      const now = new Date();
      if (!format || format === 'ISO') {
        return now.toISOString();
      }
      if (format === 'timestamp') {
        return now.getTime().toString();
      }
      if (format === 'date') {
        return now.toISOString().split('T')[0];
      }
      if (format === 'time') {
        return now.toTimeString().split(' ')[0];
      }
      // Custom format (simplified)
      return now.toISOString();
    }
  });

  // UUID helper: @uuid()
  helperFunctions.set('uuid', {
    name: 'uuid',
    description: 'Generates a random UUID v4',
    execute: () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  });

  // Random string helper: @randomString(length)
  helperFunctions.set('randomString', {
    name: 'randomString',
    description: 'Generates a random alphanumeric string of specified length',
    execute: (length: string = '10') => {
      const len = parseInt(length, 10) || 10;
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < len; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    }
  });

  // User-Agent helper: @userAgent()
  helperFunctions.set('userAgent', {
    name: 'userAgent',
    description: 'Generates a random browser User-Agent string',
    execute: () => {
      const chromeVersions = ['120', '119', '118', '121', '122'];
      const safariVersions = ['17.2', '17.1', '16.6', '18.0'];
      const firefoxVersions = ['121', '120', '119'];
      const os = [
        'Windows NT 10.0; Win64; x64',
        'Macintosh; Intel Mac OS X 10_15_7',
        'X11; Linux x86_64'
      ];
      const i = Math.floor(Math.random() * 3);
      if (i === 0) {
        return `Mozilla/5.0 (${os[Math.floor(Math.random() * os.length)]}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersions[Math.floor(Math.random() * chromeVersions.length)]}.0.0.0 Safari/537.36`;
      }
      if (i === 1) {
        return `Mozilla/5.0 (${os[Math.floor(Math.random() * os.length)]}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${safariVersions[Math.floor(Math.random() * safariVersions.length)]} Safari/605.1.15`;
      }
      return `Mozilla/5.0 (${os[Math.floor(Math.random() * os.length)]}) Gecko/20100101 Firefox/${firefoxVersions[Math.floor(Math.random() * firefoxVersions.length)]}.0`;
    }
  });

  // IP helper: @ip()
  helperFunctions.set('ip', {
    name: 'ip',
    description: 'Generates a random IPv4 address',
    execute: () => {
      const octet = () => Math.floor(Math.random() * 256).toString();
      return `${octet()}.${octet()}.${octet()}.${octet()}`;
    }
  });

  // Lorem ipsum helper: @lorem(count) - count 1 to 100 words
  const LOREM_WORDS = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum'.split(' ');
  helperFunctions.set('lorem', {
    name: 'lorem',
    description: 'Generates Lorem Ipsum text with 1 to 100 words',
    execute: (count: string = '5') => {
      let n = parseInt(count, 10) || 5;
      n = Math.max(1, Math.min(100, n));
      const words: string[] = [];
      for (let i = 0; i < n; i++) {
        words.push(LOREM_WORDS[i % LOREM_WORDS.length]);
      }
      return words.join(' ');
    }
  });

  // Random from list helper: @randomFrom("item1", "item2", ...)
  helperFunctions.set('randomFrom', {
    name: 'randomFrom',
    description: 'Picks a random item from the list of arguments',
    execute: (...args: string[]) => {
      const list = args.filter(a => a !== undefined && a !== null);
      if (list.length === 0) return '';
      return list[Math.floor(Math.random() * list.length)];
    }
  });
}

// Initialize helpers on module load
initializeHelpers();

/**
 * Represents a prompt or helper expression
 */
interface PromptExpression {
  type: 'prompt' | 'helper';
  name: string;
  label?: string; // For prompts
  args?: string[]; // For helpers
  originalMatch: string;
}

/**
 * Extracts prompt and helper expressions from content
 * Supports:
 * - {{@prompt("label")}} - prompt with custom label (only way to open prompts)
 * - {{@helper(arg1, arg2)}} - helper function
 * @param content The content to search
 * @returns Array of prompt/helper expressions
 */
function extractPromptExpressions(content: string): PromptExpression[] {
  const expressions: PromptExpression[] = [];
  
  // Match: {{@prompt("label")}} or {{@helper(arg1, arg2)}}
  // Only @prompt() opens prompts, not {{@VAR_NAME}}
  const functionRegex = /\{\{\s*@(\w+)\s*\(\s*([^)]*)\s*\)\s*\}\}/g;
  let match: RegExpExecArray | null;
  
  while ((match = functionRegex.exec(content)) !== null) {
    const funcName = match[1];
    const argsStr = match[2];
    
    if (funcName === 'prompt') {
      // Extract label from arguments
      const labelMatch = argsStr.match(/["']([^"']+)["']/);
      const label = labelMatch ? labelMatch[1] : argsStr.trim();
      expressions.push({
        type: 'prompt',
        name: `prompt_${expressions.length}`, // Generate unique name
        label: label || 'Enter value',
        originalMatch: match[0]
      });
    } else if (helperFunctions.has(funcName)) {
      // Helper function
      const args = argsStr.split(',').map(arg => arg.trim().replace(/^["']|["']$/g, ''));
      expressions.push({
        type: 'helper',
        name: funcName,
        args: args,
        originalMatch: match[0]
      });
    }
  }
  
  return expressions;
}

/**
 * Extracts prompt variables (variables with @ prefix) from content
 * Format: {{@prompt("label")}} (only way to open prompts)
 * @param content The content to search
 * @returns Array of unique variable names (without @ prefix)
 * @deprecated Use extractPromptExpressions instead
 */
function extractPromptVariables(content: string): string[] {
  const expressions = extractPromptExpressions(content);
  return expressions
    .filter(expr => expr.type === 'prompt')
    .map(expr => expr.name);
}

/**
 * Prompts user for values of prompt expressions
 * @param expressions Array of prompt expressions
 * @returns Map of expression original matches to their values, or null if user cancelled
 */
async function promptForExpressions(expressions: PromptExpression[]): Promise<Map<string, string> | null> {
  const values = new Map<string, string>();
  
  // Filter only prompt expressions
  const promptExpressions = expressions.filter(expr => expr.type === 'prompt');
  
  for (const expr of promptExpressions) {
    const value = await vscode.window.showInputBox({
      prompt: expr.label || `Enter value`,
      placeHolder: expr.label || `Enter value`,
      ignoreFocusOut: true
    });
    
    // If user cancelled (undefined), return null
    if (value === undefined) {
      return null;
    }
    
    // Store value using original match as key
    values.set(expr.originalMatch, value || '');
  }
  
  return values;
}

/**
 * Executes helper functions
 * @param expressions Array of helper expressions
 * @returns Map of expression original matches to their computed values
 */
async function executeHelpers(expressions: PromptExpression[]): Promise<Map<string, string>> {
  const values = new Map<string, string>();
  
  // Filter only helper expressions
  const helperExpressions = expressions.filter(expr => expr.type === 'helper');
  
  for (const expr of helperExpressions) {
    const helper = helperFunctions.get(expr.name);
    if (helper) {
      try {
        const result = helper.execute(...(expr.args || []));
        // Handle both sync and async helpers
        const value = result instanceof Promise ? await result : result;
        values.set(expr.originalMatch, value);
      } catch (error) {
        console.error(`Error executing helper ${expr.name}:`, error);
        values.set(expr.originalMatch, '');
      }
    }
  }
  
  return values;
}

/**
 * Prompts user for values of variables with @ prefix
 * @param variables Array of variable names (without @ prefix)
 * @returns Map of variable names to their values, or null if user cancelled
 * @deprecated Use promptForExpressions instead
 */
async function promptForVariableValues(variables: string[]): Promise<Map<string, string> | null> {
  const expressions: PromptExpression[] = variables.map(varName => ({
    type: 'prompt',
    name: varName,
    label: `Enter value for ${varName}`,
    originalMatch: `{{@${varName}}}`
  }));
  return promptForExpressions(expressions);
}

/**
 * Replaces prompt and helper expressions with their values
 * @param content The content to process
 * @param values Map of original matches to their values
 * @returns Content with expressions replaced
 */
function replacePromptExpressions(content: string, values: Map<string, string>): string {
  let result = content;
  
  // Replace all expressions using their original matches as keys
  for (const [originalMatch, value] of values.entries()) {
    // Escape special regex characters in the match
    const escapedMatch = originalMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedMatch, 'g');
    result = result.replace(regex, value);
  }
  
  return result;
}

/**
 * Replaces prompt variables ({{@prompt("label")}}) with provided values
 * @param content The content to process
 * @param values Map of variable names to their values
 * @returns Content with variables replaced
 * @deprecated Use replacePromptExpressions instead
 */
function replacePromptVariables(content: string, values: Map<string, string>): string {
  let result = content;
  const promptVariableRegex = /\{\{\s*@([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  
  result = result.replace(promptVariableRegex, (match, varName) => {
    const value = values.get(varName);
    return value !== undefined ? value : match;
  });
  
  return result;
}

/**
 * Extracts file-level variables defined with # @var decorator
 * Format: # @var VAR_NAME=value or # @var VAR_NAME value
 * Supports cascading: global > section-specific
 * @param document The document to search
 * @param startLine Optional start line for section-based extraction
 * @returns Map of variable names to their values
 */
export function extractFileVariables(
  document: vscode.TextDocument,
  startLine?: number
): Map<string, string> {
  const variables = new Map<string, string>();
  
  // Determine search range
  let searchStart = 0;
  let searchEnd = document.lineCount;
  
  if (startLine !== undefined) {
    // For section-based, find the section header and search from there
    let sectionHeaderLine = startLine;
    for (let i = startLine; i >= 0; i--) {
      const line = document.lineAt(i).text.trim();
      if (line.startsWith('##')) {
        sectionHeaderLine = i;
        break;
      }
    }
    searchStart = sectionHeaderLine;
    
    // Find end of section (next ## or end of file)
    for (let i = startLine + 1; i < document.lineCount; i++) {
      const line = document.lineAt(i).text.trim();
      if (line.startsWith('##')) {
        searchEnd = i;
        break;
      }
    }
  }
  
  // First, collect global variables (before first ##)
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text.trim();
    
    // Stop at first section header for global vars
    if (line.startsWith('##')) {
      break;
    }
    
    // Match: # @var VAR_NAME=value or # @var VAR_NAME value
    const match = line.match(/^#\s*@var\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=\s*)?(.+)?$/i);
    if (match) {
      const varName = match[1];
      const value = match[2] ? match[2].trim() : '';
      // Remove quotes if present
      const cleanValue = value.replace(/^["']|["']$/g, '');
      variables.set(varName, cleanValue);
    }
  }
  
  // Then, collect section-specific variables (override global)
  if (startLine !== undefined) {
    for (let i = searchStart; i < searchEnd; i++) {
      const line = document.lineAt(i).text.trim();
      
      // Match: # @var VAR_NAME=value or # @var VAR_NAME value
      const match = line.match(/^#\s*@var\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=\s*)?(.+)?$/i);
      if (match) {
        const varName = match[1];
        const value = match[2] ? match[2].trim() : '';
        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '');
        // Section-specific variables override global ones
        variables.set(varName, cleanValue);
      }
    }
  }
  
  return variables;
}

/**
 * Replaces file variables ({{VAR_NAME}}) with values from file definitions
 * @param content The content to process
 * @param values Map of variable names to their values
 * @returns Content with variables replaced
 */
function replaceFileVariables(content: string, values: Map<string, string>): string {
  let result = content;
  const variableRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  
  result = result.replace(variableRegex, (match, varName) => {
    // Only replace if it's not a prompt/helper expression ({{@prompt()}} or {{@helper()}})
    if (match.includes('@')) {
      return match;
    }
    
    const value = values.get(varName);
    return value !== undefined ? value : match;
  });
  
  return result;
}

/**
 * Executes HTTP request from file and saves response
 * @param requestUri The URI of the request file
 * @param startLine Optional start line for section-based execution
 * @param endLine Optional end line for section-based execution
 * @param sectionTitle Optional title of the section
 * @returns Promise that resolves when the response file is created
 */
export async function executeHttpRequestFromFile(
  requestUri: vscode.Uri,
  startLine?: number,
  endLine?: number,
  sectionTitle?: string
): Promise<void> {
  try {
    // Read request file
    const document = await vscode.workspace.openTextDocument(requestUri);
    
    let content: string;
    let responsePath: string;
    
    // Get the base response path (respecting .req -> .res or .request -> .response)
    const baseResponsePath = getHttpResponsePath(requestUri.fsPath);
    const responseDir = path.dirname(baseResponsePath);
    const baseFileName = path.basename(baseResponsePath, path.extname(baseResponsePath));
    const responseExt = path.extname(baseResponsePath);
    
    // If section is specified, extract only that section
    if (startLine !== undefined && endLine !== undefined) {
      const requestContent = extractRequestFromSection(document, startLine, endLine);
      if (!requestContent) {
        vscode.window.showErrorMessage('No HTTP request found in the selected section.');
        return;
      }
      content = requestContent;
      
      // Use section title for response file name if available
      if (sectionTitle) {
        const sanitizedTitle = sectionTitle.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        responsePath = path.join(responseDir, `${baseFileName}_${sanitizedTitle}${responseExt}`);
      } else {
        responsePath = baseResponsePath;
      }
    } else {
      // Use entire file content
      content = document.getText();
      responsePath = baseResponsePath;
    }
    
    // Process prompt and helper expressions first
    const expressions = extractPromptExpressions(content);
    if (expressions.length > 0) {
      // Separate prompts and helpers
      const promptExpressions = expressions.filter(expr => expr.type === 'prompt');
      const helperExpressions = expressions.filter(expr => expr.type === 'helper');
      
      // Execute helpers first (they don't require user input)
      const helperValues = await executeHelpers(helperExpressions);
      
      // Then prompt user for prompt expressions
      const promptValues = promptExpressions.length > 0 
        ? await promptForExpressions(promptExpressions)
        : new Map<string, string>();
      
      if (promptValues === null) {
        // User cancelled the prompts
        return;
      }
      
      // Merge helper and prompt values
      const allValues = new Map([...helperValues, ...promptValues]);
      
      // Replace all expressions with their values
      content = replacePromptExpressions(content, allValues);
    }
    
    // Process file-level variables (# @var VAR_NAME=value) second
    const fileVariables = extractFileVariables(document, startLine);
    if (fileVariables.size > 0) {
      // Replace file variables with their defined values
      content = replaceFileVariables(content, fileVariables);
    }
    
    // Detect environment decorator for this section
    let envName: string | null = null;
    let envUsed = false;
    
    if (startLine !== undefined) {
      envName = getEnvironmentForSection(document, startLine);
    } else {
      // For full file execution, check from the beginning
      envName = getEnvironmentForSection(document, 0);
    }
    
    // If environment decorator is present, process variables
    if (envName) {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const envManager = EnvironmentManager.getInstance();
        
        // Validate variables
        const unresolvedVars = envManager.validateVariables(content, envName, workspacePath);
        if (unresolvedVars.length > 0) {
          const message = `Unresolved variables in environment '${envName}': ${unresolvedVars.join(', ')}`;
          vscode.window.showWarningMessage(message);
        }
        
        // Replace variables
        content = envManager.replaceVariables(content, envName, workspacePath);
        envUsed = true;
      }
    }
    
    // Parse request
    const config = parseHttpRequest(content);
    if (!config) {
      vscode.window.showErrorMessage('Failed to parse HTTP request. Please check the file format.');
      return;
    }
    
    // Get timeout and save file settings from configuration
    const timeoutConfig = vscode.workspace.getConfiguration('cursorToys');
    const timeout = timeoutConfig.get<number>('httpRequestTimeout', 10);
    const saveFile = timeoutConfig.get<boolean>('httpRequestSaveFile', true);
    
    // Show progress
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Executing HTTP Request',
      cancellable: false
    }, async (progress) => {
      progress.report({ increment: 0, message: 'Sending request...' });
      
      try {
        // Measure execution time
        const startTime = Date.now();
        
        // Prepare request payload for display
        let requestPayload: string | undefined;
        if (config.body) {
          if (typeof config.body === 'string') {
            // Try to parse and format if it's JSON
            try {
              const parsed = JSON.parse(config.body);
              requestPayload = JSON.stringify(parsed, null, 2);
            } catch {
              // Not JSON, use as-is
              requestPayload = config.body;
            }
          } else {
            // Object, stringify with formatting
            requestPayload = JSON.stringify(config.body, null, 2);
          }
        }
        
        // Execute request (now always resolves, even on error)
        const result = await executeHttpRequest(config, timeout);
        
        // Calculate execution time
        const executionTime = Date.now() - startTime;
        const executionTimeSeconds = (executionTime / 1000).toFixed(2);
        
        progress.report({ increment: 50, message: 'Processing response...' });
        
        // Format response with payload
        const responseText = formatHttpResponse(result, requestPayload);
        
        let responseUri: vscode.Uri | undefined;
        let responseDoc: vscode.TextDocument;
        
        if (saveFile) {
          // Save to file mode
          // Use the response path calculated above
          responseUri = vscode.Uri.file(responsePath);
          
          // Write response file
          const encoder = new TextEncoder();
          await vscode.workspace.fs.writeFile(responseUri, encoder.encode(responseText));
          
          progress.report({ increment: 100, message: 'Response saved' });
          
          // Store execution time before opening
          executionTimes.set(responseUri.toString(), executionTimeSeconds);
          
          // Open the saved file
          responseDoc = await vscode.workspace.openTextDocument(responseUri);
        } else {
          // Preview mode: create a temporary document without saving
          progress.report({ increment: 100, message: 'Response ready' });
          
          // Create untitled document with response content
          responseDoc = await vscode.workspace.openTextDocument({
            language: 'http-response',
            content: responseText
          });
          
          // Store execution time
          executionTimes.set(responseDoc.uri.toString(), executionTimeSeconds);
        }
        
        // Determine which column to open the response file
        // Try to find the column where the request file is open
        let targetColumn = vscode.ViewColumn.Beside;
        const requestDoc = vscode.window.visibleTextEditors.find(
          editor => editor.document.uri.toString() === requestUri.toString()
        );
        if (requestDoc) {
          // If request file is open, open response beside it
          targetColumn = vscode.ViewColumn.Beside;
        } else {
          // If request file is not open, open response in active column
          targetColumn = vscode.ViewColumn.Active;
        }
        
        if (saveFile && responseUri) {
          // Open saved file with custom URI to show execution time in title
          const fileName = path.basename(responseUri.fsPath);
          const fileNameWithoutExt = path.parse(fileName).name;
          const ext = path.extname(fileName);
          const dirName = path.dirname(responseUri.fsPath);
          
          // Create a custom URI with execution time in the path for custom tab title
          // Format: (time) filename.ext
          const customFileName = `(${executionTimeSeconds}s) ${fileNameWithoutExt}${ext}`;
          const customPath = path.join(dirName, customFileName).replace(/\\/g, '/');
          // Format: http-response:///full/path/to/filename (time).ext?originalPath=...
          const customUri = vscode.Uri.parse(
            `http-response://${customPath}?originalPath=${encodeURIComponent(responseUri.toString())}&time=${executionTimeSeconds}`
          );
          
          try {
            const customDoc = await vscode.workspace.openTextDocument(customUri);
            await vscode.window.showTextDocument(customDoc, {
              preview: false,
              viewColumn: targetColumn
            });
          } catch (error) {
            // Fallback to regular file opening if custom scheme fails
            await vscode.window.showTextDocument(responseDoc, {
              preview: false,
              viewColumn: targetColumn
            });
            // Update tab title with execution time (will try to update via tab API)
            updateTabTitleWithExecutionTime(responseUri, executionTimeSeconds);
          }
        } else {
          // Open preview document (untitled)
          await vscode.window.showTextDocument(responseDoc, {
            preview: true,
            viewColumn: targetColumn
          });
        }
        
        // Build message based on result
        let message: string;
        if (result.error || result.statusCode === 0) {
          // Error occurred (curl error, timeout, etc.)
          message = `Request failed: ${result.statusText || result.error || 'Unknown error'} (${executionTimeSeconds}s)`;
          if (envUsed && envName) {
            message += ` [${envName}]`;
          }
          vscode.window.showWarningMessage(message);
        } else if (result.statusCode >= 400) {
          // HTTP error (4xx, 5xx)
          message = `HTTP ${result.statusCode} ${result.statusText} (${executionTimeSeconds}s)`;
          if (envUsed && envName) {
            message += ` [${envName}]`;
          }
          vscode.window.showWarningMessage(message);
        } else {
          // Success
          message = `HTTP request executed successfully. Status: ${result.statusCode} (${executionTimeSeconds}s)`;
          if (envUsed && envName) {
            message += ` [${envName}]`;
          }
          if (!saveFile) {
            message += ' - Preview mode';
          }
          vscode.window.showInformationMessage(message);
        }
      } catch (error) {
        // This should rarely happen now since executeHttpRequest always resolves
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to execute HTTP request: ${errorMessage}`);
        // Still try to save error response if possible
        try {
          const errorResult: HttpRequestResult = {
            statusCode: 0,
            statusText: 'Error',
            headers: {},
            body: errorMessage,
            error: errorMessage
          };
          const responseText = formatHttpResponse(errorResult);
          const responseUri = vscode.Uri.file(responsePath);
          const encoder = new TextEncoder();
          await vscode.workspace.fs.writeFile(responseUri, encoder.encode(responseText));
        } catch (saveError) {
          // Ignore save errors
        }
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Error processing HTTP request: ${errorMessage}`);
  }
}

/**
 * Copies the curl command to clipboard with variables replaced
 * @param requestUri The URI of the request file
 * @param startLine Optional start line for section-based execution
 * @param endLine Optional end line for section-based execution
 * @returns Promise that resolves when copied
 */
export async function copyCurlCommand(
  requestUri: vscode.Uri,
  startLine?: number,
  endLine?: number
): Promise<void> {
  try {
    // Read request file
    const document = await vscode.workspace.openTextDocument(requestUri);
    
    let content: string;
    
    // If section is specified, extract only that section
    if (startLine !== undefined && endLine !== undefined) {
      const requestContent = extractRequestFromSection(document, startLine, endLine);
      if (!requestContent) {
        vscode.window.showErrorMessage('No HTTP request found in the selected section.');
        return;
      }
      content = requestContent;
    } else {
      // Use entire file content
      content = document.getText();
    }
    
    // Process prompt and helper expressions first
    const expressions = extractPromptExpressions(content);
    if (expressions.length > 0) {
      // Separate prompts and helpers
      const promptExpressions = expressions.filter(expr => expr.type === 'prompt');
      const helperExpressions = expressions.filter(expr => expr.type === 'helper');
      
      // Execute helpers first (they don't require user input)
      const helperValues = await executeHelpers(helperExpressions);
      
      // Then prompt user for prompt expressions
      const promptValues = promptExpressions.length > 0 
        ? await promptForExpressions(promptExpressions)
        : new Map<string, string>();
      
      if (promptValues === null) {
        // User cancelled the prompts
        return;
      }
      
      // Merge helper and prompt values
      const allValues = new Map([...helperValues, ...promptValues]);
      
      // Replace all expressions with their values
      content = replacePromptExpressions(content, allValues);
    }
    
    // Process file-level variables (# @var VAR_NAME=value) second
    const fileVariables = extractFileVariables(document, startLine);
    if (fileVariables.size > 0) {
      // Replace file variables with their defined values
      content = replaceFileVariables(content, fileVariables);
    }
    
    // Detect environment decorator for this section
    let envName: string | null = null;
    
    if (startLine !== undefined) {
      envName = getEnvironmentForSection(document, startLine);
    } else {
      // For full file execution, check from the beginning
      envName = getEnvironmentForSection(document, 0);
    }
    
    // If environment decorator is present, process variables
    if (envName) {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const envManager = EnvironmentManager.getInstance();
        
        // Replace variables
        content = envManager.replaceVariables(content, envName, workspacePath);
      }
    }
    
    // Convert to curl if it's REST Client format
    let curlCommand: string;
    if (isRestClientFormat(content)) {
      const config = parseRestClientFormat(content);
      if (!config) {
        vscode.window.showErrorMessage('Failed to parse REST Client format.');
        return;
      }
      curlCommand = convertRestClientToCurl(config);
    } else {
      // Already in curl format
      curlCommand = content;
    }
    
    // Copy to clipboard
    await vscode.env.clipboard.writeText(curlCommand);
    
    let message = 'cURL command copied to clipboard';
    if (envName) {
      message += ` (with ${envName} environment variables)`;
    }
    vscode.window.showInformationMessage(message);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Error copying cURL command: ${errorMessage}`);
  }
}
