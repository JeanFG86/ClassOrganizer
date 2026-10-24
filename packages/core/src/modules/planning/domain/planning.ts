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
  name: string | null;
  restoredFromId: string | null;
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

export class PlanningEntity {
  readonly #state: Planning;
  private constructor(state: Planning) {
    this.#state = structuredClone(state);
  }
  static reconstitute(state: Planning): PlanningEntity {
    return new PlanningEntity(state);
  }
  static create(input: {
    id: string;
    name: string;
    year: number;
    createdAt: Date;
    copiedFromId: string | null;
  }): PlanningEntity {
    return new PlanningEntity({
      ...input,
      name: validName(input.name, input.year),
      archivedAt: null,
      version: 1,
    });
  }
  archive(at: Date): PlanningEntity {
    return new PlanningEntity({ ...this.#state, archivedAt: at });
  }
  restore(): PlanningEntity {
    return new PlanningEntity({ ...this.#state, archivedAt: null });
  }
  /** Alterações valem só para uma revisão aberta de um planejamento ativo. */
  requireDraft(revision: PlanningRevision): void {
    if (this.#state.archivedAt)
      throw new PlanningError('planning.archived', 'Restaure o planejamento antes de alterá-lo.');
    if (revision.sealedAt)
      throw new PlanningError(
        'planning.sealed',
        'Esta revisão está concluída. Abra um novo rascunho.',
      );
  }
  snapshot(): Planning {
    return structuredClone(this.#state);
  }
}

export class PlanningRevisionEntity {
  readonly #state: PlanningRevision;
  private constructor(state: PlanningRevision) {
    this.#state = structuredClone(state);
  }
  static reconstitute(state: PlanningRevision): PlanningRevisionEntity {
    return new PlanningRevisionEntity(state);
  }
  /** Abre um rascunho com a fotografia e as regras informadas, ainda sem conferências. */
  static open(input: {
    id: string;
    planningId: string;
    number: number;
    snapshot: CatalogSnapshot;
    gridRules: GridRules;
    createdAt: Date;
    createdBy: string;
  }): PlanningRevisionEntity {
    return new PlanningRevisionEntity({
      ...input,
      name: null,
      restoredFromId: null,
      rulesReviewed: false,
      availabilityReviewed: false,
      sealedAt: null,
    });
  }
  /** Restaura em outra revisão, preservando os dados originais e exigindo nova conferência. */
  static restore(
    input: Pick<PlanningRevision, 'id' | 'planningId' | 'number' | 'createdAt' | 'createdBy'>,
    source: PlanningRevision,
  ): PlanningRevisionEntity {
    if (source.planningId !== input.planningId)
      throw new PlanningError(
        'planning.revision_invalid',
        'A revisão pertence a outro planejamento.',
      );
    return new PlanningRevisionEntity({
      ...PlanningRevisionEntity.open({
        ...input,
        snapshot: source.snapshot,
        gridRules: source.gridRules,
      }).snapshot(),
      restoredFromId: source.id,
    });
  }
  /** O nome é metadado; pode identificar também uma revisão já concluída. */
  rename(name: string): PlanningRevisionEntity {
    const trimmed = name.trim();
    if (trimmed.length > 100)
      throw new PlanningError(
        'planning.revision_name_invalid',
        'Use até 100 caracteres no nome da revisão.',
        'validation',
      );
    return new PlanningRevisionEntity({ ...this.#state, name: trimmed || null });
  }
  /** Regras novas precisam ser conferidas de novo antes da conclusão. */
  changeRules(gridRules: GridRules): PlanningRevisionEntity {
    return new PlanningRevisionEntity({ ...this.#state, gridRules, rulesReviewed: false });
  }
  review(
    rulesReviewed: boolean | undefined,
    availabilityReviewed: boolean | undefined,
  ): PlanningRevisionEntity {
    if (rulesReviewed === undefined || availabilityReviewed === undefined)
      throw new PlanningError(
        'planning.review_invalid',
        'Informe a revisão das regras e da disponibilidade.',
        'validation',
      );
    return new PlanningRevisionEntity({ ...this.#state, rulesReviewed, availabilityReviewed });
  }
  requireReviewed(): void {
    if (!this.#state.rulesReviewed || !this.#state.availabilityReviewed)
      throw new PlanningError(
        'planning.review_required',
        'Revise as regras e a disponibilidade antes de concluir.',
      );
  }
  seal(at: Date): PlanningRevisionEntity {
    this.requireReviewed();
    return new PlanningRevisionEntity({ ...this.#state, sealedAt: at });
  }
  snapshot(): PlanningRevision {
    return structuredClone(this.#state);
  }
}
function validName(name: string, year: number): string {
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
