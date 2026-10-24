import { describe, expect, it, vi } from 'vitest';
import {
  makeTimetableFixture,
  knownTimetableProposal,
} from '../../../testing/timetable-fixture.ts';
import { makeGenerateTimetable } from './usecases/generate-timetable.ts';
import type { EngineSearchResult, TimetableEngine } from './ports/engine.ts';

const options = { timeLimitMs: 1000, nodeLimit: 10000, seed: 17, memoryLimitMb: 64 };
const solved = (): EngineSearchResult => ({
  status: 'feasible',
  reason: 'solution',
  proposal: knownTimetableProposal(),
  diagnostics: [],
  elapsedMs: 1,
  visitedNodes: 4,
  backtracks: 0,
  restarts: 0,
});
const fake = (result = solved()): TimetableEngine => ({ solve: vi.fn(async () => result) });

describe('fronteira confiável da geração', () => {
  it('só aceita sucesso depois da validação independente e conserva a revisão', async () => {
    const result = await makeGenerateTimetable({ engine: fake() })(makeTimetableFixture(), options);
    expect(result).toMatchObject({
      status: 'feasible',
      sourceRevision: 'fixture-1',
      teacherIdleMinutes: 45,
      // O bloco repete a disciplina no mesmo dia, embora houvesse outro dia livre.
      preferences: { changes: 0, teacherWindows: expect.any(Number), dailySpread: 1 },
    });
  });
  it.each([null, { lessons: [], planning: [] }])(
    'recusa falso sucesso do adaptador (%j)',
    async (proposal) => {
      const result = await makeGenerateTimetable({ engine: fake({ ...solved(), proposal }) })(
        makeTimetableFixture(),
        options,
      );
      expect(result).toMatchObject({
        status: 'failed',
        reason: 'invalid_proposal',
        proposal: null,
      });
    },
  );
  it('não confunde entrada inválida, fixação impossível e falha técnica', async () => {
    const snapshot = makeTimetableFixture();
    const engine = fake();
    snapshot.subjectRules.splice(0);
    expect((await makeGenerateTimetable({ engine })(snapshot, options)).status).toBe(
      'invalid_model',
    );
    expect(engine.solve).not.toHaveBeenCalled();
    const fixed = makeTimetableFixture();
    fixed.fixedLessons.push(
      { assignmentId: 'a1', weekday: 1, periodId: 'p1' },
      { assignmentId: 'a2', weekday: 1, periodId: 'p4' },
    );
    expect((await makeGenerateTimetable({ engine })(fixed, options)).status).toBe('infeasible');
    expect(engine.solve).not.toHaveBeenCalled();
    const broken: TimetableEngine = {
      solve: async () => {
        throw new Error('Falha simulada.');
      },
    };
    expect(
      (await makeGenerateTimetable({ engine: broken })(makeTimetableFixture(), options)).status,
    ).toBe('failed');
  });
  it.each([{ timeLimitMs: 0 }, { nodeLimit: 0 }, { seed: -1 }, { memoryLimitMb: 1 }])(
    'valida limites (%j)',
    async (override) => {
      const engine = fake();
      expect(
        (
          await makeGenerateTimetable({ engine })(makeTimetableFixture(), {
            ...options,
            ...override,
          })
        ).status,
      ).toBe('invalid_model');
      expect(engine.solve).not.toHaveBeenCalled();
    },
  );
  it('carga máxima gera alerta e não impede solução válida', async () => {
    const snapshot = makeTimetableFixture();
    const teacher = snapshot.teachers[0];
    if (teacher) teacher.maxWeeklyLessons = 1;
    const result = await makeGenerateTimetable({ engine: fake() })(snapshot, options);
    expect(result.status).toBe('feasible');
    expect(result.warnings[0]?.code).toBe('workload.maximum');
  });
  it('cancelamento prevalece sobre resultado tardio', async () => {
    const controller = new AbortController();
    const engine: TimetableEngine = {
      solve: async () => {
        controller.abort();
        return solved();
      },
    };
    expect(
      (await makeGenerateTimetable({ engine })(makeTimetableFixture(), options, controller.signal))
        .status,
    ).toBe('cancelled');
  });
  it('cancelamento prévio não inicia o adaptador', async () => {
    const controller = new AbortController();
    controller.abort();
    const engine = fake();
    expect(
      (await makeGenerateTimetable({ engine })(makeTimetableFixture(), options, controller.signal))
        .status,
    ).toBe('cancelled');
    expect(engine.solve).not.toHaveBeenCalled();
  });
  it('recusa proposta anexada a um resultado inconclusivo', async () => {
    const result = await makeGenerateTimetable({
      engine: fake({ ...solved(), status: 'inconclusive' }),
    })(makeTimetableFixture(), options);
    expect(result).toMatchObject({
      status: 'failed',
      reason: 'unexpected_proposal',
      proposal: null,
    });
  });
});
