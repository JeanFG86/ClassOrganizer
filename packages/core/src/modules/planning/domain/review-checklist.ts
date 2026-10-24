import { WEEKDAYS } from '../../../shared/weekdays.ts';
import { translateCatalog } from './catalog-translation.ts';
import { canonicalJson } from './generation-run.ts';
import type { JsonValue, PlanningRevision } from './planning.ts';
import {
  REVIEW_ITEMS,
  REVIEW_ITEM_TEXTS,
  isRevisionReviewed,
  type ReviewItem,
} from './review-items.ts';

export interface ChecklistChange {
  readonly kind: 'added' | 'removed' | 'changed';
  readonly label: string;
  /** Campos alterados, quando o registro existe nas duas revisões. */
  readonly fields: readonly string[];
}
export interface ChecklistEntry {
  readonly item: ReviewItem;
  readonly title: string;
  readonly description: string;
  readonly reviewed: boolean;
  /** Dados que merecem atenção nesta revisão; não impedem a conclusão. */
  readonly attention: readonly string[];
  /** Diferenças em relação à revisão de referência. */
  readonly changes: readonly ChecklistChange[];
}
export interface ChecklistReference {
  readonly revision: PlanningRevision;
  /** Identificação legível, como "revisão 2" ou "Plano 2026, revisão 3". */
  readonly label: string;
}
export interface ReviewChecklist {
  readonly reference: { readonly id: string; readonly label: string } | null;
  readonly complete: boolean;
  readonly items: readonly ChecklistEntry[];
}

type Row = Record<string, unknown>;
function rows(items: readonly JsonValue[] | undefined): Row[] {
  return (items ?? []).flatMap((item) =>
    item && typeof item === 'object' && !Array.isArray(item) ? [item as Row] : [],
  );
}
function text(row: Row | undefined, key: string): string {
  const value = row?.[key];
  return typeof value === 'string' ? value : '';
}
function list(row: Row | undefined, key: string): unknown[] {
  const value = row?.[key];
  return Array.isArray(value) ? value : [];
}
function active(row: Row): boolean {
  return row['archivedAt'] === null || row['archivedAt'] === undefined;
}
function byId(items: readonly Row[]): Map<string, Row> {
  return new Map(items.map((row) => [text(row, 'id'), row]));
}
function plural(count: number, one: string, many: string): string {
  return count + ' ' + (count === 1 ? one : many);
}

/** Campos comparados de cada cadastro, com o nome mostrado à secretaria. */
type FieldLabels = Readonly<Record<string, string>>;
const SUBJECT_FIELDS: FieldLabels = { name: 'nome', archivedAt: 'arquivamento' };
const SHIFT_FIELDS: FieldLabels = { name: 'nome', periods: 'horários', archivedAt: 'arquivamento' };
const CLASS_GROUP_FIELDS: FieldLabels = {
  name: 'nome',
  shiftId: 'turno',
  periodIds: 'aulas usadas',
  archivedAt: 'arquivamento',
};
const TEACHER_FIELDS: FieldLabels = {
  name: 'nome',
  subjectIds: 'disciplinas',
  maxWeeklyLessons: 'carga máxima',
  archivedAt: 'arquivamento',
};
const AVAILABILITY_FIELDS: FieldLabels = {
  unavailable: 'horários indisponíveis',
  planningPeriods: 'hora-atividade',
};
const ASSIGNMENT_FIELDS: FieldLabels = {
  classGroupId: 'turma',
  participants: 'professores e disciplinas',
  weeklyLessons: 'aulas por semana',
  resourceIds: 'recursos',
};
const RESOURCE_FIELDS: FieldLabels = { name: 'nome', archivedAt: 'arquivamento' };

/**
 * Registros acrescentados, removidos ou com algum dos campos informados alterado. Versões,
 * datas e chaves de busca não representam mudanças nos dados da escola.
 */
