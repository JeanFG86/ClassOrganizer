import { validateTimetableModel } from '../../../timetable/domain/index.ts';
import {
  measureTeacherIdleMinutes,
  validateTimetableProposal,
} from '../../../timetable/domain/index.ts';
import { measurePreferences } from '../../../timetable/domain/index.ts';
import type { TimetableIssue, TimetableSnapshot } from '../../../timetable/domain/index.ts';
import type {
  EngineSearchResult,
  GenerationOptions,
  GenerationResult,
  TimetableEngine,
} from '../ports/engine.ts';

export type GenerateTimetableDependencies = { engine: TimetableEngine };
export class GenerateTimetable {
  readonly #deps: GenerateTimetableDependencies;
  constructor(deps: GenerateTimetableDependencies) {
    this.#deps = deps;
  }
  async execute(
    snapshot: TimetableSnapshot,
    options: GenerationOptions,
    signal?: AbortSignal,
  ): Promise<GenerationResult> {
    const { engine } = this.#deps;

    const finish = (
      result: EngineSearchResult,
      warnings: TimetableIssue[] = [],
    ): GenerationResult => ({
      ...result,
      sourceRevision: snapshot.sourceRevision,
      teacherIdleMinutes: result.proposal
        ? measureTeacherIdleMinutes(snapshot, result.proposal)
        : null,
      preferences: result.proposal ? measurePreferences(snapshot, result.proposal) : null,
      warnings,
    });

    const stopped = (
      status: EngineSearchResult['status'],
      reason: string,
      diagnostics: readonly TimetableIssue[] = [],
    ): GenerationResult =>
      finish({
        status,
        reason,
        diagnostics,
        proposal: null,
        elapsedMs: 0,
        visitedNodes: 0,
        backtracks: 0,
        restarts: 0,
      });

    if (signal?.aborted) return stopped('cancelled', 'cancelled');

    const invalid = validateTimetableModel(snapshot);

    if (invalid.length) return stopped('invalid_model', 'model', invalid);

    if (
      !Number.isInteger(options.timeLimitMs) ||
      options.timeLimitMs < 1 ||
      options.timeLimitMs > 300000 ||
      !Number.isSafeInteger(options.nodeLimit) ||
      options.nodeLimit < 1 ||
      !Number.isInteger(options.seed) ||
      options.seed < 0 ||
      options.seed > 4294967295 ||
      !Number.isInteger(options.memoryLimitMb) ||
      options.memoryLimitMb < 16 ||
      options.memoryLimitMb > 1024
    )
      return stopped('invalid_model', 'options', [
        {
          code: 'options.invalid',
          message: 'Informe limites válidos de tempo, nós, memória e semente.',
          entityIds: [],
        },
      ]);

    const fixedErrors = validateTimetableProposal(
      snapshot,
      { lessons: snapshot.fixedLessons, planning: snapshot.fixedPlanning },
      { complete: false },
    );

    if (fixedErrors.length) return stopped('infeasible', 'fixed_conflict', fixedErrors);

    const warnings: TimetableIssue[] = snapshot.teachers.flatMap((t) => {
      const load = snapshot.assignments
        .filter((a) => a.participants.some((p) => p.teacherId === t.id))
        .reduce((sum, a) => sum + a.weeklyLessons, 0);
      return t.maxWeeklyLessons !== null && load > t.maxWeeklyLessons
        ? [
            {
              code: 'workload.maximum',
              message: t.name + ' está acima da carga máxima informada.',
              entityIds: [t.id],
            },
          ]
        : [];
    });

    try {
      const result = await engine.solve(snapshot, options, signal);
      if (signal?.aborted) return stopped('cancelled', 'cancelled');
      if (result.status === 'feasible') {
        const errors = result.proposal
          ? validateTimetableProposal(snapshot, result.proposal)
          : [
              {
                code: 'proposal.missing',
                message: 'O motor declarou sucesso sem entregar uma grade.',
                entityIds: [],
              },
            ];
        if (errors.length)
          return finish(
            {
              ...result,
              status: 'failed',
              reason: 'invalid_proposal',
              proposal: null,
              diagnostics: errors,
            },
            warnings,
          );
      } else if (result.proposal)
        return finish(
          {
            ...result,
            status: 'failed',
            reason: 'unexpected_proposal',
            proposal: null,
            diagnostics: [
              {
                code: 'proposal.untrusted',
                message: 'O motor devolveu uma grade sem declarar uma solução completa.',
                entityIds: [],
              },
            ],
          },
          warnings,
        );
      return finish(result, warnings);
    } catch {
      return stopped('failed', 'engine_error', [
        {
          code: 'engine.failed',
          message: 'O motor falhou durante a execução. A grade atual foi preservada.',
          entityIds: [],
        },
      ]);
    }
  }
}
