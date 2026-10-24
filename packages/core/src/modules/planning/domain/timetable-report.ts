import { compareNames } from '../../../shared/names.ts';
import { WEEKDAYS } from '../../../shared/weekdays.ts';
import type { TranslatedCatalog } from './catalog-translation.ts';
import type { Placement } from './grid.ts';
import type { CatalogSnapshot } from './planning.ts';

export type ReportPerspective = 'class' | 'teacher';
export interface ReportItem {
  title: string;
  details: string[];
  pinned: boolean;
}
export interface ReportRow {
  periodId: string;
  number: number;
  startMinute: number;
  endMinute: number;
  cells: { weekday: number; unavailable: boolean; items: ReportItem[] }[];
}
export interface ReportSheet {
  targetId: string;
  targetName: string;
  shiftName: string;
  rows: ReportRow[];
}

/** Monta uma leitura de impressão usando apenas a fotografia e as alocações da revisão. */
export function buildReportSheets(input: {
  translated: TranslatedCatalog;
  snapshot: CatalogSnapshot;
  placements: readonly Placement[];
  perspective: ReportPerspective;
  entityId?: string | undefined;
}) {
  const { translated, snapshot, placements, perspective, entityId } = input;
  const { timetable, shifts } = translated;
  const teachers = new Map(timetable.teachers.map((t) => [t.id, t]));
  const subjects = new Map(timetable.subjects.map((s) => [s.id, s.name]));
  const groups = new Map(timetable.classGroups.map((c) => [c.id, c]));
  const assignments = new Map(timetable.assignments.map((a) => [a.id, a]));
  const resources = new Map(timetable.resources.map((r) => [r.id, r.name]));
  const periods = new Map(timetable.periods.map((p) => [p.id, p]));
  // Turmas ainda sem turno também recebem uma folha, com a configuração pendente explícita.
  const classTargets = snapshot.classGroups.flatMap((row) => {
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      row['archivedAt'] !== null ||
      typeof row['id'] !== 'string' ||
      typeof row['name'] !== 'string'
    )
      return [];
    return [{ id: row['id'], name: row['name'] }];
  });
  const targets = (
    perspective === 'class'
      ? classTargets
      : timetable.teachers.map((t) => ({ id: t.id, name: t.name }))
  ).toSorted((a, b) => compareNames(a.name, b.name));
  const sheets: ReportSheet[] = [];
  for (const target of targets.filter((t) => !entityId || t.id === entityId)) {
    const ownAssignmentList = timetable.assignments.filter((a) =>
      perspective === 'class'
        ? a.classGroupId === target.id
        : a.participants.some((p) => p.teacherId === target.id),
    );
    const ownAssignments = new Set(ownAssignmentList.map((a) => a.id));
    const ownPlacements = placements.filter((p) =>
      p.kind === 'lesson'
        ? ownAssignments.has(p.entityId)
        : perspective === 'teacher' && p.entityId === target.id,
    );
    const ownPeriods =
      perspective === 'class'
        ? (groups.get(target.id)?.periodIds ?? [])
        : [
            ...ownAssignmentList.flatMap((a) => groups.get(a.classGroupId)?.periodIds ?? []),
            ...ownPlacements.map((p) => p.periodId),
          ];
    const shownPeriods = new Set(
      perspective === 'teacher' && !ownPeriods.length
        ? timetable.periods.map((p) => p.id)
        : ownPeriods,
    );
    const ownShifts = shifts.filter((s) => s.periodIds.some((id) => shownPeriods.has(id)));
    for (const shift of ownShifts) {
      const rows = shift.periodIds.flatMap((id, index): ReportRow[] => {
        const period = periods.get(id);
        if (!period || (perspective === 'class' && !shownPeriods.has(id))) return [];
        return [
          {
            periodId: id,
            number: index + 1,
            startMinute: period.startMinute,
            endMinute: period.endMinute,
            cells: WEEKDAYS.map((weekday) => ({
              weekday,
              unavailable: (teachers.get(target.id)?.unavailable ?? []).some((slot) => {
                const blocked = periods.get(slot.periodId);
                return (
                  perspective === 'teacher' &&
                  slot.weekday === weekday &&
                  blocked !== undefined &&
                  blocked.startMinute < period.endMinute &&
                  period.startMinute < blocked.endMinute
                );
              }),
              items: ownPlacements
                .filter((slot) => slot.periodId === id && slot.weekday === weekday)
                .map((slot) => {
                  if (slot.kind === 'planning')
                    return { title: 'Hora-atividade', details: [], pinned: slot.pinned };
                  const assignment = assignments.get(slot.entityId);
                  if (!assignment)
                    return { title: 'Bloco não encontrado', details: [], pinned: slot.pinned };
                  const title = [
                    ...new Set(
                      assignment.participants.map(
                        (p) => subjects.get(p.subjectId) ?? 'Disciplina não encontrada',
                      ),
                    ),
                  ].join(' + ');
                  const details =
                    perspective === 'class'
                      ? [
                          ...new Set(
                            assignment.participants.map(
                              (p) => teachers.get(p.teacherId)?.name ?? 'Professor não encontrado',
                            ),
                          ),
                        ]
                      : [
                          groups.get(assignment.classGroupId)?.name ?? 'Turma não encontrada',
                          ...new Set(
                            assignment.participants
                              .filter((p) => p.teacherId !== target.id)
                              .map(
                                (p) =>
                                  teachers.get(p.teacherId)?.name ?? 'Professor não encontrado',
                              ),
                          ),
                        ];
                  const names = assignment.resourceIds.flatMap((resourceId) => {
                    const name = resources.get(resourceId);
                    return name ? [name] : [];
                  });
                  if (names.length) details.push('Recursos: ' + names.join(', '));
                  return { title, details, pinned: slot.pinned };
                }),
            })),
          },
        ];
      });
      sheets.push({ targetId: target.id, targetName: target.name, shiftName: shift.name, rows });
    }
    if (!ownShifts.length)
      sheets.push({
        targetId: target.id,
        targetName: target.name,
        shiftName: 'Sem horários configurados',
        rows: [],
      });
  }
  return { targets, sheets };
}
