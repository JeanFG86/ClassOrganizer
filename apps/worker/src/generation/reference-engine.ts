import type {
  EngineSearchResult,
  GenerationOptions,
  TimetableIssue,
  TimetableProposal,
  TimetableSnapshot,
} from '@classorganizer/core';

interface Slot {
  weekday: 1 | 2 | 3 | 4 | 5;
  periodId: string;
  start: number;
  end: number;
}
interface Task {
  kind: 'lesson' | 'planning';
  id: string;
  teachers: number[];
  resources: number[];
  classIndex: number | null;
  ruleIndexes: number[];
  candidates: number[];
  remaining: number;
  last: number;
  tie: number;
}
interface Frame {
  task: Task;
  candidates: number[];
  cursor: number;
  selected: number | null;
  previousLast: number;
}
export interface SearchControl {
  now: () => number;
  cancelled: () => boolean;
}

/** Busca completa com retrocesso, menor domínio primeiro e eliminação de permutações. */
function searchAttempt(
  snapshot: TimetableSnapshot,
  options: GenerationOptions,
  control: SearchControl,
): EngineSearchResult {
  const started = control.now();
  const deadline = started + options.timeLimitMs;
  let visitedNodes = 0;
  let backtracks = 0;
  const result = (
    status: EngineSearchResult['status'],
    reason: string,
    proposal: TimetableProposal | null = null,
    diagnostics: readonly TimetableIssue[] = [],
  ): EngineSearchResult => ({
    status,
    reason,
    proposal,
    diagnostics,
    elapsedMs: Math.max(0, control.now() - started),
    visitedNodes,
    backtracks,
    restarts: 0,
  });
  const interrupted = (): EngineSearchResult | null => {
    if (control.cancelled()) return result('cancelled', 'cancelled');
    if (control.now() >= deadline) return result('inconclusive', 'time_limit');
    return null;
  };
  const stopped = interrupted();
  if (stopped) return stopped;
  let random = options.seed >>> 0;
  const nextRandom = () => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random;
  };
  const periods = snapshot.periods.toSorted(
    (a, b) => a.startMinute - b.startMinute || a.id.localeCompare(b.id),
  );
  const slots: Slot[] = snapshot.weekdays
    .toSorted()
    .flatMap((weekday) =>
      periods.map((p) => ({ weekday, periodId: p.id, start: p.startMinute, end: p.endMinute })),
    );
  const slotIndex = new Map(slots.map((s, i) => [JSON.stringify([s.weekday, s.periodId]), i]));
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
  const teacherBusy = snapshot.teachers.map(() => new Uint16Array(slots.length));
  const classBusy = snapshot.classGroups.map(() => new Uint16Array(slots.length));
  const resourceBusy = snapshot.resources.map(() => new Uint16Array(slots.length));
  const daily = snapshot.subjectRules.map(() => Array.from({ length: 5 }, () => [] as number[]));
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
  const tasks: Task[] = [];
  for (const a of snapshot.assignments) {
    const stop = interrupted();
    if (stop) return stop;
    const teachers = a.participants.map((p) => indexOf(teacherIndexes, p.teacherId));
    const allowed = new Set(classById.get(a.classGroupId)?.periodIds);
    tasks.push({
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
      remaining: a.weeklyLessons,
      last: -1,
      tie: nextRandom(),
    });
  }
  for (const [index, t] of snapshot.teachers.entries())
    if (t.planningPeriods > 0) {
      tasks.push({
        kind: 'planning',
        id: t.id,
        teachers: [index],
        resources: [],
        classIndex: null,
        ruleIndexes: [],
        candidates: slots.flatMap((s, i) =>
          t.planningPeriodIds.includes(s.periodId) && available[index]?.[i] ? [i] : [],
        ),
        remaining: t.planningPeriods,
        last: -1,
        tie: nextRandom(),
      });
    }
  const fits = (task: Task, index: number): boolean => {
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
  };
  const placed: { task: Task; slot: number }[] = [];
  const occupy = (task: Task, index: number, change: 1 | -1) => {
    const slot = slots[index];
    if (!slot) throw new Error('Período ausente.');
    const counters = [
      ...task.teachers.map((i) => teacherBusy[i]),
      ...task.resources.map((i) => resourceBusy[i]),
    ];
    if (task.classIndex !== null) counters.push(classBusy[task.classIndex]);
    for (const counter of counters)
      if (counter)
        for (const other of conflicts[index] ?? []) counter[other] = (counter[other] ?? 0) + change;
    for (const i of task.ruleIndexes) {
      const list = daily[i]?.[slot.weekday - 1];
      if (change === 1) list?.push(index);
      else list?.pop();
    }
    task.remaining -= change;
    if (change === 1) placed.push({ task, slot: index });
    else placed.pop();
  };
  const fixed = [
    ...snapshot.fixedLessons.map((f) => ({ ...f, kind: 'lesson', id: f.assignmentId })),
    ...snapshot.fixedPlanning.map((f) => ({ ...f, kind: 'planning', id: f.teacherId })),
  ];
  for (const f of fixed) {
    const task = tasks.find((t) => t.kind === f.kind && t.id === f.id);
    const index = slotIndex.get(JSON.stringify([f.weekday, f.periodId]));
    if (
      !task ||
      index === undefined ||
      !task.candidates.includes(index) ||
      task.remaining <= 0 ||
      !fits(task, index)
    )
      return result('infeasible', 'fixed_conflict', null, [
        {
          code: 'fixed.conflict',
          message: 'As fixações são incompatíveis com a carga ou a disponibilidade.',
          entityIds: [f.id],
        },
      ]);
    occupy(task, index, 1);
  }
  // Limites superiores por turma e professor dão provas simples antes da busca.
  for (const [i, c] of snapshot.classGroups.entries()) {
    const required = tasks
      .filter((t) => t.classIndex === i)
      .reduce((sum, t) => sum + t.remaining, 0);
    const capacity = slots.filter(
      (s, index) => c.periodIds.includes(s.periodId) && !classBusy[i]?.[index],
    ).length;
    if (required > capacity)
      return result('infeasible', 'class_capacity', null, [
        {
          code: 'capacity.class',
          message: 'A carga excede os horários disponíveis da turma ' + c.name + '.',
          entityIds: [c.id],
        },
      ]);
  }
  for (const [i, teacher] of snapshot.teachers.entries()) {
    const own = tasks.filter((t) => t.teachers.includes(i));
    const required = own.reduce((sum, t) => sum + t.remaining, 0);
    const candidateIds = new Set(
      own.flatMap((t) => t.candidates).filter((index) => !teacherBusy[i]?.[index]),
    );
    let capacity = 0;
    for (const day of snapshot.weekdays) {
      let end = -1;
      for (const s of [...candidateIds]
        .flatMap((index) => (slots[index] ? [slots[index]] : []))
        .filter((s) => s !== undefined && s.weekday === day)
        .sort((a, b) => a.end - b.end))
        if (s.start >= end) {
          capacity++;
          end = s.end;
        }
    }
    if (required > capacity)
      return result('infeasible', 'teacher_capacity', null, [
        {
          code: 'capacity.teacher',
          message:
            'A carga e a hora-atividade excedem os horários disponíveis de ' + teacher.name + '.',
          entityIds: [teacher.id],
        },
      ]);
  }
  const frames: Frame[] = [];
  let descending = true;
  while (true) {
    const stop = interrupted();
    if (stop) return stop;
    if (descending) {
      let choice: Frame | null = null;
      let deadEnd = false;
      const domains = new Map<Task, number[]>();
      for (const task of tasks)
        if (task.remaining > 0) {
          const candidates = task.candidates.filter(
            (index) => index > task.last && fits(task, index),
          );
          domains.set(task, candidates);
          if (candidates.length < task.remaining) {
            deadEnd = true;
            break;
          }
          if (
            !choice ||
            candidates.length - task.remaining < choice.candidates.length - choice.task.remaining ||
            (candidates.length - task.remaining ===
              choice.candidates.length - choice.task.remaining &&
              task.tie < choice.task.tie)
          )
            choice = { task, candidates, cursor: 0, selected: null, previousLast: task.last };
        }
      if (!deadEnd && !choice) {
        const lessons = placed.flatMap(({ task, slot }) => {
          const s = slots[slot];
          return task.kind === 'lesson' && s
            ? [{ assignmentId: task.id, weekday: s.weekday, periodId: s.periodId }]
            : [];
        });
        const planning = placed.flatMap(({ task, slot }) => {
          const s = slots[slot];
          return task.kind === 'planning' && s
            ? [{ teacherId: task.id, weekday: s.weekday, periodId: s.periodId }]
            : [];
        });
        return result('feasible', 'solution', { lessons, planning });
      }
      if (!deadEnd && choice) {
        const selected = choice;
        const related = [...domains].filter(
          ([other]) =>
            other !== selected.task &&
            ((selected.task.classIndex !== null && other.classIndex === selected.task.classIndex) ||
              other.teachers.some((t) => selected.task.teachers.includes(t)) ||
              other.resources.some((r) => selected.task.resources.includes(r))),
        );
        const scored = selected.candidates
          .filter((_, position) => selected.candidates.length - position >= selected.task.remaining)
          .map((index) => {
            const slot = slots[index];
            let score = 0;
            if (!slot) return { index, score: Number.POSITIVE_INFINITY };
            for (const [other, domain] of related) {
              const commonRules = other.ruleIndexes.filter((r) =>
                selected.task.ruleIndexes.includes(r),
              );
              let lost = 0;
              for (const candidate of domain) {
                const otherSlot = slots[candidate];
                if (!otherSlot) continue;
                let blocked = conflicts[index]?.includes(candidate) ?? false;
                if (!blocked && otherSlot.weekday === slot.weekday)
                  for (const r of commonRules) {
                    const rule = snapshot.subjectRules[r];
                    const count = daily[r]?.[slot.weekday - 1]?.length ?? 0;
                    if (
                      rule &&
                      (count + 1 >= rule.maxPerDay ||
                        (rule.consecutive &&
                          slot.end !== otherSlot.start &&
                          otherSlot.end !== slot.start))
                    )
                      blocked = true;
                  }
                if (blocked) lost++;
              }
              score += (lost * other.remaining) / domain.length;
            }
            return { index, score };
          });
        selected.candidates = scored
          .sort((a, b) => a.score - b.score || a.index - b.index)
          .map((c) => c.index);
        frames.push(selected);
      }
    }
    const frame = frames.at(-1);
    if (!frame)
      return result('infeasible', 'exhausted', null, [
        {
          code: 'search.exhausted',
          message:
            'Todas as combinações permitidas pelo modelo foram examinadas sem encontrar uma grade.',
          entityIds: [],
        },
      ]);
    if (frame.selected !== null) {
      occupy(frame.task, frame.selected, -1);
      frame.task.last = frame.previousLast;
      frame.selected = null;
      backtracks++;
    }
    const candidate = frame.candidates[frame.cursor++];
    if (candidate === undefined) {
      frames.pop();
      descending = false;
      continue;
    }
    if (visitedNodes >= options.nodeLimit) return result('inconclusive', 'node_limit');
    frame.previousLast = frame.task.last;
    frame.selected = candidate;
    occupy(frame.task, candidate, 1);
    frame.task.last = candidate;
    visitedNodes++;
    descending = true;
  }
}

