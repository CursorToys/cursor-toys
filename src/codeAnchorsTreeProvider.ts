import * as vscode from 'vscode';
import * as path from 'path';
import { CodeAnchorsManager } from './codeAnchorsManager';

/**
 * Tree item representing a file with anchors
 */
class AnchorFileItem extends vscode.TreeItem {
    constructor(
        public readonly uri: vscode.Uri,
        public readonly anchorCount: number
    ) {
        super(path.basename(uri.fsPath), vscode.TreeItemCollapsibleState.Expanded);
        
        this.tooltip = uri.fsPath;
        this.description = `${anchorCount} anchor${anchorCount !== 1 ? 's' : ''}`;
        this.iconPath = vscode.ThemeIcon.File;
        this.contextValue = 'anchorFile';
    }
}

/**
 * Tree item representing a single anchor line
 */
class AnchorLineItem extends vscode.TreeItem {
    constructor(
        public readonly uri: vscode.Uri,
        public readonly line: number,
        public readonly preview: string
    ) {
        super(`Line ${line + 1}`, vscode.TreeItemCollapsibleState.None);
        
        this.tooltip = preview;
        this.description = preview;
        this.iconPath = new vscode.ThemeIcon('bookmark');
        this.contextValue = 'anchorLine';
        
        // Command to navigate to anchor
        this.command = {
            command: 'cursor-toys.goToAnchor',
            title: 'Go to Anchor',
            arguments: [uri, line]
        };
    }
}

/**
 * TreeDataProvider for the Anchors sidebar view.
 * Displays anchors grouped by file.
 */
export class CodeAnchorsTreeProvider implements vscode.TreeDataProvider<AnchorFileItem | AnchorLineItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<AnchorFileItem | AnchorLineItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    private manager: CodeAnchorsManager;
    private disposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.manager = CodeAnchorsManager.getInstance(context);
        
        // Listen to anchor changes
        this.disposables.push(
            this.manager.onDidChangeAnchors(() => {
                this.refresh();
            })
        );
    }

    /**
     * Refresh the tree view
     */
    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: AnchorFileItem | AnchorLineItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: AnchorFileItem | AnchorLineItem): Thenable<(AnchorFileItem | AnchorLineItem)[]> {
        if (!element) {
            // Root level: show files with anchors
            return this.getFileItems();
        }
        
        if (element instanceof AnchorFileItem) {
            // File level: show anchor lines
            return this.getLineItems(element.uri);
        }
        
        return Promise.resolve([]);
    }

    /**
     * Get file items (files with anchors)
     */
    private async getFileItems(): Promise<AnchorFileItem[]> {
        const allAnchors = this.manager.getAllAnchors();
        const items: AnchorFileItem[] = [];
        
        for (const [uriString, lines] of allAnchors.entries()) {
            if (lines.length > 0) {
                const uri = vscode.Uri.parse(uriString);
                items.push(new AnchorFileItem(uri, lines.length));
            }
        }
        
        // Sort by filename
        items.sort((a, b) => {
            const nameA = path.basename(a.uri.fsPath);
            const nameB = path.basename(b.uri.fsPath);
            return nameA.localeCompare(nameB);
        });
        
        return items;
    }

    /**
     * Get line items (anchors in a file)
     */
    private async getLineItems(uri: vscode.Uri): Promise<AnchorLineItem[]> {
        const lines = this.manager.getAnchors(uri);
        const items: AnchorLineItem[] = [];
        
        // Try to read the document to get line previews
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            
            for (const line of lines) {
                if (line < document.lineCount) {
                    const textLine = document.lineAt(line);
                    const preview = textLine.text.trim().substring(0, 50);
                    items.push(new AnchorLineItem(uri, line, preview || '(empty line)'));
                } else {
                    items.push(new AnchorLineItem(uri, line, '(line out of range)'));
                }
            }
        } catch {
            // If we can't open the document, just show line numbers
            for (const line of lines) {
                items.push(new AnchorLineItem(uri, line, '(unable to read)'));
            }
        }
        
        return items;
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
}
