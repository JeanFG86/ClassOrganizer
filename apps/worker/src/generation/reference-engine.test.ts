import { bindUseCase, GenerateTimetable, validateTimetableProposal } from '@classorganizer/core';
import { describe, expect, it } from 'vitest';
import type { GenerationOptions, TimetableSnapshot } from '@classorganizer/core';
import { makeTimetableFixture } from '@classorganizer/core/testing';
import { solveReference } from './reference-engine.ts';

const options: GenerationOptions = {
  timeLimitMs: 1000,
  nodeLimit: 100000,
  seed: 7,
  memoryLimitMb: 64,
};
const solve = (snapshot: TimetableSnapshot, override: Partial<GenerationOptions> = {}) =>
  solveReference(snapshot, { ...options, ...override }, { now: () => 0, cancelled: () => false });

describe('motor de referência TypeScript', () => {
  it('produz solução completa validada, com equipe e hora-atividade', () => {
    const snapshot = makeTimetableFixture();
    const result = solve(snapshot);
    expect(result.status).toBe('feasible');
    if (!result.proposal) throw new Error('Proposta ausente.');
    expect(validateTimetableProposal(snapshot, result.proposal)).toEqual([]);
    expect(result.proposal.lessons).toHaveLength(3);
    expect(result.proposal.planning).toHaveLength(1);
  });
  it('preserva fixações mesmo quando a ocorrência livre vem antes no horário', async () => {
    const snapshot = makeTimetableFixture();
    snapshot.fixedLessons.push({ assignmentId: 'a1', weekday: 2, periodId: 'p2' });
    snapshot.fixedPlanning.push({ teacherId: 't1', weekday: 1, periodId: 'p3' });
    const generate = bindUseCase(
      new GenerateTimetable({ engine: { solve: async (s) => solve(s) } }),
    );
    const result = await generate(snapshot, options);
    expect(result.status).toBe('feasible');
    expect(result.proposal?.lessons).toContainEqual(snapshot.fixedLessons[0]);
    expect(result.proposal?.planning).toContainEqual(snapshot.fixedPlanning[0]);
  });
  it('evita indisponibilidade por sobreposição real entre turnos', () => {
    const snapshot = makeTimetableFixture();
    snapshot.teachers[1]?.unavailable.push({ weekday: 1, periodId: 'p4' });
    const result = solve(snapshot);
    expect(result.status).toBe('feasible');
    if (!result.proposal) throw new Error('Proposta ausente.');
    expect(validateTimetableProposal(snapshot, result.proposal)).toEqual([]);
    expect(
      result.proposal.lessons
        .filter((l) => l.assignmentId === 'a1' && l.weekday === 1)
        .every((l) => l.periodId === 'p3'),
    ).toBe(true);
  });
  it('repete a mesma grade e contadores com a mesma semente', () => {
    expect(solve(makeTimetableFixture())).toEqual(solve(makeTimetableFixture()));
  });
  it('esgotamento de tempo e de nós são inconclusivos', () => {
    let tick = 0;
    expect(
      solveReference(
        makeTimetableFixture(),
        { ...options, timeLimitMs: 1 },
        { now: () => tick++, cancelled: () => false },
      ),
    ).toMatchObject({ status: 'inconclusive', reason: 'time_limit', proposal: null });
    expect(solve(makeTimetableFixture(), { nodeLimit: 1 })).toMatchObject({
      status: 'inconclusive',
      reason: 'node_limit',
      proposal: null,
    });
  });
  it('responde a cancelamento antes e durante a busca', () => {
    expect(
      solveReference(makeTimetableFixture(), options, { now: () => 0, cancelled: () => true })
        .status,
    ).toBe('cancelled');
    let calls = 0;
    expect(
      solveReference(makeTimetableFixture(), options, {
        now: () => 0,
        cancelled: () => ++calls > 5,
      }).status,
    ).toBe('cancelled');
  });
  it('prova capacidade insuficiente sem relaxar a carga', () => {
    const snapshot = makeTimetableFixture();
    const a = snapshot.assignments[0];
    if (a) a.weeklyLessons = 7;
    expect(solve(snapshot)).toMatchObject({
      status: 'infeasible',
      reason: 'class_capacity',
      proposal: null,
    });
  });
  it('prova falta de capacidade do professor incluindo hora-atividade', () => {
    const snapshot = makeTimetableFixture();
    const t = snapshot.teachers[0];
    if (t) t.planningPeriods = 10;
    expect(solve(snapshot)).toMatchObject({
      status: 'infeasible',
      reason: 'teacher_capacity',
      proposal: null,
    });
  });
  it('prova inviabilidade apenas após esgotar as combinações', () => {
    const snapshot = makeTimetableFixture();
    snapshot.weekdays = [1];
    for (const teacher of snapshot.teachers) teacher.planningPeriods = 0;
    snapshot.subjectRules = snapshot.subjectRules.map((r) => ({ ...r, maxPerDay: 1 }));
    expect(solve(snapshot)).toMatchObject({
      status: 'infeasible',
      reason: 'exhausted',
      proposal: null,
    });
  });
  it('concorda com enumeração independente em casos pequenos, inclusive negativos', () => {
    for (let mask = 0; mask < 16; mask++) {
      const fixture = makeTimetableFixture();
      const snapshot: TimetableSnapshot = {
        ...fixture,
        weekdays: [1],
        fixedLessons: [],
        fixedPlanning: [],
        assignments: fixture.assignments.map((a) => ({ ...a, weeklyLessons: 1 })),
        teachers: fixture.teachers.map((t) => ({
          ...t,
          planningPeriods: 0,
          unavailable: [0, 1, 2, 3].flatMap((i) =>
            (mask & (1 << i)) !== 0 ? [{ weekday: 1 as const, periodId: 'p' + (i + 1) }] : [],
          ),
        })),
      };
      let possible = false;
      for (const first of ['p1', 'p2', 'p3']) {
        const proposal = {
          lessons: [
            { assignmentId: 'a1', weekday: 1 as const, periodId: first },
            { assignmentId: 'a2', weekday: 1 as const, periodId: 'p4' },
          ],
          planning: [],
        };
        if (validateTimetableProposal(snapshot, proposal).length === 0) possible = true;
      }
      const result = solve(snapshot);
      expect(result.status, 'Máscara ' + mask).toBe(possible ? 'feasible' : 'infeasible');
      if (result.proposal) expect(validateTimetableProposal(snapshot, result.proposal)).toEqual([]);
    }
  });

  it('confere a busca completa com enumeração de cargas múltiplas, geminadas e fixações', () => {
    const fixture = makeTimetableFixture();
    const slots = [1, 2].flatMap((weekday) =>
      ['p1', 'p2', 'p3'].map((periodId) => ({ weekday: weekday as 1 | 2, periodId })),
    );
    const combinations = (count: number) => {
      const result: (typeof slots)[] = [];
      for (let mask = 0; mask < 1 << slots.length; mask++) {
        const selected = slots.filter((_, i) => (mask & (1 << i)) !== 0);
        if (selected.length === count) result.push(selected);
      }
      return result;
    };
    for (const firstLoad of [1, 2, 3])
      for (const secondLoad of [1, 2, 3])
        for (const mode of [0, 1, 2, 3]) {
          const snapshot: TimetableSnapshot = {
            ...fixture,
            classGroups: fixture.classGroups.slice(0, 1),
            teachers: fixture.teachers.map((t) => ({
              ...t,
              subjectIds: ['s1', 's2'],
              planningPeriods: 0,
              unavailable: mode >= 2 ? [{ weekday: 1 as const, periodId: 'p1' }] : [],
            })),
            assignments: [
              {
                id: 'a1',
                classGroupId: 'c1',
                participants: [{ teacherId: 't1', subjectId: 's1' }],
                weeklyLessons: firstLoad,
                resourceIds: [],
              },
              {
                id: 'a2',
                classGroupId: 'c1',
                participants: [{ teacherId: 't2', subjectId: 's2' }],
                weeklyLessons: secondLoad,
                resourceIds: [],
              },
            ],
            subjectRules: ['s1', 's2'].map((subjectId) => ({
              classGroupId: 'c1',
              subjectId,
              maxPerDay: 2,
              consecutive: true,
            })),
            fixedLessons: mode % 2 ? [{ assignmentId: 'a1', weekday: 1, periodId: 'p2' }] : [],
          };
          let possible = false;
          for (const first of combinations(firstLoad))
            for (const second of combinations(secondLoad)) {
              if (
                validateTimetableProposal(snapshot, {
                  lessons: [
                    ...first.map((p) => ({ ...p, assignmentId: 'a1' })),
                    ...second.map((p) => ({ ...p, assignmentId: 'a2' })),
                  ],
                  planning: [],
                }).length === 0
              )
                possible = true;
            }
          const result = solve(snapshot);
          expect(result.status, [firstLoad, secondLoad, mode].join('/')).toBe(
            possible ? 'feasible' : 'infeasible',
          );
        }
  });

  it('reserva recurso exclusivo mesmo entre turmas e professores diferentes', () => {
    const snapshot = makeTimetableFixture();
    snapshot.teachers.push({
      id: 't3',
      name: 'Docente Gama',
      subjectIds: ['s2'],
      unavailable: [],
      planningPeriods: 0,
      planningPeriodIds: [],
      maxWeeklyLessons: null,
    });
    const other = snapshot.assignments[1];
    if (other) {
      other.participants = [{ teacherId: 't3', subjectId: 's2' }];
      other.resourceIds = ['r1'];
    }
    snapshot.fixedLessons.push(
      { assignmentId: 'a1', weekday: 1, periodId: 'p1' },
      { assignmentId: 'a1', weekday: 1, periodId: 'p2' },
    );
    const result = solve(snapshot);
    expect(result.status).toBe('feasible');
    expect(result.proposal?.lessons).toContainEqual({
      assignmentId: 'a2',
      weekday: 2,
      periodId: 'p4',
    });
    if (!result.proposal) throw new Error('Proposta ausente.');
    expect(validateTimetableProposal(snapshot, result.proposal)).toEqual([]);
  });

  it('aplica geminadas entre blocos separados da mesma disciplina', () => {
    const snapshot = makeTimetableFixture();
    const first = snapshot.assignments[0];
    if (!first) throw new Error('Fixture ausente.');
    snapshot.assignments = [
      { ...first, weeklyLessons: 1 },
      { ...first, id: 'a3', weeklyLessons: 1 },
    ];
    snapshot.weekdays = [1];
    for (const teacher of snapshot.teachers) teacher.planningPeriods = 0;
    snapshot.fixedLessons.push({ assignmentId: 'a1', weekday: 1, periodId: 'p2' });
    const result = solve(snapshot);
    expect(result.status).toBe('feasible');
    expect(result.proposal?.lessons).toContainEqual({
      assignmentId: 'a3',
      weekday: 1,
      periodId: 'p1',
    });
    if (!result.proposal) throw new Error('Proposta ausente.');
    expect(validateTimetableProposal(snapshot, result.proposal)).toEqual([]);
  });
});
