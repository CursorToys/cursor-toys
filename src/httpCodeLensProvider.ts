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
   * Also detects environment decorators (# @env {name})
   */
  private parseRequestSections(document: vscode.TextDocument): RequestSection[] {
    const sections: RequestSection[] = [];
    const lines = document.getText().split('\n');
    
    let currentSection: RequestSection | null = null;
    let currentEnv: string | null = null;
    
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
        
        // Start new section
        currentSection = {
          title: headerMatch[1].trim(),
          titleLine: i,
          startLine: i,
          endLine: lines.length - 1, // Will be updated when next section is found
          envName: currentEnv // Capture the current environment
        };
        
        // Reset environment for next section (each section needs its own decorator)
        currentEnv = null;
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
    
    // Parse sections with ## headers
    const sections = this.parseRequestSections(document);
    
    // Track which lines are covered by sections
    const coveredLines = new Set<number>();
    
    // Create CodeLens for sections with ## headers
    for (const section of sections) {
      // Check if section has variables
      const hasVars = this.hasVariables(document, section.startLine, section.endLine);
      
      // Build title with environment only if has variables
      let title = `Send Request: ${section.title}`;
      if (section.envName && hasVars) {
        title += ` [${section.envName}]`;
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
    let currentEnv: string | null = null;
    
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
        
        // Build title with environment only if has variables
        let title = 'Send Request';
        if (currentEnv && hasVars) {
          title += ` [${currentEnv}]`;
        }
        
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

