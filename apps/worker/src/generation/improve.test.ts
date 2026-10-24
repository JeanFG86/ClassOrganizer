import { describe, expect, it } from 'vitest';
import {
  measurePreferences,
  validateTimetableProposal,
  type GenerationOptions,
  type PreferenceCriterion,
  type TimetableProposal,
  type TimetableSnapshot,
} from '@classorganizer/core';
import { makeTimetableFixture } from '@classorganizer/core/testing';
import { improveProposal } from './improve.ts';
import { solveReference } from './reference-engine.ts';
import { buildSearchModel } from './search-model.ts';
import { makeSyntheticTimetable } from './synthetic-fixture.ts';

const options: GenerationOptions = {
  timeLimitMs: 5000,
  nodeLimit: 500000,
  seed: 3,
  memoryLimitMb: 64,
};
const solve = (snapshot: TimetableSnapshot) =>
  solveReference(snapshot, options, { now: () => 0, cancelled: () => false });
const empty: TimetableProposal = { lessons: [], planning: [] };
const withPreferences = (
  snapshot: TimetableSnapshot,
  order: PreferenceCriterion[],
  reference = empty,
): TimetableSnapshot => ({ ...snapshot, preferences: { order, reference } });
const placedSet = (proposal: TimetableProposal | null) =>
  new Set([
    ...(proposal?.lessons ?? []).map((l) => [l.assignmentId, l.weekday, l.periodId].join('|')),
    ...(proposal?.planning ?? []).map((p) => [p.teacherId, p.weekday, p.periodId].join('|')),
  ]);

/** Uma turma com três aulas num dia: o professor do bloco pode ficar com uma aula vaga. */
function windowScenario(): TimetableSnapshot {
  const fixture = makeTimetableFixture();
  return {
    ...fixture,
    weekdays: [1],
    periods: fixture.periods.filter((p) => p.shiftId === 'shift-a'),
    classGroups: [{ id: 'c1', name: 'Turma Alfa', periodIds: ['p1', 'p2', 'p3'] }],
    resources: [],
    teachers: fixture.teachers.map((t) => ({ ...t, subjectIds: ['s1', 's2'], planningPeriods: 0 })),
    assignments: [
      {
        id: 'a1',
        classGroupId: 'c1',
        participants: [{ teacherId: 't1', subjectId: 's1' }],
        weeklyLessons: 2,
        resourceIds: [],
      },
      {
        id: 'a2',
        classGroupId: 'c1',
        participants: [{ teacherId: 't2', subjectId: 's2' }],
        weeklyLessons: 1,
        resourceIds: [],
      },
    ],
    subjectRules: ['s1', 's2'].map((subjectId) => ({
      classGroupId: 'c1',
      subjectId,
      maxPerDay: 2,
      consecutive: false,
    })),
  };
}
const gapped: TimetableProposal = {
  lessons: [
    { assignmentId: 'a1', weekday: 1, periodId: 'p1' },
    { assignmentId: 'a2', weekday: 1, periodId: 'p2' },
    { assignmentId: 'a1', weekday: 1, periodId: 'p3' },
  ],
  planning: [],
};

describe('melhoria de preferências', () => {
  it('reduz janelas e repetições num cenário maior, sempre com grade válida', () => {
    const { snapshot } = makeSyntheticTimetable({
      classGroups: 6,
      teachers: 18,
      lessons: 140,
      assignments: 48,
      planningPeriods: 18,
      periodsPerDay: 5,
      shifts: 2,
    });
    const first = solve(snapshot);
    const order: PreferenceCriterion[] = ['teacher_windows', 'daily_spread'];
    const improved = solve(withPreferences(snapshot, order));
    expect(first.status).toBe('feasible');
    expect(improved.status).toBe('feasible');
    if (!first.proposal || !improved.proposal) throw new Error('Proposta ausente.');
    expect(validateTimetableProposal(snapshot, improved.proposal)).toEqual([]);
    const before = measurePreferences(snapshot, first.proposal);
    const after = measurePreferences(snapshot, improved.proposal);
    expect(after.teacherWindows).toBeLessThan(before.teacherWindows);
    expect(['preferences_met', 'local_optimum']).toContain(improved.reason);
    expect(solve(withPreferences(snapshot, order))).toEqual(improved);
  });

  it('a ordem decide: um critério só desempata os que vêm antes', () => {
    const snapshot = windowScenario();
    const kept = solve(withPreferences(snapshot, ['keep_current', 'teacher_windows'], gapped));
    expect(placedSet(kept.proposal)).toEqual(placedSet(gapped));
    expect(kept.reason).toBe('local_optimum');
    const tidy = solve(withPreferences(snapshot, ['teacher_windows', 'keep_current'], gapped));
    if (!tidy.proposal) throw new Error('Proposta ausente.');
    expect(validateTimetableProposal(snapshot, tidy.proposal)).toEqual([]);
    expect(measurePreferences(withPreferences(snapshot, [], gapped), tidy.proposal)).toMatchObject({
      teacherWindows: 0,
      // Toda grade sem janela tira duas das três aulas da referência do lugar.
      changes: 2,
    });
    expect(tidy.reason).toBe('local_optimum');
  });

  it('nunca tira do lugar uma aula fixada, mesmo que isso deixe uma janela', () => {
    const snapshot: TimetableSnapshot = {
      ...withPreferences(windowScenario(), ['teacher_windows']),
      fixedLessons: [
        { assignmentId: 'a1', weekday: 1, periodId: 'p1' },
        { assignmentId: 'a1', weekday: 1, periodId: 'p3' },
      ],
    };
    const result = solve(snapshot);
    expect(result.status).toBe('feasible');
    expect(placedSet(result.proposal)).toEqual(placedSet(gapped));
    expect(result.reason).toBe('local_optimum');
  });

  it('para ao atingir o melhor possível, o prazo ou o cancelamento', () => {
    const snapshot = withPreferences(windowScenario(), ['teacher_windows']);
    const model = buildSearchModel(snapshot);
    const limits = { deadline: 10, nodeLimit: 1000, seed: 1 };
    const run = (now: number, cancelled: boolean) =>
      improveProposal(
        snapshot,
        model,
        gapped,
        { now: () => now, cancelled: () => cancelled },
        limits,
      );
    expect(run(0, false)).toMatchObject({ reason: 'preferences_met' });
    expect(run(10, false)).toMatchObject({ reason: 'time_limit', proposal: gapped });
    expect(run(0, true).reason).toBe('cancelled');
    expect(solveReference(snapshot, options, { now: () => 0, cancelled: () => false }).reason).toBe(
      'preferences_met',
    );
  });
});
