import { WEEKDAYS, isWeekday } from '../../../shared/weekdays.ts';
import type {
  DailySubjectRule,
  TimetablePeriod,
  TimetableProposal,
  TimetableSnapshot,
  TimetableTeacher,
} from '../../timetable/domain/model.ts';
import type { GridRules, GridSlot, Placement } from './grid.ts';
import { PlanningError } from './planning-error.ts';
import type { CatalogSnapshot } from './planning.ts';

/** Turno aplicável, com suas aulas na ordem do dia. */
export interface GridShift {
  readonly id: string;
  readonly name: string;
  readonly periodIds: readonly string[];
}
/** Cadastros da fotografia traduzidos para o validador, sem fixações. */
export interface TranslatedCatalog {
  readonly timetable: TimetableSnapshot;
  readonly shifts: readonly GridShift[];
}

function invalid(): never {
  throw new PlanningError(
    'planning.snapshot_invalid',
    'A fotografia desta revisão está em um formato desconhecido.',
  );
}
type Row = Record<string, unknown>;
function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) invalid();
  return value.map((item: unknown) =>
    typeof item === 'object' && item !== null && !Array.isArray(item) ? (item as Row) : invalid(),
  );
}
function text(row: Row, key: string): string {
  const value = row[key];
  return typeof value === 'string' ? value : invalid();
}
function integer(row: Row, key: string): number {
  const value = row[key];
  return typeof value === 'number' && Number.isInteger(value) ? value : invalid();
}
function active(row: Row): boolean {
  const value = row['archivedAt'];
  if (value !== null && typeof value !== 'string') invalid();
  return value === null;
}
function texts(row: Row, key: string): string[] {
  const value = row[key];
  if (!Array.isArray(value)) invalid();
  return value.map((item: unknown) => (typeof item === 'string' ? item : invalid()));
}

/**
 * Seleciona os registros aplicáveis da fotografia e monta o snapshot do validador (ADR 0013).
 * Lê o JSON com verificações próprias: a fotografia não é confiada cegamente.
 */
