import { timeFromMinutes, type GridViewDto, type PlacementDto } from '@classorganizer/contracts';
import { compareNames } from './names.ts';

export const GRID_WEEKDAYS = [
  { value: 1, short: 'Seg', long: 'segunda' },
  { value: 2, short: 'Ter', long: 'terça' },
  { value: 3, short: 'Qua', long: 'quarta' },
  { value: 4, short: 'Qui', long: 'quinta' },
  { value: 5, short: 'Sex', long: 'sexta' },
] as const;
export type GridWeekday = (typeof GRID_WEEKDAYS)[number]['value'];

export interface GridRow {
  periodId: string;
  label: string;
  time: string;
}
/** Item de uma célula: a alocação e os textos já resolvidos. */
export interface GridItem {
  placement: PlacementDto;
  title: string;
  detail: string;
}
/** Bloco ou hora-atividade que ainda pode ser inserido. */
export interface GridCandidate {
  kind: PlacementDto['kind'];
  entityId: string;
  label: string;
  remaining: number;
}

export function placementKey(p: Pick<PlacementDto, 'kind' | 'entityId' | 'weekday' | 'periodId'>) {
  return [p.kind, p.entityId, p.weekday, p.periodId].join('|');
}
export function dayName(weekday: number): string {
  return GRID_WEEKDAYS.find((d) => d.value === weekday)?.long ?? 'dia ' + weekday;
}

