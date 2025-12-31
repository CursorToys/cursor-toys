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
 * Parses the content of an HTTP request file
 * Supports both structured JSON format and raw curl commands
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
      // Not valid JSON, continue to curl parsing
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
          reject(new Error(`Request timeout after ${timeout} seconds`));
          return;
        }
        
        // Check if curl is not found
        if (error.message.includes('curl: command not found') || 
            error.message.includes('curl: not found')) {
          reject(new Error('curl command not found. Please install curl to use this feature.'));
          return;
        }
        
        reject(error);
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
 * @returns Formatted response string
 */
export function formatHttpResponse(result: HttpRequestResult): string {
  let response = `HTTP/1.1 ${result.statusCode} ${result.statusText}\n`;
  
  // Add headers
  for (const [key, value] of Object.entries(result.headers)) {
    response += `${key}: ${value}\n`;
  }
  
  // Empty line before body
  response += '\n';
  
  // Format and add body
  const contentType = result.headers['Content-Type'] || result.headers['content-type'];
  const formattedBody = formatResponseBody(result.body, contentType);
  response += formattedBody;
  
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
 * Extracts curl command from a specific section of the document
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
  const lines: string[] = [];
  
  // Extract lines from the section
  for (let i = startLine; i <= endLine && i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const text = line.text.trim();
    
    // Skip empty lines and markdown headers
    if (text && !text.startsWith('##')) {
      // Remove trailing backslash and whitespace for line continuation
      const cleanedLine = text.replace(/\\\s*$/, '').trim();
      if (cleanedLine) {
        lines.push(cleanedLine);
      }
    }
  }
  
  // Join lines with spaces (backslashes already removed)
  let curlCommand = lines.join(' ').trim();
  
  // Check if it's a curl command
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
 * Detects the environment decorator for a section
 * Searches backwards from startLine to find # @env {name}
 * @param document The document to search
 * @param startLine Start line of the section (0-based)
 * @returns Environment name or null if not found
 */
function getEnvironmentForSection(
  document: vscode.TextDocument,
  startLine: number
): string | null {
  // First, find the section header (##) at or before startLine
  let sectionHeaderLine = startLine;
  for (let i = startLine; i >= 0; i--) {
    const line = document.lineAt(i).text.trim();
    if (line.startsWith('##')) {
      sectionHeaderLine = i;
      break;
    }
  }
  
  // Now search backwards from section header for # @env decorator
  // Stop when we find another section header or reach the top
  for (let i = sectionHeaderLine - 1; i >= 0; i--) {
    const line = document.lineAt(i).text.trim();
    
    // Skip empty lines and regular comments
    if (!line || (line.startsWith('#') && !line.match(/^#\s*@env/i))) {
      continue;
    }
    
    // Match: # @env qa  or  #@env qa
    const match = line.match(/^#\s*@env\s+(\w+)/i);
    if (match) {
      return match[1];
    }
    
    // Stop if we find another section header
    if (line.startsWith('##')) {
      break;
    }
    
    // Stop if we find a non-comment, non-empty line (like a curl command)
    if (!line.startsWith('#')) {
      break;
    }
  }
  
  return null;
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
      const curlCommand = extractCurlFromSection(document, startLine, endLine);
      if (!curlCommand) {
        vscode.window.showErrorMessage('No curl command found in the selected section.');
        return;
      }
      content = curlCommand;
      
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
        
        // Execute request
        const result = await executeHttpRequest(config, timeout);
        
        // Calculate execution time
        const executionTime = Date.now() - startTime;
        const executionTimeSeconds = (executionTime / 1000).toFixed(2);
        
        progress.report({ increment: 50, message: 'Processing response...' });
        
        // Format response
        const responseText = formatHttpResponse(result);
        
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
        
        // Build success message
        let message = `HTTP request executed successfully. Status: ${result.statusCode} (${executionTimeSeconds}s)`;
        if (envUsed && envName) {
          message += ` [${envName}]`;
        }
        if (!saveFile) {
          message += ' - Preview mode';
        }
        
        vscode.window.showInformationMessage(message);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to execute HTTP request: ${errorMessage}`);
        throw error;
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
      const curlCommand = extractCurlFromSection(document, startLine, endLine);
      if (!curlCommand) {
        vscode.window.showErrorMessage('No curl command found in the selected section.');
        return;
      }
      content = curlCommand;
    } else {
      // Use entire file content
      content = document.getText();
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
    
    // Copy to clipboard
    await vscode.env.clipboard.writeText(content);
    
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
