import type { TimetableIssue } from '../../timetable/domain/index.ts';
import { validateTimetableModel, validateTimetableProposal } from '../../timetable/domain/index.ts';
import { gridProposal, type TranslatedCatalog } from './catalog-translation.ts';
import type { Placement } from './grid.ts';

export interface TeacherLoad {
  readonly teacherId: string;
  readonly lessons: number;
  readonly requiredLessons: number;
  readonly planning: number;
  readonly requiredPlanning: number;
  readonly maxWeeklyLessons: number | null;
  /** Aulas vagas entre duas atividades do mesmo turno e dia; métrica descritiva. */
  readonly windows: number;
}
export interface ClassGroupLoad {
  readonly classGroupId: string;
  readonly lessons: number;
  readonly requiredLessons: number;
}
export interface GridDiagnosis {
  /** Problemas de modelagem impedem conferir a grade. */
  readonly model: readonly TimetableIssue[];
  /** Conflitos e regras violadas pelas alocações existentes. */
  readonly problems: readonly TimetableIssue[];
  /** O que falta para a grade ficar completa. */
  readonly pending: readonly TimetableIssue[];
  /** Avisos que não bloqueiam, como a carga máxima do professor (ADR 0008). */
  readonly alerts: readonly TimetableIssue[];
  readonly teachers: readonly TeacherLoad[];
  readonly classGroups: readonly ClassGroupLoad[];
}

function issueKey(issue: TimetableIssue): string {
  return JSON.stringify([issue.code, issue.entityIds, issue.message]);
}
/** Diferença de multiconjuntos: problemas que aparecem em `after` mais vezes que em `before`. */
export function issuesAdded(
  before: readonly TimetableIssue[],
  after: readonly TimetableIssue[],
): TimetableIssue[] {
  const counts = new Map<string, number>();
  for (const issue of before) counts.set(issueKey(issue), (counts.get(issueKey(issue)) ?? 0) + 1);
  return after.filter((issue) => {
    const left = counts.get(issueKey(issue)) ?? 0;
    counts.set(issueKey(issue), left - 1);
    return left <= 0;
  });
}

export function diagnoseGrid(
  translated: TranslatedCatalog,
  placements: readonly Placement[],
): GridDiagnosis {
  const { snapshot, proposal } = gridProposal(translated, placements);
  const model = validateTimetableModel(snapshot, { limits: false });
  const problems = model.length
    ? []
    : validateTimetableProposal(snapshot, proposal, { complete: false, limits: false });
  const pending = model.length
    ? []
    : issuesAdded(
        problems,
        validateTimetableProposal(snapshot, proposal, { complete: true, limits: false }),
      );

  const placedPerAssignment = new Map<string, number>();
  const busy = new Map<string, Set<string>>();
  const mark = (teacherId: string, p: Placement) => {
    const set = busy.get(teacherId) ?? new Set<string>();
    set.add(p.weekday + '|' + p.periodId);
    busy.set(teacherId, set);
  };
  const assignments = new Map(snapshot.assignments.map((a) => [a.id, a]));
  const planningPerTeacher = new Map<string, number>();
  for (const p of placements) {
    if (p.kind === 'lesson') {
      placedPerAssignment.set(p.entityId, (placedPerAssignment.get(p.entityId) ?? 0) + 1);
      for (const participant of assignments.get(p.entityId)?.participants ?? [])
        mark(participant.teacherId, p);
    } else {
      planningPerTeacher.set(p.entityId, (planningPerTeacher.get(p.entityId) ?? 0) + 1);
      mark(p.entityId, p);
    }
  }

  const alerts: TimetableIssue[] = [];
  const teachers = snapshot.teachers.map((teacher): TeacherLoad => {
    const own = snapshot.assignments.filter((a) =>
      a.participants.some((p) => p.teacherId === teacher.id),
    );
    const requiredLessons = own.reduce((sum, a) => sum + a.weeklyLessons, 0);
    if (teacher.maxWeeklyLessons !== null && requiredLessons > teacher.maxWeeklyLessons)
      alerts.push({
        code: 'load.max',
        message:
          teacher.name +
          ' tem ' +
          requiredLessons +
          ' aulas atribuídas, acima da carga máxima de ' +
          teacher.maxWeeklyLessons +
          '.',
        entityIds: [teacher.id],
      });
    const slots = busy.get(teacher.id) ?? new Set<string>();
    let windows = 0;
    for (const day of snapshot.weekdays)
      for (const shift of translated.shifts) {
        const used = shift.periodIds.flatMap((id, index) =>
          slots.has(day + '|' + id) ? [index] : [],
        );
        const first = used[0];
        const last = used.at(-1);
        if (first !== undefined && last !== undefined) windows += last - first + 1 - used.length;
      }
    return {
      teacherId: teacher.id,
      lessons: own.reduce((sum, a) => sum + (placedPerAssignment.get(a.id) ?? 0), 0),
      requiredLessons,
      planning: planningPerTeacher.get(teacher.id) ?? 0,
      requiredPlanning: teacher.planningPeriods,
      maxWeeklyLessons: teacher.maxWeeklyLessons,
      windows,
    };
  });
  const classGroups = snapshot.classGroups.map((c): ClassGroupLoad => {
    const own = snapshot.assignments.filter((a) => a.classGroupId === c.id);
    return {
      classGroupId: c.id,
      lessons: own.reduce((sum, a) => sum + (placedPerAssignment.get(a.id) ?? 0), 0),
      requiredLessons: own.reduce((sum, a) => sum + a.weeklyLessons, 0),
    };
  });
  return { model, problems, pending, alerts, teachers, classGroups };
}

/** Grade completa e sem problemas: condição para concluir a revisão. */
export function isGridComplete(diagnosis: GridDiagnosis): boolean {
  return !diagnosis.model.length && !diagnosis.problems.length && !diagnosis.pending.length;
}
