import type {
  TimetableIssue,
  TimetableProposal,
  TimetableSnapshot,
  PreferenceCriterion,
} from '../../timetable/domain/index.ts';
import type { PreferenceMetrics } from '../../timetable/domain/index.ts';
import { slotKey, type GridDelta, type Placement } from './grid.ts';

/** Estados finais, os mesmos da prova do motor (ADR 0010). */
export const GENERATION_OUTCOMES = [
  'feasible',
  'infeasible',
  'inconclusive',
  'cancelled',
  'invalid_model',
  'failed',
] as const;
export type GenerationOutcomeStatus = (typeof GENERATION_OUTCOMES)[number];
export type GenerationRunStatus = 'queued' | 'running' | GenerationOutcomeStatus;

export function isRunActive(status: GenerationRunStatus): boolean {
  return status === 'queued' || status === 'running';
}

/** Limites e semente gravados na solicitação, para a execução ser reproduzível. */
export interface GenerationRunOptions {
  readonly timeLimitMs: number;
  readonly nodeLimit: number;
  readonly seed: number;
  readonly memoryLimitMb: number;
  /** Critérios em ordem de prioridade; vazio nas execuções anteriores às preferências. */
  readonly preferences: readonly PreferenceCriterion[];
}
export interface GenerationMetrics {
  readonly elapsedMs: number;
  readonly visitedNodes: number;
  readonly backtracks: number;
  readonly restarts: number;
  /** Métricas da proposta medidas pelo validador; `null` sem proposta. */
  readonly preferences: PreferenceMetrics | null;
}
/** Resultado de uma execução terminada; a grade proposta existe somente em `feasible`. */
export interface GenerationOutcome {
  readonly status: GenerationOutcomeStatus;
  readonly reason: string;
  readonly placements: readonly Placement[] | null;
  readonly diagnostics: readonly TimetableIssue[];
  readonly warnings: readonly TimetableIssue[];
  readonly metrics: GenerationMetrics;
}
export interface GenerationRun {
  readonly id: string;
  readonly planningId: string;
  readonly revisionId: string;
  readonly requestedBy: string;
  readonly requestedByUsername: string;
  readonly requestedAt: Date;
  readonly status: GenerationRunStatus;
  readonly options: GenerationRunOptions;
  /** Resumo da entrada: grade fixada, regras e fotografia da revisão. */
  readonly inputDigest: string;
  readonly attempts: number;
  readonly cancelRequestedAt: Date | null;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly outcome: GenerationOutcome | null;
  readonly appliedAt: Date | null;
  readonly appliedByUsername: string | null;
}
export type NewGenerationRun = Omit<
  GenerationRun,
  'requestedByUsername' | 'appliedByUsername' | 'outcome' | 'startedAt' | 'finishedAt'
>;

const NO_METRICS: GenerationMetrics = {
  elapsedMs: 0,
  visitedNodes: 0,
  backtracks: 0,
  restarts: 0,
  preferences: null,
};

/** Resultado registrado quando a execução termina sem passar pelo motor. */
export function stoppedOutcome(
  status: GenerationOutcomeStatus,
  reason: string,
  message: string,
): GenerationOutcome {
  return {
    status,
    reason,
    placements: null,
    diagnostics: [{ code: 'generation.' + reason, message, entityIds: [] }],
    warnings: [],
    metrics: NO_METRICS,
  };
}

/** JSON com chaves ordenadas: o mesmo valor gera sempre o mesmo texto, inclusive após o banco. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (typeof value === 'object' && value !== null)
    return (
      '{' +
      Object.keys(value)
        .toSorted()
        .flatMap((key) => {
          const item = (value as Record<string, unknown>)[key];
          return item === undefined ? [] : [JSON.stringify(key) + ':' + canonicalJson(item)];
        })
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}

/** Converte a proposta do motor em alocações; as fixações da entrada continuam fixadas. */
export function proposalPlacements(
  snapshot: TimetableSnapshot,
  proposal: TimetableProposal,
): Placement[] {
  const slot = (
    kind: Placement['kind'],
    entityId: string,
    p: { weekday: Placement['weekday']; periodId: string },
  ) => ({ kind, entityId, weekday: p.weekday, periodId: p.periodId });
  const fixed = new Set([
    ...snapshot.fixedLessons.map((p) => slotKey(slot('lesson', p.assignmentId, p))),
    ...snapshot.fixedPlanning.map((p) => slotKey(slot('planning', p.teacherId, p))),
  ]);
  const placement = (
    kind: Placement['kind'],
    entityId: string,
    p: { weekday: Placement['weekday']; periodId: string },
  ): Placement => ({
    ...slot(kind, entityId, p),
    pinned: fixed.has(slotKey(slot(kind, entityId, p))),
  });
  return [
    ...proposal.lessons.map((p) => placement('lesson', p.assignmentId, p)),
    ...proposal.planning.map((p) => placement('planning', p.teacherId, p)),
  ];
}

/** Diferença entre a grade atual e a proposta: o que sai, o que entra e o que fica. */
export function compareGrids(
  current: readonly Placement[],
  proposal: readonly Placement[],
): { delta: GridDelta; kept: number } {
  const key = (p: Placement) => slotKey(p) + '|' + String(p.pinned);
  const proposed = new Set(proposal.map(key));
  const existing = new Set(current.map(key));
  return {
    delta: {
      removed: current.filter((p) => !proposed.has(key(p))),
      added: proposal.filter((p) => !existing.has(key(p))),
    },
    kept: current.filter((p) => proposed.has(key(p))).length,
  };
}
