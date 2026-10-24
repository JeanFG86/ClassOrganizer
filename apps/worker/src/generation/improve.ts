import type {
  PreferenceCriterion,
  TimetableProposal,
  TimetableSnapshot,
} from '@classorganizer/core';
import {
  makeOccupancy,
  slotKeyOf,
  type SearchControl,
  type SearchModel,
  type TaskShape,
} from './search-model.ts';

/** Por que a melhoria parou; a grade devolvida é sempre válida e a melhor encontrada. */
export type ImprovementReason =
  'preferences_met' | 'local_optimum' | 'time_limit' | 'node_limit' | 'cancelled';
export interface Improvement {
  readonly proposal: TimetableProposal;
  readonly reason: ImprovementReason;
  readonly visitedNodes: number;
}
interface Event {
  shape: TaskShape;
  slot: number;
  readonly fixed: boolean;
}

/**
 * Busca local sobre uma grade válida (ADR 0015). Só aceita mudanças que mantêm todas as
 * regras obrigatórias e não pioram os critérios na ordem de prioridade: um critério só
 * desempata os anteriores, e nenhuma soma de ganhos compensa uma piora num critério acima.
 */
export function improveProposal(
  snapshot: TimetableSnapshot,
  model: SearchModel,
  proposal: TimetableProposal,
  control: SearchControl,
  limits: { deadline: number; nodeLimit: number; seed: number },
): Improvement {
  const order: readonly PreferenceCriterion[] = snapshot.preferences?.order ?? [];
  const { slots, slotIndex, shapes } = model;
  const occupancy = makeOccupancy(snapshot, model);
  let random = limits.seed >>> 0;
  const nextRandom = () => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random;
  };
  const pick = <T>(list: readonly T[]): T | undefined =>
    list[Math.floor((nextRandom() / 4294967296) * list.length)];

  const days = snapshot.weekdays.length;
  const allowed = new Map(
    shapes.map((shape) => {
      const set = new Uint8Array(slots.length);
      for (const index of shape.candidates) set[index] = 1;
      return [shape, set];
    }),
  );
  const shapeIds = new Map(shapes.map((shape, i) => [shape.kind + '|' + shape.id, i]));
  // Aulas de cada turno do dia, na ordem do horário: a base das janelas.
  const shiftsByDay = new Map<number, number[][]>();
  for (const [index, slot] of slots.entries()) {
    const shifts = shiftsByDay.get(slot.weekday) ?? [];
    const own = shifts.find((list) => slots[list[0] ?? -1]?.shiftId === slot.shiftId);
    if (own) own.push(index);
    else shifts.push([index]);
    shiftsByDay.set(slot.weekday, shifts);
  }
  const own = snapshot.teachers.map(() => new Uint16Array(slots.length));
  const windows = snapshot.teachers.map(() => new Int32Array(6));
  const ruleDays = snapshot.subjectRules.map(() => new Int32Array(6));
  const rulePlaced = new Int32Array(snapshot.subjectRules.length);
  const ruleUsedDays = new Int32Array(snapshot.subjectRules.length);
  let matched = 0;
  let teacherWindows = 0;
  let dailySpread = 0;
  const windowsOf = (teacher: number, weekday: number) => {
    let total = 0;
    for (const shift of shiftsByDay.get(weekday) ?? []) {
      let first = -1;
      let last = -1;
      let used = 0;
      for (const [position, index] of shift.entries())
        if (own[teacher]?.[index]) {
          if (first < 0) first = position;
          last = position;
          used++;
        }
      if (first >= 0) total += last - first + 1 - used;
    }
    return total;
  };
  const spreadOf = (rule: number) =>
    Math.min(rulePlaced[rule] ?? 0, days) - (ruleUsedDays[rule] ?? 0);
  /** Ocupa ou libera um horário mantendo as métricas em dia. */
  const place = (event: Event, index: number, change: 1 | -1) => {
    const slot = slots[index];
    if (!slot) throw new Error('Período ausente.');
    occupancy.occupy(event.shape, index, change);
    if (event.shape.reference.has(index)) matched += change;
    for (const teacher of event.shape.teachers) {
      const counts = own[teacher];
      const perDay = windows[teacher];
      if (!counts || !perDay) continue;
      counts[index] = (counts[index] ?? 0) + change;
      teacherWindows -= perDay[slot.weekday] ?? 0;
      perDay[slot.weekday] = windowsOf(teacher, slot.weekday);
      teacherWindows += perDay[slot.weekday] ?? 0;
    }
    for (const rule of event.shape.ruleIndexes) {
      const perDay = ruleDays[rule];
      if (!perDay) continue;
      dailySpread -= spreadOf(rule);
      const before = perDay[slot.weekday] ?? 0;
      perDay[slot.weekday] = before + change;
      rulePlaced[rule] = (rulePlaced[rule] ?? 0) + change;
      if (before === 0 && change === 1) ruleUsedDays[rule] = (ruleUsedDays[rule] ?? 0) + 1;
      if (before === 1 && change === -1) ruleUsedDays[rule] = (ruleUsedDays[rule] ?? 0) - 1;
      dailySpread += spreadOf(rule);
    }
  };

  const fixed = new Set([
    ...snapshot.fixedLessons.map(
      (f) => 'lesson|' + f.assignmentId + '|' + slotKeyOf(f.weekday, f.periodId),
    ),
    ...snapshot.fixedPlanning.map(
      (f) => 'planning|' + f.teacherId + '|' + slotKeyOf(f.weekday, f.periodId),
    ),
  ]);
  const events: Event[] = [];
  const add = (kind: TaskShape['kind'], id: string, weekday: number, periodId: string) => {
    const shape = shapes[shapeIds.get(kind + '|' + id) ?? -1];
    const index = slotIndex.get(slotKeyOf(weekday, periodId));
    if (!shape || index === undefined) throw new Error('Proposta fora do modelo validado.');
    const event = {
      shape,
      slot: index,
      fixed: fixed.has(kind + '|' + id + '|' + slotKeyOf(weekday, periodId)),
    };
    events.push(event);
    place(event, index, 1);
  };
  for (const l of proposal.lessons) add('lesson', l.assignmentId, l.weekday, l.periodId);
  for (const p of proposal.planning) add('planning', p.teacherId, p.weekday, p.periodId);
  const referenceSize = shapes.reduce((sum, shape) => sum + shape.reference.size, 0);
  const movable = events.filter((e) => !e.fixed);
  const byClass = snapshot.classGroups.map(() => [] as Event[]);
  const byTeacher = snapshot.teachers.map(() => [] as Event[]);
  for (const e of movable) {
    if (e.shape.classIndex !== null) byClass[e.shape.classIndex]?.push(e);
    for (const t of e.shape.teachers) byTeacher[t]?.push(e);
  }

  const metrics = (): number[] =>
    order.map((criterion) =>
      criterion === 'keep_current'
        ? referenceSize - matched
        : criterion === 'teacher_windows'
          ? teacherWindows
          : dailySpread,
    );
  const compare = (a: number[], b: number[]) => {
    for (const [i, value] of a.entries()) {
      const difference = value - (b[i] ?? 0);
      if (difference) return difference;
    }
    return 0;
  };
  /** Leva a aula a outro horário permitido. Devolve como desfazer, ou `null` se não couber. */
  const relocate = (e: Event): (() => void) | null => {
    const from = e.slot;
    const to = pick(e.shape.candidates);
    if (to === undefined || to === from) return null;
    place(e, from, -1);
    if (!occupancy.fits(e.shape, to)) {
      place(e, from, 1);
      return null;
    }
    place(e, to, 1);
    e.slot = to;
    return () => {
      place(e, to, -1);
      place(e, from, 1);
      e.slot = from;
    };
  };
  /** Troca de horário com outra aula da mesma turma ou do mesmo professor. */
  const swap = (e: Event): (() => void) | null => {
    const groups = [
      ...(e.shape.classIndex !== null ? [byClass[e.shape.classIndex]] : []),
      ...e.shape.teachers.map((t) => byTeacher[t]),
    ];
    const other = pick(pick(groups) ?? []);
    if (!other || other.shape === e.shape || other.slot === e.slot) return null;
    const a = e.slot;
    const b = other.slot;
    if (!allowed.get(e.shape)?.[b] || !allowed.get(other.shape)?.[a]) return null;
    place(e, a, -1);
    place(other, b, -1);
    if (occupancy.fits(e.shape, b)) {
      place(e, b, 1);
      if (occupancy.fits(other.shape, a)) {
        place(other, a, 1);
        e.slot = b;
        other.slot = a;
        return () => {
          place(e, b, -1);
          place(other, a, -1);
          place(e, a, 1);
          place(other, b, 1);
          e.slot = a;
          other.slot = b;
        };
      }
      place(e, b, -1);
    }
    place(e, a, 1);
    place(other, b, 1);
    return null;
  };

  const patience = Math.max(20000, 50 * movable.length);
  let current = metrics();
  let iterations = 0;
  let unchanged = 0;
  const finish = (reason: ImprovementReason): Improvement => {
    const output = (kind: TaskShape['kind']) =>
      events.flatMap((e) => {
        const slot = slots[e.slot];
        return e.shape.kind === kind && slot
          ? [{ id: e.shape.id, weekday: slot.weekday, periodId: slot.periodId }]
          : [];
      });
    return {
      proposal: {
        lessons: output('lesson').map((l) => ({
          assignmentId: l.id,
          weekday: l.weekday,
          periodId: l.periodId,
        })),
        planning: output('planning').map((p) => ({
          teacherId: p.id,
          weekday: p.weekday,
          periodId: p.periodId,
        })),
      },
      reason,
      visitedNodes: iterations,
    };
  };
  while (true) {
    if (iterations % 128 === 0) {
      if (control.cancelled()) return finish('cancelled');
      if (control.now() >= limits.deadline) return finish('time_limit');
    }
    if (current.every((value) => value === 0)) return finish('preferences_met');
    if (iterations >= limits.nodeLimit) return finish('node_limit');
    if (unchanged >= patience || !movable.length) return finish('local_optimum');
    iterations++;
    unchanged++;
    const event = pick(movable);
    if (!event) continue;
    const undo = nextRandom() < 2147483648 ? relocate(event) : swap(event);
    if (!undo) continue;
    const next = metrics();
    const difference = compare(next, current);
    if (difference > 0) undo();
    else {
      if (difference < 0) unchanged = 0;
      current = next;
    }
  }
}