function changesOf(
  before: readonly Row[],
  after: readonly Row[],
  fields: FieldLabels,
  label: (row: Row) => string,
  include: { added: boolean; removed: boolean } = { added: true, removed: true },
): ChecklistChange[] {
  const old = byId(before);
  const next = byId(after);
  const changes: ChecklistChange[] = [];
  for (const id of new Set([...old.keys(), ...next.keys()])) {
    const from = old.get(id);
    const to = next.get(id);
    if (!from || !to) {
      const row = to ?? from;
      if (row && (to ? include.added : include.removed))
        changes.push({ kind: to ? 'added' : 'removed', label: label(row), fields: [] });
      continue;
    }
    const changed = Object.entries(fields).flatMap(([key, name]) =>
      canonicalJson(from[key]) === canonicalJson(to[key]) ? [] : [name],
    );
    if (changed.length) changes.push({ kind: 'changed', label: label(to), fields: changed });
  }
  return changes.toSorted((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

/** Nomes e rótulos da fotografia, incluindo registros arquivados. */
function catalogNames(revision: PlanningRevision) {
  const { snapshot } = revision;
  const names = new Map<string, string>();
  for (const section of [
    snapshot.subjects,
    snapshot.teachers,
    snapshot.classGroups,
    snapshot.shifts,
    snapshot.resources,
  ])
    for (const row of rows(section)) names.set(text(row, 'id'), text(row, 'name'));
  const nameOf = (id: unknown) => (typeof id === 'string' ? (names.get(id) ?? '?') : '?');
  const assignmentLabel = (row: Row) => {
    const participants = rows(list(row, 'participants') as JsonValue[]);
    const subjects = [...new Set(participants.map((p) => nameOf(p['subjectId'])))];
    const teachers = [...new Set(participants.map((p) => nameOf(p['teacherId'])))];
    return [nameOf(row['classGroupId']), subjects.join(' + '), teachers.join(' + ')].join(' · ');
  };
  return { nameOf, assignmentLabel };
}

function catalogChanges(revision: PlanningRevision, reference: PlanningRevision) {
  const { assignmentLabel } = catalogNames(revision);
  const previous = catalogNames(reference);
  const after = revision.snapshot;
  const before = reference.snapshot;
  const named = (prefix: string) => (row: Row) => prefix + ' ' + text(row, 'name');
  const teachersBefore = rows(before.teachers);
  const teachersAfter = rows(after.teachers);
  const assignmentsAfter = new Set(rows(after.assignments).map((row) => text(row, 'id')));
  return {
    structure: [
      ...changesOf(
        rows(before.subjects),
        rows(after.subjects),
        SUBJECT_FIELDS,
        named('Disciplina'),
      ),
      ...changesOf(rows(before.shifts), rows(after.shifts), SHIFT_FIELDS, named('Turno')),
      ...changesOf(
        rows(before.classGroups),
        rows(after.classGroups),
        CLASS_GROUP_FIELDS,
        named('Turma'),
      ),
    ],
    teachers: changesOf(teachersBefore, teachersAfter, TEACHER_FIELDS, named('Professor')),
    // Professor novo precisa de disponibilidade conferida; o removido aparece em professores.
    availability: changesOf(
      teachersBefore,
      teachersAfter,
      AVAILABILITY_FIELDS,
      named('Professor'),
      {
        added: true,
        removed: false,
      },
    ),
    assignments: [
      ...changesOf(
        rows(before.assignments),
        rows(after.assignments),
        ASSIGNMENT_FIELDS,
        // Um bloco removido só existe na fotografia de referência, com os nomes de lá.
        (row) =>
          'Atribuição ' +
          (assignmentsAfter.has(text(row, 'id'))
            ? assignmentLabel(row)
            : previous.assignmentLabel(row)),
      ),
      ...changesOf(
        rows(before.resources),
        rows(after.resources),
        RESOURCE_FIELDS,
        named('Recurso'),
      ),
    ],
    rules: rulesChanges(reference, revision),
  };
}

function rulesChanges(reference: PlanningRevision, revision: PlanningRevision): ChecklistChange[] {
  const before = reference.gridRules;
  const after = revision.gridRules;
  const changes: ChecklistChange[] = [];
  const changed = (label: string, a: unknown, b: unknown) => {
    if (canonicalJson(a) !== canonicalJson(b)) changes.push({ kind: 'changed', label, fields: [] });
  };
  changed('Onde cumprir a hora-atividade', before.planningPeriods, after.planningPeriods);
  changed('Limite diário por disciplina', before.daily, after.daily);
  changed('Exceções por turma e disciplina', before.dailyExceptions, after.dailyExceptions);
  return changes;
}

/**
 * Pontos de atenção calculados a partir da fotografia: dados que ficam fora da grade ou que
 * provavelmente precisam de ajuste. São avisos; a conclusão continua exigindo a grade completa.
 */
function attentionPoints(revision: PlanningRevision): Record<ReviewItem, string[]> {
  const { snapshot } = revision;
  const { nameOf, assignmentLabel } = catalogNames(revision);
  const translated = translateCatalog(snapshot, revision.gridRules, revision.id);
  const { timetable } = translated;
  const inGrid = new Map(timetable.classGroups.map((c) => [c.id, c]));
  const applicable = new Set(timetable.assignments.map((a) => a.id));
  const shifts = rows(snapshot.shifts);
  const classGroups = rows(snapshot.classGroups);
  const activeClasses = new Set(classGroups.filter(active).map((row) => text(row, 'id')));
  const teachers = rows(snapshot.teachers);
  const activeTeachers = new Set(teachers.filter(active).map((row) => text(row, 'id')));
  const resources = byId(rows(snapshot.resources));
  const assignments = rows(snapshot.assignments);
  const result: Record<ReviewItem, string[]> = {
    structure: [],
    teachers: [],
    assignments: [],
    availability: [],
    rules: [],
  };

  for (const shift of shifts.filter(active))
    if (!list(shift, 'periods').length)
      result.structure.push('Turno ' + text(shift, 'name') + ' não tem horários cadastrados.');
  for (const group of classGroups.filter(active)) {
    const id = text(group, 'id');
    if (!inGrid.has(id))
      result.structure.push(
        'Turma ' + text(group, 'name') + ' não tem turno ou aulas definidos e fica fora da grade.',
      );
    else if (!timetable.assignments.some((a) => a.classGroupId === id))
      result.structure.push('Turma ' + text(group, 'name') + ' não tem atribuições.');
  }

  for (const assignment of assignments) {
    if (applicable.has(text(assignment, 'id'))) {
      const archived = list(assignment, 'resourceIds').filter((id) => {
        const resource = typeof id === 'string' ? resources.get(id) : undefined;
        return resource !== undefined && !active(resource);
      });
      if (archived.length)
        result.assignments.push(
          'Atribuição ' +
            assignmentLabel(assignment) +
            ' reserva recurso arquivado (' +
            archived.map(nameOf).join(', ') +
            '), que não ocupa horários.',
        );
      continue;
    }
    const classGroupId = text(assignment, 'classGroupId');
    const absent = rows(list(assignment, 'participants') as JsonValue[])
      .map((p) => text(p, 'teacherId'))
      .filter((id) => !activeTeachers.has(id));
    const reason = !activeClasses.has(classGroupId)
      ? 'turma arquivada'
      : !inGrid.has(classGroupId)
        ? 'turma sem turno ou aulas'
        : 'professor arquivado (' + [...new Set(absent.map(nameOf))].join(', ') + ')';
    result.assignments.push(
      'Atribuição ' + assignmentLabel(assignment) + ' fica fora da grade: ' + reason + '.',
    );
  }
  for (const group of timetable.classGroups) {
    const assigned = timetable.assignments
      .filter((a) => a.classGroupId === group.id)
      .reduce((sum, a) => sum + a.weeklyLessons, 0);
    const slots = group.periodIds.length * WEEKDAYS.length;
    if (assigned && assigned !== slots)
      result.assignments.push(
        'Turma ' +
          group.name +
          ' tem ' +
          plural(assigned, 'aula atribuída', 'aulas atribuídas') +
          ' para ' +
          plural(slots, 'horário', 'horários') +
          ' na semana.',
      );
  }

  for (const teacher of timetable.teachers) {
    const own = timetable.assignments.filter((a) =>
      a.participants.some((p) => p.teacherId === teacher.id),
    );
    const lessons = own.reduce((sum, a) => sum + a.weeklyLessons, 0);
    if (!teacher.subjectIds.length)
      result.teachers.push('Professor ' + teacher.name + ' não tem disciplinas habilitadas.');
    if (!own.length)
      result.teachers.push('Professor ' + teacher.name + ' não tem atribuições nesta revisão.');
    if (teacher.maxWeeklyLessons !== null && lessons > teacher.maxWeeklyLessons)
      result.teachers.push(
        'Professor ' +
          teacher.name +
          ' tem ' +
          plural(lessons, 'aula atribuída', 'aulas atribuídas') +
          ', acima da carga máxima de ' +
          teacher.maxWeeklyLessons +
          '.',
      );
    if (!lessons && !teacher.planningPeriods) continue;
    // Limite superior: aulas usadas pelas turmas do professor e horários aceitos para HA.
    const usable = new Set([
      ...own.flatMap((a) => inGrid.get(a.classGroupId)?.periodIds ?? []),
      ...(teacher.planningPeriods ? teacher.planningPeriodIds : []),
    ]);
    const blocked = new Set(teacher.unavailable.map((s) => s.weekday + '|' + s.periodId));
    let free = 0;
    for (const weekday of WEEKDAYS)
      for (const periodId of usable) if (!blocked.has(weekday + '|' + periodId)) free += 1;
    const needed = lessons + teacher.planningPeriods;
    if (free < needed)
      result.availability.push(
        'Professor ' +
          teacher.name +
          ' precisa de ' +
          plural(needed, 'horário', 'horários') +
          ' (aulas e hora-atividade), mas tem ' +
          plural(free, 'horário disponível', 'horários disponíveis') +
          ' nos turnos em que pode atuar.',
      );
  }

  const taught = new Set(
    timetable.assignments.flatMap((a) =>
      a.participants.map((p) => a.classGroupId + '|' + p.subjectId),
    ),
  );
  for (const exception of revision.gridRules.dailyExceptions)
    if (!taught.has(exception.classGroupId + '|' + exception.subjectId))
      result.rules.push(
        'A exceção do limite diário para ' +
          nameOf(exception.classGroupId) +
          ' · ' +
          nameOf(exception.subjectId) +
          ' não tem atribuição correspondente nesta revisão.',
      );
  return result;
}

/**
 * Checklist da revisão: cada item com o que foi conferido, os pontos de atenção da fotografia e
 * as diferenças em relação à referência (revisão anterior ou origem da cópia).
 */
export function reviewChecklist(
  revision: PlanningRevision,
  reference: ChecklistReference | null,
): ReviewChecklist {
  const attention = attentionPoints(revision);
  const changes = reference ? catalogChanges(revision, reference.revision) : null;
  return {
    reference: reference ? { id: reference.revision.id, label: reference.label } : null,
    complete: isRevisionReviewed(revision),
    items: REVIEW_ITEMS.map((item) => ({
      item,
      ...REVIEW_ITEM_TEXTS[item],
      reviewed: revision.reviewedItems.includes(item),
      attention: attention[item],
      changes: changes?.[item] ?? [],
    })),
  };
}
