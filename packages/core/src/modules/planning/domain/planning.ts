import type { GridRules } from './grid.ts';
import { PlanningError } from './planning-error.ts';

export { PlanningError };

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export interface CatalogSnapshot {
  formatVersion: 1;
  catalogVersion: number;
  capturedAt: string;
  subjects: JsonValue[];
  teachers: JsonValue[];
  classGroups: JsonValue[];
  shifts: JsonValue[];
  assignments: JsonValue[];
  /** Ausente nas fotografias anteriores aos recursos especiais (ADR 0016). */
  resources?: JsonValue[];
}
export interface PlanningRevision {
  id: string;
  planningId: string;
  number: number;
  createdAt: Date;
  createdBy: string;
  snapshot: CatalogSnapshot;
  /** Regras da grade desta revisão (ADR 0013). */
  gridRules: GridRules;
  rulesReviewed: boolean;
  availabilityReviewed: boolean;
  sealedAt: Date | null;
}
export interface Planning {
  id: string;
  name: string;
  year: number;
  version: number;
  createdAt: Date;
  archivedAt: Date | null;
  copiedFromId: string | null;
}
export function validatePlanningInput(name: string, year: number): string {
  const trimmed = name.trim();
  if (
    trimmed.length < 1 ||
    trimmed.length > 100 ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2200
  )
    throw new PlanningError(
      'planning.invalid',
      'Informe um nome de até 100 caracteres e um ano entre 2000 e 2200.',
      'validation',
    );
  return trimmed;
}
export function requireDraft(planning: Planning, revision: PlanningRevision): void {
  if (planning.archivedAt)
    throw new PlanningError('planning.archived', 'Restaure o planejamento antes de alterá-lo.');
  if (revision.sealedAt)
    throw new PlanningError(
      'planning.sealed',
      'Esta revisão está concluída. Abra um novo rascunho.',
    );
}
