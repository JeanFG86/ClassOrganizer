import type {
  TimetableIssue,
  TimetableProposal,
  TimetableSnapshot,
} from '../../timetable/domain/model.ts';

export interface GenerationOptions {
  readonly timeLimitMs: number;
  readonly nodeLimit: number;
  readonly seed: number;
  readonly memoryLimitMb: number;
}
export type SearchStatus =
  'feasible' | 'infeasible' | 'inconclusive' | 'cancelled' | 'invalid_model' | 'failed';
export interface EngineSearchResult {
  readonly status: SearchStatus;
  readonly reason: string;
  readonly proposal: TimetableProposal | null;
  readonly diagnostics: readonly TimetableIssue[];
  readonly elapsedMs: number;
  readonly visitedNodes: number;
  readonly backtracks: number;
  readonly restarts: number;
}
export interface TimetableEngine {
  solve(
    snapshot: TimetableSnapshot,
    options: GenerationOptions,
    signal?: AbortSignal,
  ): Promise<EngineSearchResult>;
}
export interface GenerationResult extends EngineSearchResult {
  readonly sourceRevision: string;
  readonly teacherIdleMinutes: number | null;
  readonly warnings: readonly TimetableIssue[];
}
