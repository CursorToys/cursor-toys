import * as vscode from 'vscode';
import { isHttpRequestFile } from './utils';

interface RequestSection {
  title: string;
  titleLine: number;
  startLine: number;
  endLine: number;
  envName: string | null; // Environment name if decorator present
}

export class HttpCodeLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    // Update CodeLens when files change
    vscode.workspace.onDidChangeConfiguration(() => {
      this._onDidChangeCodeLenses.fire();
    });
    
    // Update CodeLens when documents change
    vscode.workspace.onDidChangeTextDocument(() => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  /**
   * Parses the document to find request sections (marked with ##)
   * Also detects environment decorators (# @env {name}) with cascading support
   */
  private parseRequestSections(document: vscode.TextDocument): RequestSection[] {
    const sections: RequestSection[] = [];
    const lines = document.getText().split('\n');
    
    // CASCADING SUPPORT: Find global environment at the top of the file
    let globalEnv: string | null = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Stop at the first section header
      if (line.startsWith('##')) {
        break;
      }
      const envMatch = line.match(/^#\s*@env\s+(\w+)/i);
      if (envMatch) {
        globalEnv = envMatch[1];
        break;
      }
    }
    
    let currentSection: RequestSection | null = null;
    let currentEnv: string | null = globalEnv; // Initialize with global env
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Check for environment decorator: # @env dev
      const envMatch = trimmedLine.match(/^#\s*@env\s+(\w+)/i);
      if (envMatch) {
        currentEnv = envMatch[1];
        continue;
      }
      
      // Check if line is a section header (## Title)
      const headerMatch = line.match(/^##\s+(.+)$/);
      if (headerMatch) {
        // Save previous section if exists
        if (currentSection) {
          currentSection.endLine = i - 1;
          sections.push(currentSection);
        }
        
        // Start new section WITH INHERITANCE
        currentSection = {
          title: headerMatch[1].trim(),
          titleLine: i,
          startLine: i,
          endLine: lines.length - 1, // Will be updated when next section is found
          envName: currentEnv // Inherits from previous section or global
        };
        
        // DO NOT reset currentEnv - maintain inheritance cascade
      }
    }
    
    // Add last section if exists
    if (currentSection) {
      currentSection.endLine = lines.length - 1;
      sections.push(currentSection);
    }
    
    return sections;
  }

  /**
   * Checks if a section or curl command contains variables
   */
  private hasVariables(document: vscode.TextDocument, startLine: number, endLine: number): boolean {
    for (let i = startLine; i <= endLine && i < document.lineCount; i++) {
      const line = document.lineAt(i).text;
      // Check for {{variable}} pattern
      if (line.match(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Counts assertions in a section or curl command
   */
  private countAssertions(document: vscode.TextDocument, startLine: number, endLine: number): number {
    let count = 0;
    let inCommentBlock = false;
    
    for (let i = startLine; i <= endLine && i < document.lineCount; i++) {
      const line = document.lineAt(i).text;
      
      // Check for start of comment block
      if (line.includes('/*')) {
        inCommentBlock = true;
      }
      
      // Count @assert in comment blocks
      if (inCommentBlock && line.includes('@assert')) {
        count++;
      }
      
      // Check for end of comment block
      if (line.includes('*/')) {
        inCommentBlock = false;
      }
    }
    
    return count;
  }

  /**
   * Checks if a single curl command line (and continuation) has variables
   */
  private curlHasVariables(lines: string[], startIndex: number): boolean {
    // Check current line and following lines with backslash continuation
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/)) {
        return true;
      }
      // Stop if line doesn't end with backslash (no continuation)
      if (!line.trim().endsWith('\\')) {
        break;
      }
    }
    return false;
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    this.codeLenses = [];

    const filePath = document.uri.fsPath;
    
    // Check if the file is an HTTP request file
    if (!isHttpRequestFile(filePath)) {
      return [];
    }

    const text = document.getText();
    const lines = text.split('\n');
    
    // Check if file has ANY assertions
    const totalAssertions = this.countAssertions(document, 0, lines.length - 1);
    
    // If file has assertions, add "Run Assertions" CodeLens at the top
    if (totalAssertions > 0) {
      const runAssertionsCodeLens = new vscode.CodeLens(
        new vscode.Range(0, 0, 0, 0),
        {
          title: `$(play) Run Assertions (${totalAssertions} ${totalAssertions === 1 ? 'test' : 'tests'})`,
          command: 'cursor-toys.runAssertions',
          arguments: [document.uri]
        }
      );
      this.codeLenses.push(runAssertionsCodeLens);
    }
    
    // CASCADING SUPPORT: Find global environment at the top of the file
    let globalEnv: string | null = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Stop at the first section header
      if (line.startsWith('##')) {
        break;
      }
      const envMatch = line.match(/^#\s*@env\s+(\w+)/i);
      if (envMatch) {
        globalEnv = envMatch[1];
        break;
      }
    }
    
    // Parse sections with ## headers
    const sections = this.parseRequestSections(document);
    
    // Track which lines are covered by sections
    const coveredLines = new Set<number>();
    
    // Create CodeLens for sections with ## headers
    for (const section of sections) {
      // Check if section has variables
      const hasVars = this.hasVariables(document, section.startLine, section.endLine);
      
      // Count assertions in this section
      const assertionCount = this.countAssertions(document, section.startLine, section.endLine);
      
      // Build title with environment only if has variables
      let title = `Send Request: ${section.title}`;
      if (section.envName && hasVars) {
        title += ` [${section.envName}]`;
      }
      if (assertionCount > 0) {
        title += ` [${assertionCount} ${assertionCount === 1 ? 'assertion' : 'assertions'}]`;
      }
      
      // Send Request CodeLens
      const sendCodeLens = new vscode.CodeLens(
        new vscode.Range(section.titleLine, 0, section.titleLine, 0),
        {
          title: title,
          command: 'cursor-toys.sendHttpRequest',
          arguments: [document.uri, section.startLine, section.endLine, section.title]
        }
      );
      this.codeLenses.push(sendCodeLens);
      
      // Copy cURL CodeLens
      const copyCodeLens = new vscode.CodeLens(
        new vscode.Range(section.titleLine, 0, section.titleLine, 0),
        {
          title: '$(copy) Copy as cURL',
          command: 'cursor-toys.copyCurlCommand',
          arguments: [document.uri, section.startLine, section.endLine]
        }
      );
      this.codeLenses.push(copyCodeLens);
      
      // Mark all lines in this section as covered
      for (let i = section.startLine; i <= section.endLine; i++) {
        coveredLines.add(i);
      }
    }
    
    // Now find curl commands that are NOT in any section
    let currentEnv: string | null = globalEnv; // Initialize with global env for standalone curls
    
    for (let i = 0; i < lines.length; i++) {
      // Skip lines already covered by sections
      if (coveredLines.has(i)) {
        continue;
      }
      
      const line = lines[i].trim();
      
      // Check for environment decorator
      const envMatch = line.match(/^#\s*@env\s+(\w+)/i);
      if (envMatch) {
        currentEnv = envMatch[1];
        continue;
      }
      
      // Check for curl command
      if (line.toLowerCase().startsWith('curl')) {
        // Check if this curl has variables
        const hasVars = this.curlHasVariables(lines, i);
        
        // Find end line of this curl command (follow backslash continuations)
        let endLine = i;
        for (let j = i; j < lines.length; j++) {
          const curlLine = lines[j];
          if (!curlLine.trim().endsWith('\\')) {
            endLine = j;
            break;
          }
          endLine = j;
        }
        
        // Count assertions for this curl command
        const assertionCount = this.countAssertions(document, i, endLine);
        
        // Build title with environment only if has variables
        let title = 'Send Request';
        if (currentEnv && hasVars) {
          title += ` [${currentEnv}]`;
        }
        if (assertionCount > 0) {
          title += ` [${assertionCount} ${assertionCount === 1 ? 'assertion' : 'assertions'}]`;
        }
        
        // Send Request CodeLens
        const sendCodeLens = new vscode.CodeLens(
          new vscode.Range(i, 0, i, 0),
          {
            title: title,
            command: 'cursor-toys.sendHttpRequest',
            arguments: [document.uri, i, endLine]
          }
        );
        this.codeLenses.push(sendCodeLens);
        
        // Copy cURL CodeLens
        const copyCodeLens = new vscode.CodeLens(
          new vscode.Range(i, 0, i, 0),
          {
            title: '$(copy) Copy as cURL',
            command: 'cursor-toys.copyCurlCommand',
            arguments: [document.uri, i, endLine]
          }
        );
        this.codeLenses.push(copyCodeLens);
      }
      
      // Check for REST Client format (HTTP Request File format)
      // Format: METHOD URL (e.g., GET http://... or GET {{BASE_URL}}/...)
      const restClientMatch = line.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/|\{\{).+$/i);
      if (restClientMatch) {
        // Check if there's a ### title before this request
        let requestTitle: string | null = null;
        let titleLine = i;
        
        // Look backwards for ### separator with title
        for (let k = i - 1; k >= 0; k--) {
          const prevLine = lines[k].trim();
          // Stop if we find another HTTP method line (previous request)
          if (prevLine.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/|\{\{).+$/i)) {
            break;
          }
          // Stop if we find a section header (##)
          if (prevLine.startsWith('##') && !prevLine.startsWith('###')) {
            break;
          }
          // Check for ### separator with optional title
          if (prevLine.startsWith('###')) {
            const titleMatch = prevLine.match(/^###\s+(.+)$/);
            if (titleMatch && titleMatch[1].trim()) {
              requestTitle = titleMatch[1].trim();
              titleLine = k; // Use the ### line for CodeLens position
            }
            // Always break when we find ### (with or without title)
            break;
          }
        }
        
        // Check if this request has variables
        const hasVars = this.hasVariables(document, i, lines.length - 1);
        
        // Find end line of this REST Client request
        // Look for next ### separator (REST Client standard), next ## header, or end of file
        let endLine = i;
        for (let j = i + 1; j < lines.length; j++) {
          const requestLine = lines[j].trim();
          // Stop at separator ### (REST Client standard - three hashes)
          if (requestLine.startsWith('###')) {
            endLine = j - 1;
            break;
          }
          // Stop at next section header
          if (requestLine.startsWith('##')) {
            endLine = j - 1;
            break;
          }
          // Stop at next HTTP method line (new request)
          if (requestLine.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/|\{\{).+$/i)) {
            endLine = j - 1;
            break;
          }
          endLine = j;
        }
        
        // Count assertions for this REST Client request
        const assertionCount = this.countAssertions(document, i, endLine);
        
        // Build title with request name if available, environment if has variables
        let title = requestTitle ? `Send Request: ${requestTitle}` : 'Send Request';
        if (currentEnv && hasVars) {
          title += ` [${currentEnv}]`;
        }
        if (assertionCount > 0) {
          title += ` [${assertionCount} ${assertionCount === 1 ? 'assertion' : 'assertions'}]`;
        }
        
        // Send Request CodeLens (position on title line if available, otherwise on request line)
        const sendCodeLens = new vscode.CodeLens(
          new vscode.Range(titleLine, 0, titleLine, 0),
          {
            title: title,
            command: 'cursor-toys.sendHttpRequest',
            arguments: [document.uri, i, endLine, requestTitle || undefined]
          }
        );
        this.codeLenses.push(sendCodeLens);
        
        // Copy cURL CodeLens (position on title line if available, otherwise on request line)
        const copyCodeLens = new vscode.CodeLens(
          new vscode.Range(titleLine, 0, titleLine, 0),
          {
            title: '$(copy) Copy as cURL',
            command: 'cursor-toys.copyCurlCommand',
            arguments: [document.uri, i, endLine]
          }
        );
        this.codeLenses.push(copyCodeLens);
      }
    }
    
    // If no CodeLens created at all, create a generic fallback
    if (this.codeLenses.length === 0) {
      const codeLens = new vscode.CodeLens(
        new vscode.Range(0, 0, 0, 0),
        {
          title: 'Send Request',
          command: 'cursor-toys.sendHttpRequest',
          arguments: [document.uri]
        }
      );
      this.codeLenses.push(codeLens);
    }

    // Note: Share CodeLens removed - use context menu instead
    return this.codeLenses;
  }

  public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.CodeLens {
    return codeLens;
  }
}

