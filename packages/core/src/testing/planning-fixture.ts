import type {
  GenerationRunRepository,
  GridRepository,
  PlanningRepository,
  GridHistoryEntry,
} from '../modules/planning/application/ports/index.ts';
import {
  isRunActive,
  type GenerationOutcome,
  type GenerationRun,
} from '../modules/planning/domain/generation-run.ts';
import { applyDelta, type Placement } from '../modules/planning/domain/grid.ts';
import { PlanningError } from '../modules/planning/domain/planning-error.ts';
import type { TimetableSnapshot } from '../modules/timetable/domain/model.ts';
import type {
  CatalogSnapshot,
  Planning,
  PlanningRevision,
} from '../modules/planning/domain/planning.ts';
import type { Weekday } from '../shared/weekdays.ts';

const created = '2026-01-01T00:00:00.000Z';

/**
 * Fotografia inventada: dois turnos com durações diferentes que se sobrepõem, registros
 * arquivados e um bloco compartilhado. Não representa nenhuma escola.
 */
export function makeCatalogFixture(): CatalogSnapshot {
  return {
    formatVersion: 1,
    catalogVersion: 3,
    capturedAt: created,
    subjects: [
      { id: 's1', name: 'Disciplina Alfa', archivedAt: null },
      { id: 's2', name: 'Disciplina Beta', archivedAt: null },
    ],
    shifts: [
      {
        id: 'shift-a',
        name: 'Turno Alfa',
        archivedAt: null,
        periods: [
          { id: 'pa1', startMinute: 420, endMinute: 470 },
          { id: 'pa2', startMinute: 470, endMinute: 520 },
          { id: 'pa3', startMinute: 540, endMinute: 590 },
        ],
      },
      {
        id: 'shift-b',
        name: 'Turno Beta',
        archivedAt: null,
        periods: [
          { id: 'pb1', startMinute: 500, endMinute: 545 },
          { id: 'pb2', startMinute: 545, endMinute: 590 },
        ],
      },
      {
        id: 'shift-x',
        name: 'Turno arquivado',
        archivedAt: created,
        periods: [{ id: 'px1', startMinute: 1000, endMinute: 1050 }],
      },
    ],
    classGroups: [
      {
        id: 'c1',
        name: 'Turma Alfa',
        shiftId: 'shift-a',
        periodIds: ['pa1', 'pa2', 'pa3'],
        archivedAt: null,
      },
      {
        id: 'c2',
        name: 'Turma Beta',
        shiftId: 'shift-b',
        periodIds: ['pb1', 'pb2'],
        archivedAt: null,
      },
      {
        id: 'c3',
        name: 'Turma arquivada',
        shiftId: 'shift-a',
        periodIds: ['pa1'],
        archivedAt: created,
      },
      { id: 'c4', name: 'Turma sem turno', shiftId: null, periodIds: [], archivedAt: null },
    ],
    teachers: [
      {
        id: 't1',
        name: 'Docente Alfa',
        subjectIds: ['s1', 's2'],
        maxWeeklyLessons: null,
        planningPeriods: 1,
        unavailable: [
          { weekday: 5, periodId: 'pa1' },
          { weekday: 1, periodId: 'px1' },
        ],
        archivedAt: null,
      },
      {
        id: 't2',
        name: 'Docente Beta',
        subjectIds: ['s1'],
        maxWeeklyLessons: 1,
        planningPeriods: 0,
        unavailable: [],
        archivedAt: null,
      },
      {
        id: 't3',
        name: 'Docente arquivado',
        subjectIds: ['s1'],
        maxWeeklyLessons: null,
        planningPeriods: 2,
        unavailable: [],
        archivedAt: created,
      },
    ],
    assignments: [
      {
        id: 'a1',
        classGroupId: 'c1',
        participants: [{ teacherId: 't1', subjectId: 's1' }],
        weeklyLessons: 2,
      },
      {
        id: 'a2',
        classGroupId: 'c2',
        participants: [{ teacherId: 't1', subjectId: 's2' }],
        weeklyLessons: 1,
      },
      {
        id: 'a3',
        classGroupId: 'c1',
        participants: [
          { teacherId: 't2', subjectId: 's1' },
          { teacherId: 't1', subjectId: 's2' },
        ],
        weeklyLessons: 2,
      },
      {
        id: 'a4',
        classGroupId: 'c3',
        participants: [{ teacherId: 't2', subjectId: 's1' }],
        weeklyLessons: 1,
      },
    ],
  };
}

