import { describe, expect, it } from 'vitest';
import { makeTimetableFixture } from '../../../testing/timetable-fixture.ts';
import type { PreferenceCriterion, TimetableProposal } from './model.ts';
import { measurePreferences } from './preferences.ts';
import { validateTimetableModel } from './validate-model.ts';

const proposal: TimetableProposal = {
  lessons: [
    { assignmentId: 'a1', weekday: 1, periodId: 'p1' },
    { assignmentId: 'a1', weekday: 1, periodId: 'p3' },
    { assignmentId: 'a2', weekday: 2, periodId: 'p4' },
  ],
  planning: [{ teacherId: 't1', weekday: 2, periodId: 'p1' }],
};

describe('métricas de preferências', () => {
  it('conta janelas por turno, repetições no dia e mudanças em relação à referência', () => {
    const snapshot = {
      ...makeTimetableFixture(),
      preferences: {
        order: ['keep_current'] as PreferenceCriterion[],
        reference: {
          lessons: [{ assignmentId: 'a1', weekday: 2 as const, periodId: 'p2' }],
          planning: [{ teacherId: 't1', weekday: 2 as const, periodId: 'p1' }],
        },
      },
    };
    // Os dois docentes do bloco têm uma aula vaga na segunda; a disciplina repete no dia
    // embora a terça estivesse livre para ela; uma alocação da referência mudou de lugar.
    expect(measurePreferences(snapshot, proposal)).toEqual({
      changes: 1,
      teacherWindows: 2,
      dailySpread: 1,
    });
  });
  it('não conta janela entre turnos diferentes nem cobra aulas ainda não alocadas', () => {
    const snapshot = makeTimetableFixture();
    expect(
      measurePreferences(snapshot, {
        lessons: [{ assignmentId: 'a1', weekday: 1, periodId: 'p1' }],
        planning: [{ teacherId: 't1', weekday: 1, periodId: 'p4' }],
      }),
    ).toEqual({ changes: 0, teacherWindows: 0, dailySpread: 0 });
  });
  it('recusa critérios desconhecidos, repetidos ou referência inexistente', () => {
    const base = makeTimetableFixture();
    const empty = { lessons: [], planning: [] };
    for (const preferences of [
      { order: ['teacher_windows', 'teacher_windows'] as PreferenceCriterion[], reference: empty },
      { order: ['fewer_days'] as unknown as PreferenceCriterion[], reference: empty },
      {
        order: [] as PreferenceCriterion[],
        reference: {
          lessons: [{ assignmentId: 'ax', weekday: 1 as const, periodId: 'p1' }],
          planning: [],
        },
      },
    ])
      expect(validateTimetableModel({ ...base, preferences })[0]?.code).toBe('model.invalid');
    expect(
      validateTimetableModel({
        ...base,
        preferences: { order: ['daily_spread'], reference: empty },
      }),
    ).toEqual([]);
  });
});
