import type { GenerationRun, NewGenerationRun } from '../../domain/generation-run.ts';
import type { GridDelta, Placement } from '../../domain/grid.ts';
import type { TimetableSnapshot } from '../../../timetable/domain/index.ts';
import type { CatalogSnapshot, Planning, PlanningRevision } from '../../domain/planning.ts';

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
  /**
   * `import` registra a grade trazida de outra revisão; `generation`, a aplicação de uma
   * proposta automática. Só `operation` e `generation` podem ser desfeitas.
   */
  kind: 'operation' | 'undo' | 'import' | 'generation';
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

/** Execuções da geração automática de um planejamento (ADR 0014). */
export interface GenerationRunRepository {
  /** Grava a solicitação e a entrada do motor; recusa uma segunda execução ativa. */
  add(run: NewGenerationRun, input: TimetableSnapshot): Promise<void>;
  find(id: string): Promise<GenerationRun | null>;
  /** Execuções da revisão, da mais recente para a mais antiga. */
  list(revisionId: string, limit: number): Promise<GenerationRun[]>;
  active(planningId: string): Promise<GenerationRun | null>;
  /** Na fila, cancela na hora; em execução, pede o cancelamento ao worker. */
  cancel(id: string, at: Date): Promise<void>;
  /** Marca a proposta como aplicada uma única vez; devolve `false` se já estava. */
  markApplied(id: string, actorId: string, at: Date): Promise<boolean>;
}
