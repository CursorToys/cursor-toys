import * as vscode from 'vscode';

export const TREE_ITEM_TYPE_LOADING = 'cursorToysTreeLoading';

/** Placeholder node shown while async tree children are loading. */
export interface TreeLoadingPlaceholder {
  type: typeof TREE_ITEM_TYPE_LOADING;
  cacheKey: string;
  label?: string;
}

export function isTreeLoadingPlaceholder(item: unknown): item is TreeLoadingPlaceholder {
  return (
    typeof item === 'object' &&
    item !== null &&
    (item as TreeLoadingPlaceholder).type === TREE_ITEM_TYPE_LOADING
  );
}

export function createTreeLoadingPlaceholder(
  cacheKey: string,
  label = 'Loading…'
): TreeLoadingPlaceholder {
  return { type: TREE_ITEM_TYPE_LOADING, cacheKey, label };
}

export function renderLoadingTreeItem(placeholder: TreeLoadingPlaceholder): vscode.TreeItem {
  const item = new vscode.TreeItem(placeholder.label ?? 'Loading…', vscode.TreeItemCollapsibleState.None);
  item.iconPath = new vscode.ThemeIcon('loading~spin');
  item.description = 'Please wait';
  item.contextValue = 'cursorToysTreeLoading';
  return item;
}

/**
 * Caches async tree children and shows a loading placeholder on first expand.
 */
export class TreeLoadCoordinator<TParent, TChild> {
  private readonly cache = new Map<string, TChild[]>();
  private readonly loading = new Set<string>();

  constructor(
    private readonly onLoaded: (parent: TParent | undefined) => void,
    private readonly keyFn: (parent: TParent | undefined) => string
  ) {}

  clear(): void {
    this.cache.clear();
    this.loading.clear();
  }

  invalidateKey(key: string): void {
    this.cache.delete(key);
  }

  invalidateParent(parent: TParent | undefined): void {
    this.invalidateKey(this.keyFn(parent));
  }

  async resolveChildren(
    parent: TParent | undefined,
    loader: () => Promise<TChild[]>
  ): Promise<Array<TChild | TreeLoadingPlaceholder>> {
    const key = this.keyFn(parent);
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    if (this.loading.has(key)) {
      return [createTreeLoadingPlaceholder(key)];
    }

    this.loading.add(key);
    void loader()
      .then((children) => {
        this.cache.set(key, children);
      })
      .catch((error) => {
        console.error(`Tree load failed (${key}):`, error);
        this.cache.set(key, []);
      })
      .finally(() => {
        this.loading.delete(key);
        this.onLoaded(parent);
      });

    return [createTreeLoadingPlaceholder(key)];
  }
}