/** Repositórios em memória que imitam a gravação condicionada por versão. */
export function makeInMemoryPlanningStore(capture: () => CatalogSnapshot = makeCatalogFixture) {
  const plannings: Planning[] = [];
  const revisions: PlanningRevision[] = [];
  const placements = new Map<string, Placement[]>();
  const history: GridHistoryEntry[] = [];
  const repository: PlanningRepository = {
    list: async () => structuredClone(plannings),
    find: async (id) => structuredClone(plannings.find((p) => p.id === id) ?? null),
    revisions: async (id) => structuredClone(revisions.filter((r) => r.planningId === id)),
    revision: async (id) => structuredClone(revisions.find((r) => r.id === id) ?? null),
    add: async (planning, revision) => {
      plannings.push(structuredClone(planning));
      revisions.push(structuredClone(revision));
    },
    save: async (planning, revision) => {
      const index = plannings.findIndex((p) => p.id === planning.id);
      if (plannings[index]?.version !== planning.version) throw new Error('versão divergente');
      plannings[index] = { ...structuredClone(planning), version: planning.version + 1 };
      if (revision) {
        const position = revisions.findIndex((r) => r.id === revision.id);
        if (position < 0) revisions.push(structuredClone(revision));
        else revisions[position] = structuredClone(revision);
      }
    },
    capture: async () => structuredClone(capture()),
  };
  const grids: GridRepository = {
    placements: async (revisionId) => structuredClone(placements.get(revisionId) ?? []),
    history: async (revisionId) =>
      structuredClone(history.filter((c) => c.revisionId === revisionId)),
    apply: async (revisionId, delta) => {
      placements.set(revisionId, applyDelta(placements.get(revisionId) ?? [], delta));
    },
    record: async (change) => {
      history.push({ ...structuredClone(change), actorUsername: 'editor-test' });
    },
  };
  return { plannings, revisions, placements, history, repository, grids };
}

/** Execuções em memória; `finish` faz o papel do worker. */
export function makeInMemoryGenerationRuns() {
  const runs: GenerationRun[] = [];
  const inputs = new Map<string, TimetableSnapshot>();
  const update = (id: string, change: Partial<GenerationRun>) => {
    const index = runs.findIndex((r) => r.id === id);
    const current = runs[index];
    if (!current) throw new Error('execução inexistente');
    runs[index] = { ...current, ...change };
  };
  const repository: GenerationRunRepository = {
    add: async (run, input) => {
      if (runs.some((r) => r.planningId === run.planningId && isRunActive(r.status)))
        throw new PlanningError('generation.active', 'Já há uma geração em andamento.');
      runs.push({
        ...structuredClone(run),
        requestedByUsername: 'editor-test',
        appliedByUsername: null,
        outcome: null,
        startedAt: null,
        finishedAt: null,
      });
      inputs.set(run.id, structuredClone(input));
    },
    find: async (id) => structuredClone(runs.find((r) => r.id === id) ?? null),
    list: async (revisionId, limit) =>
      structuredClone(
        runs
          .filter((r) => r.revisionId === revisionId)
          .toReversed()
          .slice(0, limit),
      ),
    active: async (planningId) =>
      structuredClone(
        runs.find((r) => r.planningId === planningId && isRunActive(r.status)) ?? null,
      ),
    cancel: async (id, at) => {
      const run = runs.find((r) => r.id === id);
      if (run?.status === 'queued')
        update(id, {
          status: 'cancelled',
          finishedAt: at,
          outcome: {
            status: 'cancelled',
            reason: 'cancelled',
            placements: null,
            diagnostics: [],
            warnings: [],
            metrics: {
              elapsedMs: 0,
              visitedNodes: 0,
              backtracks: 0,
              restarts: 0,
              preferences: null,
            },
          },
        });
      else if (run?.status === 'running') update(id, { cancelRequestedAt: at });
    },
    markApplied: async (id, _actorId, at) => {
      const run = runs.find((r) => r.id === id);
      if (!run || run.appliedAt) return false;
      update(id, { appliedAt: at, appliedByUsername: 'editor-test' });
      return true;
    },
  };
  function finish(id: string, outcome: Omit<GenerationOutcome, 'metrics' | 'warnings'>) {
    update(id, {
      status: outcome.status,
      attempts: 1,
      startedAt: new Date('2026-01-01T00:00:01.000Z'),
      finishedAt: new Date('2026-01-01T00:00:02.000Z'),
      outcome: {
        ...outcome,
        warnings: [],
        metrics: {
          elapsedMs: 120,
          visitedNodes: 40,
          backtracks: 2,
          restarts: 0,
          preferences: null,
        },
      },
    });
  }
  return { runs, inputs, repository, finish, update };
}

/** Grade completa e válida para a fotografia inventada. */
export function completeGrid(): Placement[] {
  const lesson = (entityId: string, weekday: Weekday, periodId: string): Placement => ({
    kind: 'lesson',
    entityId,
    weekday,
    periodId,
    pinned: false,
  });
  return [
    lesson('a1', 1, 'pa1'),
    lesson('a1', 2, 'pa1'),
    lesson('a3', 1, 'pa2'),
    lesson('a3', 3, 'pa1'),
    lesson('a2', 4, 'pb1'),
    { kind: 'planning', entityId: 't1', weekday: 5, periodId: 'pa3', pinned: false },
  ];
}
