import * as vscode from 'vscode';

export interface AnchorLocation {
    uri: vscode.Uri;
    line: number;
}

/**
 * Manages code anchors (bookmarks) for the workspace.
 * Anchors are persisted per workspace using workspaceState.
 */
export class CodeAnchorsManager {
    private static instance: CodeAnchorsManager;
    private anchors: Map<string, Set<number>> = new Map();
    private _onDidChangeAnchors = new vscode.EventEmitter<void>();
    readonly onDidChangeAnchors = this._onDidChangeAnchors.event;
    private context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadFromState();
    }

    public static getInstance(context?: vscode.ExtensionContext): CodeAnchorsManager {
        if (!CodeAnchorsManager.instance) {
            if (!context) {
                throw new Error('CodeAnchorsManager requires context on first initialization');
            }
            CodeAnchorsManager.instance = new CodeAnchorsManager(context);
        }
        return CodeAnchorsManager.instance;
    }

    /**
     * Toggle anchor on a specific line
     */
    public toggleAnchor(uri: vscode.Uri, line: number): boolean {
        const key = uri.toString();
        
        if (!this.anchors.has(key)) {
            this.anchors.set(key, new Set());
        }

        const lineSet = this.anchors.get(key)!;
        
        if (lineSet.has(line)) {
            lineSet.delete(line);
            if (lineSet.size === 0) {
                this.anchors.delete(key);
            }
            this.saveToState();
            this._onDidChangeAnchors.fire();
            return false; // anchor removed
        } else {
            lineSet.add(line);
            this.saveToState();
            this._onDidChangeAnchors.fire();
            return true; // anchor added
        }
    }

    /**
     * Get all anchors for a specific file
     */
    public getAnchors(uri: vscode.Uri): number[] {
        const key = uri.toString();
        const lineSet = this.anchors.get(key);
        return lineSet ? Array.from(lineSet).sort((a, b) => a - b) : [];
    }

    /**
     * Get all anchors grouped by file
     */
    public getAllAnchors(): Map<string, number[]> {
        const result = new Map<string, number[]>();
        for (const [key, lineSet] of this.anchors.entries()) {
            result.set(key, Array.from(lineSet).sort((a, b) => a - b));
        }
        return result;
    }

    /**
     * Get a flat, sorted list of all anchor locations in the workspace.
     */
    public getAllAnchorLocations(): AnchorLocation[] {
        const locations: AnchorLocation[] = [];

        for (const [uriString, lines] of this.getAllAnchors()) {
            const uri = vscode.Uri.parse(uriString);
            for (const line of lines) {
                locations.push({ uri, line });
            }
        }

        locations.sort((a, b) => this.compareLocations(a, b));
        return locations;
    }

    /**
     * Check if a line has an anchor
     */
    public hasAnchor(uri: vscode.Uri, line: number): boolean {
        const key = uri.toString();
        const lineSet = this.anchors.get(key);
        return lineSet ? lineSet.has(line) : false;
    }

    /**
     * Get next anchor in current file
     */
    public getNextAnchor(uri: vscode.Uri, currentLine: number): number | undefined {
        const anchors = this.getAnchors(uri);
        if (anchors.length === 0) {
            return undefined;
        }

        const next = anchors.find(line => line > currentLine);
        return next !== undefined ? next : anchors[0];
    }

    /**
     * Get previous anchor in current file
     */
    public getPrevAnchor(uri: vscode.Uri, currentLine: number): number | undefined {
        const anchors = this.getAnchors(uri);
        if (anchors.length === 0) {
            return undefined;
        }

        const prev = [...anchors].reverse().find(line => line < currentLine);
        return prev !== undefined ? prev : anchors[anchors.length - 1];
    }

    /**
     * Get next anchor across the entire workspace (sorted by file path, then line).
     */
    public getNextAnchorInWorkspace(currentUri: vscode.Uri, currentLine: number): AnchorLocation | undefined {
        const locations = this.getAllAnchorLocations();
        if (locations.length === 0) {
            return undefined;
        }

        const current: AnchorLocation = { uri: currentUri, line: currentLine };
        const next = locations.find(location => this.compareLocations(location, current) > 0);
        return next ?? locations[0];
    }

    /**
     * Get previous anchor across the entire workspace (sorted by file path, then line).
     */
    public getPrevAnchorInWorkspace(currentUri: vscode.Uri, currentLine: number): AnchorLocation | undefined {
        const locations = this.getAllAnchorLocations();
        if (locations.length === 0) {
            return undefined;
        }

        const current: AnchorLocation = { uri: currentUri, line: currentLine };
        for (let i = locations.length - 1; i >= 0; i--) {
            if (this.compareLocations(locations[i], current) < 0) {
                return locations[i];
            }
        }

        return locations[locations.length - 1];
    }

    /**
     * Returns the 1-based index of the closest anchor at or after the current position in workspace order.
     */
    public getWorkspaceAnchorIndex(currentUri: vscode.Uri, currentLine: number): number {
        const locations = this.getAllAnchorLocations();
        if (locations.length === 0) {
            return 0;
        }

        const current: AnchorLocation = { uri: currentUri, line: currentLine };

        for (let i = 0; i < locations.length; i++) {
            if (this.compareLocations(locations[i], current) >= 0) {
                return i + 1;
            }
        }

        return locations.length;
    }

    /**
     * Opens a document and moves the cursor to the anchored line.
     */
    public async goToAnchor(uri: vscode.Uri, line: number): Promise<void> {
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);
        const position = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }

    /**
     * Clear all anchors
     */
    public clearAnchors(): void {
        this.anchors.clear();
        this.saveToState();
        this._onDidChangeAnchors.fire();
    }

    /**
     * Clear anchors for a specific file
     */
    public clearFileAnchors(uri: vscode.Uri): void {
        const key = uri.toString();
        this.anchors.delete(key);
        this.saveToState();
        this._onDidChangeAnchors.fire();
    }

    /**
     * Load anchors from workspace state
     */
    private loadFromState(): void {
        const stored = this.context.workspaceState.get<{ [key: string]: number[] }>('cursor-toys.codeAnchors', {});
        
        this.anchors.clear();
        for (const [key, lines] of Object.entries(stored)) {
            this.anchors.set(key, new Set(lines));
        }
    }

    /**
     * Save anchors to workspace state
     */
    private saveToState(): void {
        const toStore: { [key: string]: number[] } = {};
        
        for (const [key, lineSet] of this.anchors.entries()) {
            toStore[key] = Array.from(lineSet);
        }
        
        this.context.workspaceState.update('cursor-toys.codeAnchors', toStore);
    }

    private compareLocations(a: AnchorLocation, b: AnchorLocation): number {
        const pathCompare = a.uri.fsPath.localeCompare(b.uri.fsPath);
        if (pathCompare !== 0) {
            return pathCompare;
        }
        return a.line - b.line;
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this._onDidChangeAnchors.dispose();
    }
}