/** Leitura da grade com nomes resolvidos; usa somente os dados da revisão. */
export function gridLookup(view: GridViewDto) {
  const { timetable } = view;
  const periods = new Map(timetable.periods.map((p) => [p.id, p]));
  const subjects = new Map(timetable.subjects.map((s) => [s.id, s.name]));
  const teachers = new Map(timetable.teachers.map((t) => [t.id, t]));
  const classGroups = new Map(timetable.classGroups.map((c) => [c.id, c]));
  const assignments = new Map(timetable.assignments.map((a) => [a.id, a]));
  const resources = new Map(timetable.resources.map((r) => [r.id, r.name]));
  const shifts = new Map(view.shifts.map((s) => [s.id, s]));

  function time(periodId: string): string {
    const period = periods.get(periodId);
    return period
      ? timeFromMinutes(period.startMinute) + '–' + timeFromMinutes(period.endMinute)
      : '';
  }
  function rows(periodIds: readonly string[]): GridRow[] {
    return periodIds.map((id) => {
      const period = periods.get(id);
      const shift = period ? shifts.get(period.shiftId) : undefined;
      const index = shift ? shift.periodIds.indexOf(id) : -1;
      return { periodId: id, label: index >= 0 ? `${index + 1}ª` : '?', time: time(id) };
    });
  }
  function subjectNames(assignmentId: string): string {
    const assignment = assignments.get(assignmentId);
    if (!assignment) return 'Bloco removido';
    return [...new Set(assignment.participants.map((p) => subjects.get(p.subjectId) ?? '?'))].join(
      ' + ',
    );
  }
  function teacherNames(assignmentId: string): string {
    return (assignments.get(assignmentId)?.participants ?? [])
      .map((p) => teachers.get(p.teacherId)?.name ?? '?')
      .join(', ');
  }
  /** Recursos especiais do bloco, com o separador; vazio na maioria dos blocos. */
  function resourceSuffix(assignmentId: string): string {
    const names = (assignments.get(assignmentId)?.resourceIds ?? []).map(
      (id) => resources.get(id) ?? '?',
    );
    return names.length ? ' · ' + names.join(', ') : '';
  }
  function className(assignmentId: string): string {
    const classGroupId = assignments.get(assignmentId)?.classGroupId;
    return (classGroupId && classGroups.get(classGroupId)?.name) || 'Turma removida';
  }
  /** Texto que identifica a alocação fora da célula (painéis e rótulos acessíveis). */
  function describe(p: PlacementDto): string {
    const what =
      p.kind === 'planning'
        ? 'Hora-atividade de ' + (teachers.get(p.entityId)?.name ?? 'professor removido')
        : subjectNames(p.entityId) +
          ' (' +
          className(p.entityId) +
          resourceSuffix(p.entityId) +
          ')';
    return what + ', ' + dayName(p.weekday) + ' ' + time(p.periodId);
  }
  function itemFor(p: PlacementDto, perspective: 'class' | 'teacher'): GridItem {
    if (p.kind === 'planning')
      return {
        placement: p,
        title: 'Hora-atividade',
        detail: teachers.get(p.entityId)?.name ?? '',
      };
    return {
      placement: p,
      title: subjectNames(p.entityId),
      detail:
        (perspective === 'class' ? teacherNames(p.entityId) : className(p.entityId)) +
        resourceSuffix(p.entityId),
    };
  }
  function lessonsOf(teacherId: string) {
    return timetable.assignments.filter((a) =>
      a.participants.some((p) => p.teacherId === teacherId),
    );
  }
  function count(kind: PlacementDto['kind'], entityId: string): number {
    return view.placements.filter((p) => p.kind === kind && p.entityId === entityId).length;
  }
  function candidates(scope: { classGroupId?: string; teacherId?: string }): GridCandidate[] {
    const list: GridCandidate[] = [];
    const blocks = scope.classGroupId
      ? timetable.assignments.filter((a) => a.classGroupId === scope.classGroupId)
      : scope.teacherId
        ? lessonsOf(scope.teacherId)
        : [];
    for (const a of blocks) {
      const remaining = a.weeklyLessons - count('lesson', a.id);
      if (remaining > 0)
        list.push({
          kind: 'lesson',
          entityId: a.id,
          label:
            subjectNames(a.id) +
            (scope.classGroupId ? ' · ' + teacherNames(a.id) : ' · ' + className(a.id)),
          remaining,
        });
    }
    const teacher = scope.teacherId ? teachers.get(scope.teacherId) : undefined;
    if (teacher) {
      const remaining = teacher.planningPeriods - count('planning', teacher.id);
      if (remaining > 0)
        list.push({ kind: 'planning', entityId: teacher.id, label: 'Hora-atividade', remaining });
    }
    return list;
  }
  /** Aulas exibidas na visão do professor: turnos em que ele atua; sem atuação, todos. */
  function teacherShifts(teacherId: string) {
    const used = new Set(
      lessonsOf(teacherId).map((a) => {
        const classGroup = classGroups.get(a.classGroupId);
        return classGroup ? periods.get(classGroup.periodIds[0] ?? '')?.shiftId : undefined;
      }),
    );
    for (const p of view.placements)
      if (p.kind === 'planning' && p.entityId === teacherId)
        used.add(periods.get(p.periodId)?.shiftId);
    const own = view.shifts.filter((s) => used.has(s.id));
    return own.length ? own : view.shifts;
  }
  function classItems(classGroupId: string, weekday: number, periodId: string): GridItem[] {
    return view.placements
      .filter(
        (p) =>
          p.kind === 'lesson' &&
          p.weekday === weekday &&
          p.periodId === periodId &&
          assignments.get(p.entityId)?.classGroupId === classGroupId,
      )
      .map((p) => itemFor(p, 'class'));
  }
  function teacherItems(teacherId: string, weekday: number, periodId: string): GridItem[] {
    const own = new Set(lessonsOf(teacherId).map((a) => a.id));
    return view.placements
      .filter(
        (p) =>
          p.weekday === weekday &&
          p.periodId === periodId &&
          (p.kind === 'planning' ? p.entityId === teacherId : own.has(p.entityId)),
      )
      .map((p) => itemFor(p, 'teacher'));
  }
  function unavailable(teacherId: string, weekday: number, periodId: string): boolean {
    return (teachers.get(teacherId)?.unavailable ?? []).some(
      (u) => u.weekday === weekday && u.periodId === periodId,
    );
  }
  /** Marca a célula citada por um problema: mesma entidade e mesma aula ou mesmo dia. */
  function hasProblem(p: PlacementDto): boolean {
    return view.diagnosis.problems.some(
      (issue) =>
        issue.entityIds.includes(p.entityId) &&
        (issue.entityIds.includes(p.periodId) || issue.message.includes(' ' + dayName(p.weekday))),
    );
  }
  return {
    periods,
    teachers,
    classGroups,
    rows,
    time,
    describe,
    candidates,
    teacherShifts,
    classItems,
    teacherItems,
    unavailable,
    hasProblem,
    sortedClassGroups: () =>
      [...timetable.classGroups].toSorted((a, b) => compareNames(a.name, b.name)),
    sortedTeachers: () => [...timetable.teachers].toSorted((a, b) => compareNames(a.name, b.name)),
    sortedSubjects: () => [...timetable.subjects].toSorted((a, b) => compareNames(a.name, b.name)),
  };
}
export type GridLookup = ReturnType<typeof gridLookup>;
