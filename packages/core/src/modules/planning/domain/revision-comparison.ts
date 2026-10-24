import { canonicalJson, compareGrids } from './generation-run.ts';
import { translateCatalog } from './catalog-translation.ts';
import { slotLabel, timeLabel } from './grid-summary.ts';
import type { Placement } from './grid.ts';
import type { JsonValue, PlanningRevision } from './planning.ts';

const CATEGORIES = {
  subjects: 'Disciplina',
  teachers: 'Professor',
  classGroups: 'Turma',
  shifts: 'Turno',
  assignments: 'Atribuição',
  resources: 'Recurso',
} as const;

function records(items: readonly JsonValue[]) {
  return new Map(
    items.flatMap((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row['id'] !== 'string')
        return [];
      // Versões e datas de cadastro não representam mudanças nas regras escolares.
      const data = Object.fromEntries(
        Object.entries(row).filter(([key]) => key !== 'version' && key !== 'createdAt'),
      );
      return [[row['id'], data] as const];
    }),
  );
}

/** Compara cada grade com os rótulos e horários da sua própria fotografia histórica. */
export function compareRevisions(
  from: PlanningRevision,
  to: PlanningRevision,
  before: readonly Placement[],
  after: readonly Placement[],
) {
  const { delta, kept } = compareGrids(before, after);
  const fromCatalog = translateCatalog(from.snapshot, from.gridRules, from.id);
  const toCatalog = translateCatalog(to.snapshot, to.gridRules, to.id);
  const describe = (
    translated: ReturnType<typeof translateCatalog>,
    placements: readonly Placement[],
  ) => {
    return placements.map((placement) => ({
      label: slotLabel(translated, placement),
      time: timeLabel(translated, placement),
      pinned: placement.pinned,
    }));
  };
  const catalogChanges: {
    category: string;
    label: string;
    kind: 'added' | 'removed' | 'changed';
  }[] = [];
  for (const [key, category] of Object.entries(CATEGORIES)) {
    const section = key as keyof typeof CATEGORIES;
    const oldRows = records(from.snapshot[section] ?? []);
    const newRows = records(to.snapshot[section] ?? []);
    for (const id of new Set([...oldRows.keys(), ...newRows.keys()])) {
      const oldRow = oldRows.get(id);
      const newRow = newRows.get(id);
      if (canonicalJson(oldRow) === canonicalJson(newRow)) continue;
      const row = newRow ?? oldRow;
      const label =
        typeof row?.['name'] === 'string'
          ? row['name']
          : slotLabel(newRow ? toCatalog : fromCatalog, {
              kind: 'lesson',
              entityId: id,
              weekday: 1,
              periodId: '',
            });
      catalogChanges.push({
        category,
        label,
        kind: !oldRow ? 'added' : !newRow ? 'removed' : 'changed',
      });
    }
  }
  return {
    from: { id: from.id, number: from.number, name: from.name },
    to: { id: to.id, number: to.number, name: to.name },
    kept,
    removed: describe(fromCatalog, delta.removed),
    added: describe(toCatalog, delta.added),
    rulesChanged: canonicalJson(from.gridRules) !== canonicalJson(to.gridRules),
    catalogChanges,
  };
}