export function translateCatalog(
  catalog: CatalogSnapshot,
  rules: GridRules,
  revisionId: string,
): TranslatedCatalog {
  const shiftRows = rows(catalog.shifts).filter(active);
  const shiftPeriods = new Map(
    shiftRows.map((shift) => [
      text(shift, 'id'),
      rows(shift['periods'])
        .map((p): TimetablePeriod => ({
          id: text(p, 'id'),
          shiftId: text(shift, 'id'),
          startMinute: integer(p, 'startMinute'),
          endMinute: integer(p, 'endMinute'),
        }))
        .toSorted((a, b) => a.startMinute - b.startMinute),
    ]),
  );
  const classGroups = rows(catalog.classGroups)
    .filter(active)
    .flatMap((row) => {
      const shiftId = row['shiftId'];
      const periodIds = texts(row, 'periodIds');
      const own = typeof shiftId === 'string' ? shiftPeriods.get(shiftId) : undefined;
      if (!own || !periodIds.length || periodIds.some((id) => !own.some((p) => p.id === id)))
        return [];
      return [{ id: text(row, 'id'), name: text(row, 'name'), shiftId, periodIds }];
    });
  const usedShifts = new Set(classGroups.map((c) => c.shiftId));
  const shifts = shiftRows
    .filter((row) => usedShifts.has(text(row, 'id')))
    .map((row) => ({
      id: text(row, 'id'),
      name: text(row, 'name'),
      periods: shiftPeriods.get(text(row, 'id')) ?? [],
    }));
  const periods = shifts.flatMap((s) => s.periods);
  const periodIds = new Set(periods.map((p) => p.id));
  const classIds = new Map(classGroups.map((c) => [c.id, c]));

  const subjects = rows(catalog.subjects).map((row) => ({
    id: text(row, 'id'),
    name: text(row, 'name'),
  }));
  const teacherRows = rows(catalog.teachers).filter(active);
  const teacherIds = new Set(teacherRows.map((row) => text(row, 'id')));
  const assignments = rows(catalog.assignments).flatMap((row) => {
    const participants = rows(row['participants']).map((p) => ({
      teacherId: text(p, 'teacherId'),
      subjectId: text(p, 'subjectId'),
    }));
    const classGroupId = text(row, 'classGroupId');
    if (!classIds.has(classGroupId) || participants.some((p) => !teacherIds.has(p.teacherId)))
      return [];
    return [
      {
        id: text(row, 'id'),
        classGroupId,
        participants,
        weeklyLessons: integer(row, 'weeklyLessons'),
        resourceIds: [],
      },
    ];
  });

  const teachers = teacherRows.map((row): TimetableTeacher => {
    const id = text(row, 'id');
    const teachingShifts = new Set(
      assignments
        .filter((a) => a.participants.some((p) => p.teacherId === id))
        .map((a) => classIds.get(a.classGroupId)?.shiftId),
    );
    const own = periods.filter((p) => teachingShifts.has(p.shiftId));
    const allowed = rules.planningPeriods === 'teaching_shifts' && own.length > 0 ? own : periods;
    const max = row['maxWeeklyLessons'];
    return {
      id,
      name: text(row, 'name'),
      subjectIds: texts(row, 'subjectIds'),
      planningPeriods: integer(row, 'planningPeriods'),
      planningPeriodIds: allowed.map((p) => p.id),
      maxWeeklyLessons: max === null ? null : integer(row, 'maxWeeklyLessons'),
      unavailable: rows(row['unavailable']).flatMap((slot) => {
        const weekday = integer(slot, 'weekday');
        const periodId = text(slot, 'periodId');
        return isWeekday(weekday) && periodIds.has(periodId) ? [{ weekday, periodId }] : [];
      }),
    };
  });

  const exceptions = new Map(
    rules.dailyExceptions.map((r) => [r.classGroupId + '|' + r.subjectId, r]),
  );
  const subjectRules = new Map<string, DailySubjectRule>();
  for (const a of assignments)
    for (const p of a.participants) {
      const key = a.classGroupId + '|' + p.subjectId;
      const rule = exceptions.get(key) ?? rules.daily;
      subjectRules.set(key, {
        classGroupId: a.classGroupId,
        subjectId: p.subjectId,
        maxPerDay: rule.maxPerDay,
        consecutive: rule.consecutive,
      });
    }
  const durations = new Set(periods.map((p) => p.endMinute - p.startMinute));
  const [duration] = durations;

  return {
    shifts: shifts.map((s) => ({ id: s.id, name: s.name, periodIds: s.periods.map((p) => p.id) })),
    timetable: {
      modelVersion: 1,
      sourceRevision: revisionId,
      lessonMinutes: durations.size === 1 && duration !== undefined ? duration : null,
      weekdays: [...WEEKDAYS],
      periods,
      subjects,
      classGroups: classGroups.map(({ id, name, periodIds }) => ({ id, name, periodIds })),
      teachers,
      assignments,
      resources: [],
      subjectRules: [...subjectRules.values()],
      fixedLessons: [],
      fixedPlanning: [],
    },
  };
}

/** A alocação aponta para bloco ou professor e aula existentes na tradução. */
export function isKnownSlot(translated: TranslatedCatalog, slot: GridSlot): boolean {
  const { timetable } = translated;
  const entities = slot.kind === 'lesson' ? timetable.assignments : timetable.teachers;
  return (
    isWeekday(slot.weekday) &&
    timetable.periods.some((p) => p.id === slot.periodId) &&
    entities.some((e) => e.id === slot.entityId)
  );
}

/** Snapshot com as fixações da grade e a proposta correspondente, prontos para o validador. */
export function gridProposal(
  translated: TranslatedCatalog,
  placements: readonly Placement[],
): { snapshot: TimetableSnapshot; proposal: TimetableProposal } {
  const lessons = placements.filter((p) => p.kind === 'lesson');
  const planning = placements.filter((p) => p.kind === 'planning');
  const lessonOf = (p: Placement) => ({
    assignmentId: p.entityId,
    weekday: p.weekday,
    periodId: p.periodId,
  });
  const planningOf = (p: Placement) => ({
    teacherId: p.entityId,
    weekday: p.weekday,
    periodId: p.periodId,
  });
  // Fixações com referência desconhecida invalidariam o modelo inteiro; a proposta já as acusa.
  const fixed = placements.filter((p) => p.pinned && isKnownSlot(translated, p));
  return {
    snapshot: {
      ...translated.timetable,
      fixedLessons: fixed.filter((p) => p.kind === 'lesson').map(lessonOf),
      fixedPlanning: fixed.filter((p) => p.kind === 'planning').map(planningOf),
    },
    proposal: { lessons: lessons.map(lessonOf), planning: planning.map(planningOf) },
  };
}
