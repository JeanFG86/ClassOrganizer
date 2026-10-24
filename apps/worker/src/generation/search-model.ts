import type { TimetableSnapshot } from '@classorganizer/core';

export interface SearchControl {
  now: () => number;
  cancelled: () => boolean;
}
export interface Slot {
  weekday: 1 | 2 | 3 | 4 | 5;
  periodId: string;
  shiftId: string;
  start: number;
  end: number;
}
/** O que precisa ser alocado: as aulas de um bloco ou a hora-atividade de um professor. */
export interface TaskShape {
  kind: 'lesson' | 'planning';
  id: string;
  teachers: number[];
  resources: number[];
  classIndex: number | null;
  ruleIndexes: number[];
  /** Horários permitidos pela turma, pela política de hora-atividade e pela disponibilidade. */
  candidates: number[];
  count: number;
  /** Horários da grade de referência das preferências. */
  reference: Set<number>;
}
export interface SearchModel {
  slots: Slot[];
  slotIndex: Map<string, number>;
  /** Para cada horário, os horários que se sobrepõem a ele no mesmo dia, incluindo ele. */
  conflicts: number[][];
  shapes: TaskShape[];
}

export const slotKeyOf = (weekday: number, periodId: string) => JSON.stringify([weekday, periodId]);

/** Traduz o snapshot validado para índices numéricos; é montado uma vez por execução. */
export function buildSearchModel(snapshot: TimetableSnapshot): SearchModel {
  const periods = snapshot.periods.toSorted(
    (a, b) => a.startMinute - b.startMinute || a.id.localeCompare(b.id),
  );
  const slots: Slot[] = snapshot.weekdays.toSorted().flatMap((weekday) =>
    periods.map((p) => ({
      weekday,
      periodId: p.id,
      shiftId: p.shiftId,
      start: p.startMinute,
      end: p.endMinute,
    })),
  );
  const slotIndex = new Map(slots.map((s, i) => [slotKeyOf(s.weekday, s.periodId), i]));
  const periodById = new Map(periods.map((p) => [p.id, p]));
  const teacherIndexes = new Map(snapshot.teachers.map((t, i) => [t.id, i]));
  const classIndexes = new Map(snapshot.classGroups.map((c, i) => [c.id, i]));
  const resourceIndexes = new Map(snapshot.resources.map((r, i) => [r.id, i]));
  const ruleIndexes = new Map(
    snapshot.subjectRules.map((r, i) => [JSON.stringify([r.classGroupId, r.subjectId]), i]),
  );
  const indexOf = (map: Map<string, number>, id: string): number => {
    const i = map.get(id);
    if (i === undefined) throw new Error('Referência ausente no modelo validado.');
    return i;
  };
  const classById = new Map(snapshot.classGroups.map((c) => [c.id, c]));
  const conflicts = slots.map((s) =>
    slots.flatMap((other, index) =>
      s.weekday === other.weekday && s.start < other.end && other.start < s.end ? [index] : [],
    ),
  );
  const available = snapshot.teachers.map((teacher) =>
    slots.map(
      (slot) =>
        !teacher.unavailable.some((u) => {
          const blocked = periodById.get(u.periodId);
          return (
            blocked &&
            u.weekday === slot.weekday &&
            slot.start < blocked.endMinute &&
            blocked.startMinute < slot.end
          );
        }),
    ),
  );
  const reference = snapshot.preferences?.reference;
  const referenceOf = (placements: readonly { weekday: number; periodId: string }[]) =>
    new Set(placements.flatMap((p) => slotIndex.get(slotKeyOf(p.weekday, p.periodId)) ?? []));
  const shapes: TaskShape[] = [];
  for (const a of snapshot.assignments) {
    const teachers = a.participants.map((p) => indexOf(teacherIndexes, p.teacherId));
    const allowed = new Set(classById.get(a.classGroupId)?.periodIds);
    shapes.push({
      kind: 'lesson',
      id: a.id,
      teachers,
      resources: a.resourceIds.map((id) => indexOf(resourceIndexes, id)),
      classIndex: indexOf(classIndexes, a.classGroupId),
      ruleIndexes: [
        ...new Set(
          a.participants.map((p) =>
            indexOf(ruleIndexes, JSON.stringify([a.classGroupId, p.subjectId])),
          ),
        ),
      ],
      candidates: slots.flatMap((s, index) =>
        allowed.has(s.periodId) && teachers.every((t) => available[t]?.[index]) ? [index] : [],
      ),
      count: a.weeklyLessons,
      reference: referenceOf(reference?.lessons.filter((l) => l.assignmentId === a.id) ?? []),
    });
  }
  for (const [index, t] of snapshot.teachers.entries())
    if (t.planningPeriods > 0)
      shapes.push({
        kind: 'planning',
        id: t.id,
        teachers: [index],
        resources: [],
        classIndex: null,
        ruleIndexes: [],
        candidates: slots.flatMap((s, i) =>
          t.planningPeriodIds.includes(s.periodId) && available[index]?.[i] ? [i] : [],
        ),
        count: t.planningPeriods,
        reference: referenceOf(reference?.planning.filter((p) => p.teacherId === t.id) ?? []),
      });
  return { slots, slotIndex, conflicts, shapes };
}

/** Ocupação de professores, turmas e recursos, com as regras diárias por disciplina. */
export function makeOccupancy(snapshot: TimetableSnapshot, model: SearchModel) {
  const { slots, conflicts } = model;
  const teacherBusy = snapshot.teachers.map(() => new Uint16Array(slots.length));
  const classBusy = snapshot.classGroups.map(() => new Uint16Array(slots.length));
  const resourceBusy = snapshot.resources.map(() => new Uint16Array(slots.length));
  /** Horários já ocupados por regra e dia, para o limite diário e as geminadas. */
  const daily = snapshot.subjectRules.map(() => Array.from({ length: 5 }, () => [] as number[]));
  return {
    daily,
    teacherBusy,
    classBusy,
    fits(task: TaskShape, index: number): boolean {
      const slot = slots[index];
      if (!slot) return false;
      if (
        task.teachers.some((i) => teacherBusy[i]?.[index]) ||
        task.resources.some((i) => resourceBusy[i]?.[index]) ||
        (task.classIndex !== null && classBusy[task.classIndex]?.[index])
      )
        return false;
      for (const i of task.ruleIndexes) {
        const rule = snapshot.subjectRules[i];
        const own = daily[i]?.[slot.weekday - 1];
        if (!rule || !own || own.length >= rule.maxPerDay) return false;
        if (rule.consecutive && own.length === 1) {
          const first = slots[own[0] ?? -1];
          if (!first || (first.end !== slot.start && slot.end !== first.start)) return false;
        }
      }
      return true;
    },
    occupy(task: TaskShape, index: number, change: 1 | -1) {
      const slot = slots[index];
      if (!slot) throw new Error('Período ausente.');
      const counters = [
        ...task.teachers.map((i) => teacherBusy[i]),
        ...task.resources.map((i) => resourceBusy[i]),
      ];
      if (task.classIndex !== null) counters.push(classBusy[task.classIndex]);
      for (const counter of counters)
        if (counter)
          for (const other of conflicts[index] ?? [])
            counter[other] = (counter[other] ?? 0) + change;
      for (const i of task.ruleIndexes) {
        const list = daily[i]?.[slot.weekday - 1];
        if (!list) continue;
        if (change === 1) list.push(index);
        else list.splice(list.lastIndexOf(index), 1);
      }
    },
  };
}