/** Reinícios determinísticos reduzem a dependência da primeira ordem de escolhas.
 * Só uma tentativa esgotada pode provar inviabilidade; limites valem para o conjunto.
 */
export function solveReference(
  snapshot: TimetableSnapshot,
  options: GenerationOptions,
  control: SearchControl,
): EngineSearchResult {
  const started = control.now();
  let visitedNodes = 0;
  let backtracks = 0;
  let restarts = 0;
  let attempted = false;
  while (true) {
    const remainingMs = options.timeLimitMs - (control.now() - started);
    const remainingNodes = options.nodeLimit - visitedNodes;
    const cancelled = control.cancelled();
    if (cancelled || remainingMs <= 0 || remainingNodes <= 0)
      return {
        status: cancelled ? 'cancelled' : 'inconclusive',
        reason: cancelled ? 'cancelled' : remainingMs <= 0 ? 'time_limit' : 'node_limit',
        proposal: null,
        diagnostics: [],
        elapsedMs: Math.max(0, control.now() - started),
        visitedNodes,
        backtracks,
        restarts,
      };
    if (attempted) restarts++;
    attempted = true;
    const slice = Math.min(remainingNodes, 2000 * 2 ** Math.min(10, Math.floor(restarts / 4)));
    const result = searchAttempt(
      snapshot,
      {
        ...options,
        timeLimitMs: remainingMs,
        nodeLimit: slice,
        seed: (options.seed + restarts) >>> 0,
      },
      control,
    );
    visitedNodes += result.visitedNodes;
    backtracks += result.backtracks;
    if (result.status !== 'inconclusive' || result.reason !== 'node_limit')
      return {
        ...result,
        elapsedMs: Math.max(0, control.now() - started),
        visitedNodes,
        backtracks,
        restarts,
      };
  }
}
