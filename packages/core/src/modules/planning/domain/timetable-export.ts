import { compareNames } from '../../../shared/names.ts';
import type { TranslatedCatalog } from './catalog-translation.ts';
import { diagnoseGrid } from './diagnosis.ts';
import type { Placement } from './grid.ts';
import { REVIEW_PENDING_NOTICE, isRevisionReviewed } from './review-items.ts';
import {
  PlanningError,
  type CatalogSnapshot,
  type JsonValue,
  type Planning,
  type PlanningRevision,
} from './planning.ts';

type Row = { [key: string]: JsonValue };
function rows(values: JsonValue[]): Row[] {
  return values.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new PlanningError(
        'planning.snapshot_invalid',
        'A fotografia desta revisão está em um formato desconhecido.',
      );
    return value;
  });
}
function text(row: Row | undefined, key: string, fallback = 'Não encontrado'): string {
  return typeof row?.[key] === 'string' ? row[key] : fallback;
}
function number(row: Row, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new PlanningError(
      'planning.snapshot_invalid',
      'A fotografia desta revisão está em um formato desconhecido.',
    );
  return value;
}
export interface WorkbookSchedule {
  kind: 'lesson' | 'planning';
  weekday: number;
  shift: string;
  startMinute: number | null;
  endMinute: number | null;
  classGroup: string;
  subjects: string[];
  teachers: string[];
  resources: string[];
  pinned: boolean;
}
export interface WorkbookTeacherLoad {
  name: string;
  assigned: number;
  required: number;
  placed: number;
  requiredPlanning: number;
  placedPlanning: number;
  maxWeeklyLessons: number | null;
}
export interface WorkbookClassLoad {
  name: string;
  configured: boolean;
  assigned: number;
  required: number;
  placed: number;
}
export interface WorkbookAssignment {
  id: string;
  classGroup: string;
  participants: string[];
  weeklyLessons: number;
  placed: number;
  applicable: boolean;
}
export interface TimetableExport {
  planning: Pick<Planning, 'id' | 'name' | 'year' | 'version'>;
  revision: Pick<PlanningRevision, 'id' | 'number' | 'name' | 'sealedAt'>;
  historical: boolean;
  archived: boolean;
  capturedAt: string;
  catalogVersion: number;
  generatedAt: Date;
  schedules: WorkbookSchedule[];
  teachers: WorkbookTeacherLoad[];
  classGroups: WorkbookClassLoad[];
  assignments: WorkbookAssignment[];
  notices: string[];
}

