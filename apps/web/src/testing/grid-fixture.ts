import type { GridViewDto } from '@classorganizer/contracts';

/** Grade inventada para os testes de componente; não representa nenhuma escola. */
export const date = '2026-01-01T00:00:00.000Z';
export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const PLANNING = id(1);
export const REVISION = id(2);
export const P1 = id(10);
export const P2 = id(11);
export const CLASS = id(20);
export const TEACHER = id(30);
export const SUBJECT = id(40);
export const BLOCK = id(50);

export function gridViewFixture(overrides: Partial<GridViewDto> = {}): GridViewDto {
  return {
    planning: {
      id: PLANNING,
      name: 'Plano fictício',
      year: 2027,
      version: 3,
      createdAt: date,
      archivedAt: null,
      copiedFromId: null,
    },
    revision: {
      id: REVISION,
      number: 1,
      sealedAt: null,
      reviewedItems: [],
    },
    revisions: [{ id: REVISION, number: 1, sealedAt: null }],
    editable: true,
    rules: {
      formatVersion: 1,
      planningPeriods: 'any_shift',
      daily: { maxPerDay: 2, consecutive: true },
      dailyExceptions: [],
    },
    timetable: {
      modelVersion: 1,
      sourceRevision: REVISION,
      lessonMinutes: 50,
      weekdays: [1, 2, 3, 4, 5],
      periods: [
        { id: P1, shiftId: 'shift', startMinute: 420, endMinute: 470 },
        { id: P2, shiftId: 'shift', startMinute: 470, endMinute: 520 },
      ],
      subjects: [{ id: SUBJECT, name: 'Disciplina Alfa' }],
      classGroups: [{ id: CLASS, name: 'Turma Alfa', periodIds: [P1, P2] }],
      teachers: [
        {
          id: TEACHER,
          name: 'Docente Alfa',
          subjectIds: [SUBJECT],
          unavailable: [{ weekday: 5, periodId: P1 }],
          planningPeriods: 1,
          planningPeriodIds: [P1, P2],
          maxWeeklyLessons: null,
        },
      ],
      assignments: [
        {
          id: BLOCK,
          classGroupId: CLASS,
          participants: [{ teacherId: TEACHER, subjectId: SUBJECT }],
          weeklyLessons: 2,
          resourceIds: [],
        },
      ],
      resources: [],
      subjectRules: [{ classGroupId: CLASS, subjectId: SUBJECT, maxPerDay: 2, consecutive: true }],
      fixedLessons: [],
      fixedPlanning: [],
    },
    shifts: [{ id: 'shift', name: 'Turno Alfa', periodIds: [P1, P2] }],
    placements: [{ kind: 'lesson', entityId: BLOCK, weekday: 1, periodId: P1, pinned: false }],
    diagnosis: {
      model: [],
      problems: [],
      pending: [
        {
          code: 'load.lessons',
          message:
            'O bloco de Disciplina Alfa na turma Turma Alfa exige 2 aulas; a grade contém 1.',
          entityIds: [BLOCK],
        },
      ],
      alerts: [],
      teachers: [
        {
          teacherId: TEACHER,
          lessons: 1,
          requiredLessons: 2,
          planning: 0,
          requiredPlanning: 1,
          maxWeeklyLessons: null,
          windows: 0,
        },
      ],
      classGroups: [{ classGroupId: CLASS, lessons: 1, requiredLessons: 2 }],
    },
    history: [
      {
        id: id(60),
        sequence: 1,
        kind: 'operation',
        summary: 'Inseriu Disciplina Alfa (Turma Alfa) em segunda, 07:00 (Turno Alfa).',
        actorUsername: 'editor-test',
        occurredAt: date,
        reverted: false,
      },
    ],
    undo: { changeId: id(60), summary: 'Inseriu Disciplina Alfa (Turma Alfa).' },
    ...overrides,
  };
}
