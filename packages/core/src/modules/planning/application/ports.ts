import type { GridDelta, Placement } from '../domain/grid.ts';
import type { CatalogSnapshot, Planning, PlanningRevision } from '../domain/planning.ts';

export interface PlanningRepository {
  list(): Promise<Planning[]>;
  find(id: string): Promise<Planning | null>;
  revisions(planningId: string): Promise<PlanningRevision[]>;
  add(planning: Planning, revision: PlanningRevision): Promise<void>;
  save(planning: Planning, revision?: PlanningRevision): Promise<void>;
  capture(): Promise<CatalogSnapshot>;
}
export interface GridChange {
  id: string;
  revisionId: string;
  sequence: number;
  actorId: string;
  occurredAt: Date;
  /** `import` registra a grade trazida de outra revisão; só `operation` pode ser desfeita. */
  kind: 'operation' | 'undo' | 'import';
  summary: string;
  delta: GridDelta;
  revertsId: string | null;
}
export interface GridHistoryEntry extends GridChange {
  actorUsername: string;
}
/** Porta da grade de cada revisão; o histórico é somente de acréscimo. */
export interface GridRepository {
  placements(revisionId: string): Promise<Placement[]>;
  history(revisionId: string): Promise<GridHistoryEntry[]>;
  apply(revisionId: string, delta: GridDelta): Promise<void>;
  record(change: GridChange): Promise<void>;
}
