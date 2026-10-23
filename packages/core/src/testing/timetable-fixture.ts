import type { TimetableProposal, TimetableSnapshot } from '../modules/timetable/domain/model.ts';
import type { Weekday } from '../shared/weekdays.ts';

/** Dados inteiramente inventados para regressões; não representam uma escola. */
export function makeTimetableFixture() {
  return {
    modelVersion: 1 as const,
    sourceRevision: 'fixture-1',
    lessonMinutes: 50,
    weekdays: [1, 2] as Weekday[],
    periods: [
      { id: 'p1', shiftId: 'shift-a', startMinute: 480, endMinute: 530 },
      { id: 'p2', shiftId: 'shift-a', startMinute: 530, endMinute: 580 },
      { id: 'p3', shiftId: 'shift-a', startMinute: 600, endMinute: 650 },
      { id: 'p4', shiftId: 'shift-b', startMinute: 505, endMinute: 555 },
    ],
    subjects: [
      { id: 's1', name: 'Disciplina Alfa' },
      { id: 's2', name: 'Disciplina Beta' },
    ],
    classGroups: [
      { id: 'c1', name: 'Turma Alfa', periodIds: ['p1', 'p2', 'p3'] },
      { id: 'c2', name: 'Turma Beta', periodIds: ['p4'] },
    ],
    teachers: [
      {
        id: 't1',
        name: 'Docente Alfa',
        subjectIds: ['s1', 's2'],
        unavailable: [] as { weekday: Weekday; periodId: string }[],
        planningPeriods: 1,
        planningPeriodIds: ['p1', 'p2', 'p3'],
        maxWeeklyLessons: null as number | null,
      },
      {
        id: 't2',
        name: 'Docente Beta',
        subjectIds: ['s1'],
        unavailable: [] as { weekday: Weekday; periodId: string }[],
        planningPeriods: 0,
        planningPeriodIds: [] as string[],
        maxWeeklyLessons: null as number | null,
      },
    ],
    assignments: [
      {
        id: 'a1',
        classGroupId: 'c1',
        participants: [
          { teacherId: 't1', subjectId: 's1' },
          { teacherId: 't2', subjectId: 's1' },
        ],
        weeklyLessons: 2,
        resourceIds: ['r1'],
      },
      {
        id: 'a2',
        classGroupId: 'c2',
        participants: [{ teacherId: 't1', subjectId: 's2' }],
        weeklyLessons: 1,
        resourceIds: [] as string[],
      },
    ],
    resources: [{ id: 'r1', name: 'Recurso de teste' }],
    subjectRules: [
      { classGroupId: 'c1', subjectId: 's1', maxPerDay: 2 as 1 | 2, consecutive: true as boolean },
      { classGroupId: 'c2', subjectId: 's2', maxPerDay: 1 as 1 | 2, consecutive: false as boolean },
    ],
    fixedLessons: [] as TimetableSnapshot['fixedLessons'][number][],
    fixedPlanning: [] as TimetableSnapshot['fixedPlanning'][number][],
  } satisfies TimetableSnapshot;
}
export function knownTimetableProposal(): TimetableProposal {
  return {
    lessons: [
      { assignmentId: 'a1', weekday: 1, periodId: 'p1' },
      { assignmentId: 'a1', weekday: 1, periodId: 'p2' },
      { assignmentId: 'a2', weekday: 2, periodId: 'p4' },
    ],
    planning: [{ teacherId: 't1', weekday: 2, periodId: 'p3' }],
  };
}
