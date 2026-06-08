import { KanbanStatus, KanbanTag } from './kanbanCardCore';

export type KanbanBoardScope = 'personal' | 'workspace';

export interface KanbanBoardCardView {
  filePath: string;
  fileName: string;
  title: string;
  status: KanbanStatus;
  order?: number;
  descriptionPreview: string;
  description: string;
  tags: KanbanTag[];
  /** True when title, description, or tags exceed compact card layout. */
  canExpand: boolean;
  modifiedAt?: number;
}

export interface KanbanBoardState {
  kanbanPath: string;
  scope: KanbanBoardScope;
  availableScopes: KanbanBoardScope[];
  columns: Record<KanbanStatus, KanbanBoardCardView[]>;
  /** Total cards per column before board display limits are applied. */
  columnTotals?: Partial<Record<KanbanStatus, number>>;
}

export type KanbanBoardInboundMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'createCard'; title: string; description?: string }
  | { type: 'moveCard'; filePath: string; status: KanbanStatus }
  | {
      type: 'updateCard';
      filePath: string;
      title: string;
      description: string;
      tags: KanbanTag[];
    }
  | { type: 'deleteCard'; filePath: string }
  | { type: 'openCard'; filePath: string }
  | { type: 'copyCardContent'; filePath: string }
  | { type: 'sendCardToChat'; filePath: string }
  | { type: 'moveCardMenu'; filePath: string; status: KanbanStatus }
  | { type: 'switchScope'; scope: KanbanBoardScope };

export type KanbanBoardOutboundMessage =
  | { type: 'init'; state: KanbanBoardState }
  | { type: 'error'; message: string };
