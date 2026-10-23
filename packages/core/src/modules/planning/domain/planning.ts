import { DomainError } from '../../../shared/domain-error.ts';

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
}
export interface PlanningRevision {
  id: string;
  planningId: string;
  number: number;
  createdAt: Date;
  createdBy: string;
  snapshot: CatalogSnapshot;
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
export class PlanningError extends DomainError {
  readonly code: string;
  readonly kind: 'validation' | 'conflict';
  constructor(code: string, message: string, kind: PlanningError['kind'] = 'conflict') {
    super(message);
    this.code = code;
    this.kind = kind;
  }
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
