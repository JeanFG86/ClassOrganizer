import type {
  TimetableIssue,
  TimetablePeriod,
  TimetableProposal,
  TimetableSnapshot,
} from './model.ts';
import { validateTimetableModel } from './validate-model.ts';

const DAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta'];

interface ScheduledEvent {
  weekday: number;
  period: TimetablePeriod;
  teacherIds: readonly string[];
  classGroupId: string | null;
  resourceIds: readonly string[];
  sourceId: string;
}

/** Verificação independente: percorre a proposta sem usar estado nem funções da busca. */
export function validateTimetableProposal(
  snapshot: TimetableSnapshot,
  proposal: TimetableProposal,
  options: { complete?: boolean; limits?: boolean } = {},
): TimetableIssue[] {
  const issues = validateTimetableModel(snapshot, { limits: options.limits ?? true });
  if (issues.length) return issues;
  const fail = (code: string, message: string, ...entityIds: string[]) =>
    issues.push({ code, message, entityIds });
  const periods = new Map(snapshot.periods.map((p) => [p.id, p]));
  const assignments = new Map(snapshot.assignments.map((a) => [a.id, a]));
  const teachers = new Map(snapshot.teachers.map((t) => [t.id, t]));
  const classes = new Map(snapshot.classGroups.map((c) => [c.id, c]));
  const resources = new Map(snapshot.resources.map((r) => [r.id, r]));
  const subjects = new Map(snapshot.subjects.map((s) => [s.id, s.name]));
  const amount = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);
  const lessonCounts = new Map<string, number>();
  const planningCounts = new Map<string, number>();
  const seen = new Set<string>();
  const events: ScheduledEvent[] = [];
  const daily = new Map<string, TimetablePeriod[]>();
  const key = (kind: string, id: string, day: number, period: string) =>
    JSON.stringify([kind, id, day, period]);
  const day = (weekday: number) => DAY_NAMES[weekday - 1] ?? 'dia ' + weekday;
  const time = (p: TimetablePeriod) =>
    String(Math.floor(p.startMinute / 60)).padStart(2, '0') +
    ':' +
    String(p.startMinute % 60).padStart(2, '0');

  for (const lesson of proposal.lessons) {
    const a = assignments.get(lesson.assignmentId);
    const p = periods.get(lesson.periodId);
    if (!a || !p || !snapshot.weekdays.includes(lesson.weekday)) {
      fail(
        'placement.unknown',
        'A aula possui bloco, dia ou período desconhecido.',
        lesson.assignmentId,
      );
      continue;
    }
    const c = classes.get(a.classGroupId);
    if (!c?.periodIds.includes(p.id))
      fail(
        'placement.class_period',
        'O período não pertence às aulas da turma ' + (c?.name ?? a.classGroupId) + '.',
        a.id,
        a.classGroupId,
        p.id,
      );
    const placementKey = key('lesson', a.id, lesson.weekday, p.id);
    if (seen.has(placementKey))
      fail('placement.duplicate', 'A mesma aula foi incluída duas vezes no bloco.', a.id);
    seen.add(placementKey);
    lessonCounts.set(a.id, (lessonCounts.get(a.id) ?? 0) + 1);
    events.push({
      weekday: lesson.weekday,
      period: p,
      teacherIds: a.participants.map((t) => t.teacherId),
      classGroupId: a.classGroupId,
      resourceIds: a.resourceIds,
      sourceId: a.id,
    });
    // A mesma disciplina com dois docentes conta uma vez na turma.
    for (const subject of new Set(a.participants.map((t) => t.subjectId))) {
      const dailyKey = JSON.stringify([a.classGroupId, subject, lesson.weekday]);
      const list = daily.get(dailyKey) ?? [];
      list.push(p);
      daily.set(dailyKey, list);
    }
  }
  for (const planning of proposal.planning) {
    const t = teachers.get(planning.teacherId);
    const p = periods.get(planning.periodId);
    if (!t || !p || !snapshot.weekdays.includes(planning.weekday)) {
      fail(
        'placement.unknown',
        'A hora-atividade possui professor, dia ou período desconhecido.',
        planning.teacherId,
      );
      continue;
    }
    if (!t.planningPeriodIds.includes(p.id))
      fail(
        'planning.period',
        'A hora-atividade de ' + t.name + ' está fora dos períodos autorizados.',
        t.id,
        p.id,
      );
    const placementKey = key('planning', t.id, planning.weekday, p.id);
    if (seen.has(placementKey))
      fail('placement.duplicate', 'A mesma hora-atividade foi incluída duas vezes.', t.id);
    seen.add(placementKey);
    planningCounts.set(t.id, (planningCounts.get(t.id) ?? 0) + 1);
    events.push({
      weekday: planning.weekday,
      period: p,
      teacherIds: [t.id],
      classGroupId: null,
      resourceIds: [],
      sourceId: t.id,
    });
  }
  for (const a of snapshot.assignments) {
    const count = lessonCounts.get(a.id) ?? 0;
    if (count > a.weeklyLessons || (options.complete !== false && count !== a.weeklyLessons))
      fail(
        'load.lessons',
        'O bloco de ' +
          [...new Set(a.participants.map((p) => subjects.get(p.subjectId) ?? p.subjectId))].join(
            ' + ',
          ) +
          ' na turma ' +
          (classes.get(a.classGroupId)?.name ?? a.classGroupId) +
          ' exige ' +
          amount(a.weeklyLessons, 'aula', 'aulas') +
          '; a grade contém ' +
          count +
          '.',
        a.id,
      );
  }
  for (const t of snapshot.teachers) {
    const count = planningCounts.get(t.id) ?? 0;
    if (count > t.planningPeriods || (options.complete !== false && count !== t.planningPeriods))
      fail(
        'load.planning',
        'A hora-atividade de ' +
          t.name +
          ' exige ' +
          amount(t.planningPeriods, 'período', 'períodos') +
          '; a grade contém ' +
          count +
          '.',
        t.id,
      );
  }
  for (const event of events) {
    for (const id of event.teacherIds) {
      const teacher = teachers.get(id);
      if (
        teacher?.unavailable.some((u) => {
          const blocked = periods.get(u.periodId);
          return (
            u.weekday === event.weekday &&
            blocked &&
            event.period.startMinute < blocked.endMinute &&
            blocked.startMinute < event.period.endMinute
          );
        })
      )
        fail(
          'teacher.unavailable',
          (teacher?.name ?? id) +
            ' está indisponível na ' +
            day(event.weekday) +
            ', às ' +
            time(event.period) +
            '.',
          id,
          event.sourceId,
          event.period.id,
        );
    }
  }
  for (let i = 0; i < events.length; i++)
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];
      if (
        !a ||
        !b ||
        a.weekday !== b.weekday ||
        a.period.startMinute >= b.period.endMinute ||
        b.period.startMinute >= a.period.endMinute
      )
        continue;
      if (a.classGroupId && a.classGroupId === b.classGroupId)
        fail(
          'conflict.class',
          'A turma ' +
            (classes.get(a.classGroupId)?.name ?? a.classGroupId) +
            ' tem blocos sobrepostos na ' +
            day(a.weekday) +
            ', às ' +
            time(a.period) +
            '.',
          a.classGroupId,
          a.sourceId,
          b.sourceId,
        );
      for (const id of a.teacherIds.filter((id) => b.teacherIds.includes(id)))
        fail(
          'conflict.teacher',
          (teachers.get(id)?.name ?? id) +
            ' tem atividades sobrepostas na ' +
            day(a.weekday) +
            ', às ' +
            time(a.period) +
            '.',
          id,
          a.sourceId,
          b.sourceId,
        );
      for (const id of a.resourceIds.filter((id) => b.resourceIds.includes(id)))
        fail(
          'conflict.resource',
          'O recurso ' +
            (resources.get(id)?.name ?? id) +
            ' está ocupado por dois blocos na ' +
            day(a.weekday) +
            ', às ' +
            time(a.period) +
            '.',
          id,
          a.sourceId,
          b.sourceId,
        );
    }
  for (const rule of snapshot.subjectRules)
    for (const day of snapshot.weekdays) {
      const list = daily.get(JSON.stringify([rule.classGroupId, rule.subjectId, day])) ?? [];
      if (list.length > rule.maxPerDay)
        fail(
          'subject.daily_limit',
          'A disciplina ultrapassa o limite diário na turma ' +
            (classes.get(rule.classGroupId)?.name ?? rule.classGroupId) +
            '.',
          rule.classGroupId,
          rule.subjectId,
        );
      if (rule.consecutive && list.length === 2) {
        const [a, b] = list.toSorted((a, b) => a.startMinute - b.startMinute);
        if (a && b && a.endMinute !== b.startMinute)
          fail(
            'subject.consecutive',
            'As aulas geminadas precisam ser consecutivas, sem atravessar intervalo.',
            rule.classGroupId,
            rule.subjectId,
          );
      }
    }
  for (const f of snapshot.fixedLessons)
    if (
      !proposal.lessons.some(
        (p) =>
          p.assignmentId === f.assignmentId && p.weekday === f.weekday && p.periodId === f.periodId,
      )
    )
      fail('fixed.lesson', 'Uma aula fixada não foi preservada.', f.assignmentId, f.periodId);
  for (const f of snapshot.fixedPlanning)
    if (
      !proposal.planning.some(
        (p) => p.teacherId === f.teacherId && p.weekday === f.weekday && p.periodId === f.periodId,
      )
    )
      fail(
        'fixed.planning',
        'Uma hora-atividade fixada não foi preservada.',
        f.teacherId,
        f.periodId,
      );
  return issues;
}

/** Métrica descritiva de minutos vagos entre atividades; não representa um ótimo. */
export function measureTeacherIdleMinutes(
  snapshot: TimetableSnapshot,
  proposal: TimetableProposal,
): number {
  const periods = new Map(snapshot.periods.map((p) => [p.id, p]));
  let total = 0;
  for (const t of snapshot.teachers)
    for (const day of snapshot.weekdays) {
      const ownAssignments = new Set(
        snapshot.assignments
          .filter((a) => a.participants.some((p) => p.teacherId === t.id))
          .map((a) => a.id),
      );
      const own = [
        ...proposal.lessons.filter((p) => ownAssignments.has(p.assignmentId)),
        ...proposal.planning.filter((p) => p.teacherId === t.id),
      ]
        .filter((p) => p.weekday === day)
        .flatMap((p) => {
          const period = periods.get(p.periodId);
          return period ? [period] : [];
        })
        .sort((a, b) => a.startMinute - b.startMinute);
      for (let i = 1; i < own.length; i++) {
        const previous = own[i - 1];
        const current = own[i];
        if (previous && current) total += Math.max(0, current.startMinute - previous.endMinute);
      }
    }
  return total;
}
