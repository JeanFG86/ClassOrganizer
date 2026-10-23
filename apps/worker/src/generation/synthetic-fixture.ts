import type {
  GenerationOptions,
  TimetableSnapshot,
  TimetableProposal,
  Weekday,
} from '@classorganizer/core';

export interface SyntheticVolume {
  classGroups: number;
  teachers: number;
  lessons: number;
  assignments: number;
  planningPeriods: number;
  periodsPerDay: number;
  shifts: number;
}
/** Constrói dados fictícios com testemunha viável; os parâmetros não têm origem escolar embutida. */
export function makeSyntheticTimetable(volume: SyntheticVolume): {
  snapshot: TimetableSnapshot;
  witness: TimetableProposal;
} {
  const values = Object.values(volume);
  if (
    values.some((n) => !Number.isSafeInteger(n) || n < 0) ||
    volume.classGroups < 1 ||
    volume.teachers < 1 ||
    volume.periodsPerDay < 1 ||
    volume.shifts < 1 ||
    volume.shifts > 4 ||
    volume.periodsPerDay > 6 ||
    volume.lessons > volume.classGroups * volume.periodsPerDay * 5 ||
    volume.lessons < volume.classGroups ||
    volume.assignments > volume.lessons ||
    volume.assignments < 1 ||
    volume.teachers < Math.ceil(volume.classGroups / volume.shifts) * volume.periodsPerDay ||
    volume.planningPeriods > volume.teachers * 40
  )
    throw new Error('Volume sintético incompatível.');
  const weekdays: Weekday[] = [1, 2, 3, 4, 5];
  const lessonMinutes = 40;
  const periods = Array.from({ length: volume.shifts }, (_, shift) =>
    Array.from({ length: volume.periodsPerDay }, (_, p) => {
      const startMinute =
        60 +
        shift * Math.max(lessonMinutes, volume.periodsPerDay * lessonMinutes - lessonMinutes + 10) +
        p * lessonMinutes +
        (p >= Math.ceil(volume.periodsPerDay / 2) ? 10 : 0);
      return {
        id: 'period-' + shift + '-' + p,
        shiftId: 'shift-' + shift,
        startMinute,
        endMinute: startMinute + lessonMinutes,
      };
    }),
  ).flat();
  const classGroups = Array.from({ length: volume.classGroups }, (_, i) => ({
    id: 'class-' + i,
    name: 'Turma sintética ' + (i + 1),
    periodIds: periods.filter((p) => p.shiftId === 'shift-' + (i % volume.shifts)).map((p) => p.id),
  }));
  const teachers = Array.from({ length: volume.teachers }, (_, i) => ({
    id: 'teacher-' + i,
    name: 'Docente sintético ' + (i + 1),
    subjectIds: [] as string[],
    planningPeriods:
      Math.floor(volume.planningPeriods / volume.teachers) +
      (i < volume.planningPeriods % volume.teachers ? 1 : 0),
    planningPeriodIds: periods.map((p) => p.id),
    maxWeeklyLessons: null,
    unavailable: [] as { weekday: Weekday; periodId: string }[],
  }));
  const groups: {
    classGroupId: string;
    teacherId: string;
    slots: { weekday: Weekday; periodId: string }[];
  }[] = [];
  for (let i = 0; i < classGroups.length; i++) {
    const c = classGroups[i];
    if (!c) continue;
    const count =
      Math.floor(volume.lessons / volume.classGroups) +
      (i < volume.lessons % volume.classGroups ? 1 : 0);
    for (let p = 0; p < c.periodIds.length; p++) {
      const periodId = c.periodIds[p];
      if (!periodId) continue;
      const slots = weekdays
        .filter((_, day) => day * volume.periodsPerDay + p < count)
        .map((weekday) => ({ weekday, periodId }));
      if (slots.length)
        groups.push({
          classGroupId: c.id,
          teacherId: 'teacher-' + (Math.floor(i / volume.shifts) * volume.periodsPerDay + p),
          slots,
        });
    }
  }
  if (groups.length > volume.assignments)
    throw new Error('Há menos atribuições que os grupos necessários para a testemunha.');
  while (groups.length < volume.assignments) {
    const group = groups.toSorted((a, b) => b.slots.length - a.slots.length)[0];
    if (!group || group.slots.length < 2)
      throw new Error('Não foi possível dividir as atribuições sintéticas.');
    const slots = group.slots.splice(Math.ceil(group.slots.length / 2));
    groups.push({ ...group, slots });
  }
  const subjects = groups.map((_, i) => ({
    id: 'subject-' + i,
    name: 'Disciplina sintética ' + (i + 1),
  }));
  const assignments = groups.map((group, i) => {
    const subjectId = 'subject-' + i;
    const teacher = teachers.find((t) => t.id === group.teacherId);
    teacher?.subjectIds.push(subjectId);
    return {
      id: 'assignment-' + i,
      classGroupId: group.classGroupId,
      participants: [{ teacherId: group.teacherId, subjectId }],
      weeklyLessons: group.slots.length,
      resourceIds: [] as string[],
    };
  });
  const lessons = groups.flatMap((group, i) =>
    group.slots.map((s) => ({ ...s, assignmentId: 'assignment-' + i })),
  );
  const periodById = new Map(periods.map((p) => [p.id, p]));
  const planning: TimetableProposal['planning'][number][] = [];
  const overlaps = (
    a: { weekday: Weekday; periodId: string },
    b: { weekday: Weekday; periodId: string },
  ) => {
    const p = periodById.get(a.periodId);
    const q = periodById.get(b.periodId);
    return (
      a.weekday === b.weekday &&
      p &&
      q &&
      p.startMinute < q.endMinute &&
      q.startMinute < p.endMinute
    );
  };
  for (const teacher of teachers) {
    const ownAssignmentIds = new Set(
      assignments
        .filter((a) => a.participants.some((p) => p.teacherId === teacher.id))
        .map((a) => a.id),
    );
    const busy: { weekday: Weekday; periodId: string }[] = lessons.filter((l) =>
      ownAssignmentIds.has(l.assignmentId),
    );
    const free: { weekday: Weekday; periodId: string }[] = [];
    for (const weekday of weekdays)
      for (const period of periods) {
        const slot = { weekday, periodId: period.id };
        if (!busy.some((b) => overlaps(slot, b))) free.push(slot);
      }
    for (let i = 0; i < teacher.planningPeriods; i++) {
      const slot = free.find((s) => !busy.some((b) => overlaps(s, b)));
      if (!slot) throw new Error('Hora-atividade sem espaço na testemunha sintética.');
      planning.push({ teacherId: teacher.id, ...slot });
      busy.push(slot);
    }
    // Restrições adicionais preservam a testemunha, sem entregá-la ao motor.
    teacher.unavailable = free.filter((s) => !busy.some((b) => overlaps(s, b))).slice(-4);
  }
  return {
    snapshot: {
      modelVersion: 1,
      sourceRevision: 'synthetic-v1',
      lessonMinutes,
      weekdays,
      periods,
      subjects,
      classGroups,
      teachers,
      assignments,
      resources: [],
      subjectRules: assignments.map((a) => ({
        classGroupId: a.classGroupId,
        subjectId: a.participants[0]?.subjectId ?? '',
        maxPerDay: 1,
        consecutive: false,
      })),
      fixedLessons: [],
      fixedPlanning: [],
    },
    witness: { lessons, planning },
  };
}
export const demonstrationOptions: GenerationOptions = {
  timeLimitMs: 30000,
  nodeLimit: 2000000,
  seed: 11,
  memoryLimitMb: 256,
};
