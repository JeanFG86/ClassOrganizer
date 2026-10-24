import type { TimetableProposal, TimetableSnapshot } from './model.ts';

/** Métricas das preferências (ADR 0015): quanto menor, melhor; zero é o melhor possível. */
export interface PreferenceMetrics {
  /** Alocações da grade de referência que a proposta tirou do lugar. */
  readonly changes: number;
  /** Aulas vagas entre duas atividades do professor no mesmo turno e dia. */
  readonly teacherWindows: number;
  /** Aulas que repetem a disciplina da turma em um dia quando havia dia livre para ela. */
  readonly dailySpread: number;
}

/**
 * Medição independente da busca, usada para conferir e comparar propostas. Grades
 * incompletas também podem ser medidas: a repetição considera só as aulas já alocadas.
 */
export function measurePreferences(
  snapshot: TimetableSnapshot,
  proposal: TimetableProposal,
): PreferenceMetrics {
  const key = (kind: string, id: string, weekday: number, periodId: string) =>
    JSON.stringify([kind, id, weekday, periodId]);
  const placed = new Set([
    ...proposal.lessons.map((l) => key('lesson', l.assignmentId, l.weekday, l.periodId)),
    ...proposal.planning.map((p) => key('planning', p.teacherId, p.weekday, p.periodId)),
  ]);
  const reference = snapshot.preferences?.reference ?? { lessons: [], planning: [] };
  const changes = new Set(
    [
      ...reference.lessons.map((l) => key('lesson', l.assignmentId, l.weekday, l.periodId)),
      ...reference.planning.map((p) => key('planning', p.teacherId, p.weekday, p.periodId)),
    ].filter((k) => !placed.has(k)),
  ).size;

  const assignments = new Map(snapshot.assignments.map((a) => [a.id, a]));
  const busy = new Map<string, Set<string>>();
  const mark = (teacherId: string, weekday: number, periodId: string) => {
    const set = busy.get(teacherId) ?? new Set<string>();
    set.add(weekday + '|' + periodId);
    busy.set(teacherId, set);
  };
  for (const l of proposal.lessons)
    for (const p of assignments.get(l.assignmentId)?.participants ?? [])
      mark(p.teacherId, l.weekday, l.periodId);
  for (const p of proposal.planning) mark(p.teacherId, p.weekday, p.periodId);
  const shifts = new Map<string, string[]>();
  for (const p of snapshot.periods.toSorted((a, b) => a.startMinute - b.startMinute))
    shifts.set(p.shiftId, [...(shifts.get(p.shiftId) ?? []), p.id]);
  let teacherWindows = 0;
  for (const slots of busy.values())
    for (const day of snapshot.weekdays)
      for (const periodIds of shifts.values()) {
        const used = periodIds.flatMap((id, index) => (slots.has(day + '|' + id) ? [index] : []));
        const first = used[0];
        const last = used.at(-1);
        if (first !== undefined && last !== undefined)
          teacherWindows += last - first + 1 - used.length;
      }

  const days = new Map<string, { count: number; days: Set<number> }>();
  for (const l of proposal.lessons) {
    const a = assignments.get(l.assignmentId);
    for (const subjectId of new Set(a?.participants.map((p) => p.subjectId))) {
      const group = JSON.stringify([a?.classGroupId, subjectId]);
      const entry = days.get(group) ?? { count: 0, days: new Set<number>() };
      entry.count++;
      entry.days.add(l.weekday);
      days.set(group, entry);
    }
  }
  let dailySpread = 0;
  for (const entry of days.values())
    dailySpread += Math.min(entry.count, snapshot.weekdays.length) - entry.days.size;
  return { changes, teacherWindows, dailySpread };
}