/** Fotografia de saída: cargas cadastradas ficam distinguíveis das cargas aplicáveis à grade. */
export function buildTimetableExport(input: {
  planning: Planning;
  revision: PlanningRevision;
  translated: TranslatedCatalog;
  placements: readonly Placement[];
  historical: boolean;
  generatedAt: Date;
}): TimetableExport {
  const { planning, revision, translated, placements } = input;
  const snapshot: CatalogSnapshot = revision.snapshot;
  const groups = new Map(rows(snapshot.classGroups).map((row) => [text(row, 'id'), row]));
  const teachers = new Map(rows(snapshot.teachers).map((row) => [text(row, 'id'), row]));
  const subjects = new Map(rows(snapshot.subjects).map((row) => [text(row, 'id'), row]));
  const resources = new Map(rows(snapshot.resources ?? []).map((row) => [text(row, 'id'), row]));
  const blocks = rows(snapshot.assignments);
  const blockMap = new Map(blocks.map((row) => [text(row, 'id'), row]));
  const shifts = rows(snapshot.shifts);
  const periodMap = new Map(
    shifts.flatMap((shift) =>
      rows(Array.isArray(shift['periods']) ? shift['periods'] : []).map(
        (period) =>
          [
            text(period, 'id'),
            {
              shift: text(shift, 'name'),
              start: number(period, 'startMinute'),
              end: number(period, 'endMinute'),
            },
          ] as const,
      ),
    ),
  );
  const participants = (block: Row) =>
    rows(Array.isArray(block['participants']) ? block['participants'] : []);
  const blockCount = new Map<string, number>();
  for (const slot of placements)
    if (slot.kind === 'lesson')
      blockCount.set(slot.entityId, (blockCount.get(slot.entityId) ?? 0) + 1);
  const diagnosis = diagnoseGrid(translated, placements);
  const teacherLoads = new Map(diagnosis.teachers.map((load) => [load.teacherId, load]));
  const classLoads = new Map(diagnosis.classGroups.map((load) => [load.classGroupId, load]));
  const applicable = new Set(translated.timetable.assignments.map((a) => a.id));
  const sorted = <T extends { name: string }>(items: T[]) =>
    items.toSorted((a, b) => compareNames(a.name, b.name));
  const notices = [
    ...diagnosis.model,
    ...diagnosis.problems,
    ...diagnosis.pending,
    ...diagnosis.alerts,
  ].map((issue) => issue.message);
  if (!isRevisionReviewed(revision)) notices.unshift(REVIEW_PENDING_NOTICE);
  const excluded = blocks.filter((block) => !applicable.has(text(block, 'id'))).length;
  if (excluded)
    notices.push(
      `${excluded} bloco(s) cadastrado(s) não se aplicam à grade desta revisão. Consulte a coluna Situação em Blocos.`,
    );
  return {
    planning: {
      id: planning.id,
      name: planning.name,
      year: planning.year,
      version: planning.version,
    },
    revision: {
      id: revision.id,
      number: revision.number,
      name: revision.name,
      sealedAt: revision.sealedAt,
    },
    historical: input.historical,
    archived: planning.archivedAt !== null,
    capturedAt: snapshot.capturedAt,
    catalogVersion: snapshot.catalogVersion,
    generatedAt: new Date(input.generatedAt),
    notices,
    schedules: placements
      .map((slot) => {
        const period = periodMap.get(slot.periodId);
        const block = blockMap.get(slot.entityId);
        const own = block ? participants(block) : [];
        return {
          kind: slot.kind,
          weekday: slot.weekday,
          shift: period?.shift ?? 'Horário não encontrado',
          startMinute: period?.start ?? null,
          endMinute: period?.end ?? null,
          classGroup:
            slot.kind === 'lesson' ? text(groups.get(text(block, 'classGroupId')), 'name') : '',
          subjects:
            slot.kind === 'lesson'
              ? [...new Set(own.map((p) => text(subjects.get(text(p, 'subjectId')), 'name')))]
              : [],
          teachers:
            slot.kind === 'planning'
              ? [text(teachers.get(slot.entityId), 'name')]
              : [...new Set(own.map((p) => text(teachers.get(text(p, 'teacherId')), 'name')))],
          resources:
            block && Array.isArray(block['resourceIds'])
              ? block['resourceIds'].flatMap((id) =>
                  typeof id === 'string' ? [text(resources.get(id), 'name')] : [],
                )
              : [],
          pinned: slot.pinned,
        };
      })
      .toSorted(
        (a, b) =>
          a.weekday - b.weekday ||
          (a.startMinute ?? 0) - (b.startMinute ?? 0) ||
          compareNames(a.classGroup, b.classGroup),
      ),
    teachers: sorted(
      [...teachers]
        .filter(([, row]) => row['archivedAt'] === null)
        .map(([id, row]) => {
          const load = teacherLoads.get(id);
          return {
            name: text(row, 'name'),
            assigned: blocks
              .filter((block) => participants(block).some((p) => p['teacherId'] === id))
              .reduce((sum, block) => sum + number(block, 'weeklyLessons'), 0),
            required: load?.requiredLessons ?? 0,
            placed: load?.lessons ?? 0,
            requiredPlanning: number(row, 'planningPeriods'),
            placedPlanning: load?.planning ?? 0,
            maxWeeklyLessons:
              row['maxWeeklyLessons'] === null ? null : number(row, 'maxWeeklyLessons'),
          };
        }),
    ),
    classGroups: sorted(
      [...groups]
        .filter(([, row]) => row['archivedAt'] === null)
        .map(([id, row]) => ({
          name: text(row, 'name'),
          configured: classLoads.has(id),
          assigned: blocks
            .filter((block) => block['classGroupId'] === id)
            .reduce((sum, block) => sum + number(block, 'weeklyLessons'), 0),
          required: classLoads.get(id)?.requiredLessons ?? 0,
          placed: classLoads.get(id)?.lessons ?? 0,
        })),
    ),
    assignments: blocks.map((block) => ({
      id: text(block, 'id'),
      classGroup: text(groups.get(text(block, 'classGroupId')), 'name'),
      participants: participants(block).map(
        (p) =>
          text(subjects.get(text(p, 'subjectId')), 'name') +
          ' / ' +
          text(teachers.get(text(p, 'teacherId')), 'name'),
      ),
      weeklyLessons: number(block, 'weeklyLessons'),
      placed: blockCount.get(text(block, 'id')) ?? 0,
      applicable: applicable.has(text(block, 'id')),
    })),
  };
}
