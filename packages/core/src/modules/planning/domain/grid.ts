import type { Weekday } from '../../../shared/weekdays.ts';
import { PlanningError } from './planning-error.ts';

/** Uma ocorrência de bloco (`lesson`) ou um período de hora-atividade (`planning`). */
export interface GridSlot {
  readonly kind: 'lesson' | 'planning';
  /** Bloco de aulas, para `lesson`; professor, para `planning`. */
  readonly entityId: string;
  readonly weekday: Weekday;
  readonly periodId: string;
}
export interface Placement extends GridSlot {
  readonly pinned: boolean;
}
export interface GridDelta {
  readonly removed: readonly Placement[];
  readonly added: readonly Placement[];
}
export type GridOperation =
  | { readonly type: 'place'; readonly slot: GridSlot }
  | { readonly type: 'remove'; readonly slot: GridSlot }
  | {
      readonly type: 'move';
      readonly slot: GridSlot;
      readonly weekday: Weekday;
      readonly periodId: string;
    }
  | { readonly type: 'swap'; readonly first: GridSlot; readonly second: GridSlot }
  | { readonly type: 'pin'; readonly slot: GridSlot; readonly pinned: boolean };

export interface DailyRule {
  readonly maxPerDay: 1 | 2;
  /** Quando houver duas aulas no dia, elas precisam ser consecutivas. */
  readonly consecutive: boolean;
}
export interface DailyRuleException extends DailyRule {
  readonly classGroupId: string;
  readonly subjectId: string;
}
/** Regras configuráveis da revisão (ADR 0013). */
export interface GridRules {
  readonly formatVersion: 1;
  /** `any_shift`: qualquer aula dos turnos aplicáveis; `teaching_shifts`: turnos em que o professor tem aulas. */
  readonly planningPeriods: 'any_shift' | 'teaching_shifts';
  readonly daily: DailyRule;
  readonly dailyExceptions: readonly DailyRuleException[];
}
export const DEFAULT_GRID_RULES: GridRules = {
  formatVersion: 1,
  planningPeriods: 'any_shift',
  daily: { maxPerDay: 2, consecutive: true },
  dailyExceptions: [],
};
export const MAX_DAILY_EXCEPTIONS = 2000;

function invalidRules(): never {
  throw new PlanningError(
    'grid.rules_invalid',
    'Revise as regras: o limite diário é de 1 ou 2 aulas e cada exceção aparece uma vez por turma e disciplina.',
    'validation',
  );
}
function dailyRule(value: unknown): DailyRule {
  if (typeof value !== 'object' || value === null) invalidRules();
  const { maxPerDay, consecutive } = value as Record<string, unknown>;
  if ((maxPerDay !== 1 && maxPerDay !== 2) || typeof consecutive !== 'boolean') invalidRules();
  return { maxPerDay, consecutive };
}
/** Confere regras vindas da tela ou do banco; não depende dos cadastros. */
export function validateGridRules(value: unknown): GridRules {
  if (typeof value !== 'object' || value === null) invalidRules();
  const input = value as Record<string, unknown>;
  if (
    input['formatVersion'] !== 1 ||
    (input['planningPeriods'] !== 'any_shift' && input['planningPeriods'] !== 'teaching_shifts') ||
    !Array.isArray(input['dailyExceptions']) ||
    input['dailyExceptions'].length > MAX_DAILY_EXCEPTIONS
  )
    invalidRules();
  const seen = new Set<string>();
  const dailyExceptions = input['dailyExceptions'].map((raw: unknown): DailyRuleException => {
    if (typeof raw !== 'object' || raw === null) invalidRules();
    const { classGroupId, subjectId } = raw as Record<string, unknown>;
    if (typeof classGroupId !== 'string' || typeof subjectId !== 'string') invalidRules();
    const key = classGroupId + '|' + subjectId;
    if (!classGroupId || !subjectId || seen.has(key)) invalidRules();
    seen.add(key);
    return { classGroupId, subjectId, ...dailyRule(raw) };
  });
  return {
    formatVersion: 1,
    planningPeriods: input['planningPeriods'],
    daily: dailyRule(input['daily']),
    dailyExceptions,
  };
}

export function slotKey(slot: GridSlot): string {
  return [slot.kind, slot.entityId, slot.weekday, slot.periodId].join('|');
}
function sameTime(a: Pick<GridSlot, 'weekday' | 'periodId'>, b: typeof a): boolean {
  return a.weekday === b.weekday && a.periodId === b.periodId;
}
function find(placements: readonly Placement[], slot: GridSlot): Placement {
  const found = placements.find((p) => slotKey(p) === slotKey(slot));
  if (!found)
    throw new PlanningError(
      'grid.slot_missing',
      'A aula escolhida não está mais neste horário. Atualize a grade.',
    );
  return found;
}
function movable(placement: Placement): Placement {
  if (placement.pinned)
    throw new PlanningError(
      'grid.pinned',
      'Desfixe a aula antes de movê-la, trocá-la ou removê-la.',
    );
  return placement;
}
function noChange(): never {
  throw new PlanningError('grid.no_change', 'A alteração não muda a grade.', 'validation');
}

/** Traduz a operação em um delta; falhas estruturais impedem a operação inteira. */
export function operationDelta(
  placements: readonly Placement[],
  operation: GridOperation,
): GridDelta {
  switch (operation.type) {
    case 'place': {
      if (placements.some((p) => slotKey(p) === slotKey(operation.slot)))
        throw new PlanningError('grid.duplicate', 'Esta aula já está neste horário.', 'validation');
      return { removed: [], added: [{ ...operation.slot, pinned: false }] };
    }
    case 'remove':
      return { removed: [movable(find(placements, operation.slot))], added: [] };
    case 'move': {
      const current = movable(find(placements, operation.slot));
      if (sameTime(current, operation)) noChange();
      return {
        removed: [current],
        added: [{ ...current, weekday: operation.weekday, periodId: operation.periodId }],
      };
    }
    case 'swap': {
      const first = movable(find(placements, operation.first));
      const second = movable(find(placements, operation.second));
      const added = [
        { ...first, weekday: second.weekday, periodId: second.periodId },
        { ...second, weekday: first.weekday, periodId: first.periodId },
      ];
      const before = new Set([slotKey(first), slotKey(second)]);
      if (added.every((p) => before.has(slotKey(p)))) noChange();
      return { removed: [first, second], added };
    }
    case 'pin': {
      const current = find(placements, operation.slot);
      if (current.pinned === operation.pinned) noChange();
      return { removed: [current], added: [{ ...current, pinned: operation.pinned }] };
    }
  }
}

/** Aplica o delta por inteiro: remove o que existe e acrescenta sem repetir horários. */
export function applyDelta(placements: readonly Placement[], delta: GridDelta): Placement[] {
  const byKey = new Map(placements.map((p) => [slotKey(p), p]));
  for (const removed of delta.removed) {
    const current = byKey.get(slotKey(removed));
    if (!current || current.pinned !== removed.pinned)
      throw new PlanningError(
        'grid.slot_missing',
        'A grade mudou desde a última leitura. Atualize a grade.',
      );
    byKey.delete(slotKey(removed));
  }
  for (const added of delta.added) {
    if (byKey.has(slotKey(added)))
      throw new PlanningError('grid.duplicate', 'Esta aula já está neste horário.', 'validation');
    byKey.set(slotKey(added), added);
  }
  return [...byKey.values()];
}

export function invertDelta(delta: GridDelta): GridDelta {
  return { removed: delta.added, added: delta.removed };
}
