import { READ_ROLES, WRITE_ROLES, requireRole, type Actor } from '../../../access/domain/index.ts';
import type { TimetableIssue } from '../../../timetable/domain/index.ts';
import type { TranslatedCatalog } from '../../domain/catalog-translation.ts';
import { diagnoseGrid, issuesAdded, type GridDiagnosis } from '../../domain/diagnosis.ts';
import {
  applyDelta,
  invertDelta,
  operationDelta,
  validateGridRules,
  type GridOperation,
  type GridRules,
  type Placement,
} from '../../domain/grid.ts';
import { describeOperation } from '../../domain/grid-summary.ts';
import { PlanningError, PlanningRevisionEntity } from '../../domain/planning.ts';
import {
  GridReader,
  GridWriter,
  undoTarget,
  type GridReaderDependencies,
  type GridWriterDependencies,
} from '../services/grid-access.ts';

export interface GridEvaluation {
  accepted: boolean;
  summary: string;
  introduced: TimetableIssue[];
  resolved: TimetableIssue[];
  diagnosis: GridDiagnosis;
}

/** Problemas que bloqueiam uma alteração: modelagem e conflitos, não a falta de aulas. */
function blocking(diagnosis: GridDiagnosis): readonly TimetableIssue[] {
  return diagnosis.model.length ? diagnosis.model : diagnosis.problems;
}
function evaluate(
  translated: TranslatedCatalog,
  before: readonly Placement[],
  after: readonly Placement[],
  summary: string,
): GridEvaluation {
  const current = blocking(diagnoseGrid(translated, before));
  const diagnosis = diagnoseGrid(translated, after);
  const introduced = issuesAdded(current, blocking(diagnosis));
  return {
    accepted: introduced.length === 0 && diagnosis.model.length === 0,
    summary,
    introduced,
    resolved: issuesAdded(blocking(diagnosis), current),
    diagnosis,
  };
}
function rejected(evaluation: GridEvaluation): never {
  const [first] = evaluation.introduced.length ? evaluation.introduced : evaluation.diagnosis.model;
  const others = evaluation.introduced.length - 1;
  throw new PlanningError(
    'grid.rejected',
    'A alteração não foi aplicada: ' +
      (first?.message ?? 'a grade ficaria inválida.') +
      (others > 0 ? ' Há mais ' + others + (others === 1 ? ' problema.' : ' problemas.') : ''),
  );
}
/** Dependências de todas as operações da grade, usadas pela composição. */
export type TimetableGridDependencies = GridWriterDependencies;

type GridCommand = { id: string; version: number; revisionId: string; operation: GridOperation };

/** Calcula a alteração de uma operação sobre o rascunho atual e a avalia sem gravar. */
async function prepare(reader: GridReader, actor: Actor, input: GridCommand) {
  requireRole(actor, WRITE_ROLES);
  const loaded = await reader.loadDraft(input);
  const delta = operationDelta(loaded.placements, input.operation);
  const evaluation = evaluate(
    loaded.translated,
    loaded.placements,
    applyDelta(loaded.placements, delta),
    describeOperation(loaded.translated, input.operation),
  );
  return { loaded, delta, evaluation };
}

export type ViewTimetableGridDependencies = GridReaderDependencies;
export class ViewTimetableGrid {
  readonly #deps: ViewTimetableGridDependencies;
  readonly #reader: GridReader;
  constructor(deps: ViewTimetableGridDependencies) {
    this.#deps = deps;
    this.#reader = new GridReader(deps);
  }
  async execute(actor: Actor, input: { id: string; revisionId?: string | undefined }) {
    requireRole(actor, READ_ROLES);
    const { planning, revisions, revision, placements, translated, editable } =
      await this.#reader.load(input.id, input.revisionId);
    const history = await this.#deps.grids.history(revision.id);
    const reverted = new Set(history.flatMap((c) => (c.revertsId ? [c.revertsId] : [])));
    const target = editable ? undoTarget(history) : null;
    return {
      planning,
      revision: {
        id: revision.id,
        number: revision.number,
        sealedAt: revision.sealedAt,
        rulesReviewed: revision.rulesReviewed,
        availabilityReviewed: revision.availabilityReviewed,
      },
      revisions: revisions.map((r) => ({ id: r.id, number: r.number, sealedAt: r.sealedAt })),
      editable,
      rules: revision.gridRules,
      timetable: translated.timetable,
      shifts: translated.shifts,
      placements,
      diagnosis: diagnoseGrid(translated, placements),
      history: history.map((c) => ({
        id: c.id,
        sequence: c.sequence,
        kind: c.kind,
        summary: c.summary,
        actorUsername: c.actorUsername,
        occurredAt: c.occurredAt,
        reverted: reverted.has(c.id),
      })),
      undo: target ? { changeId: target.id, summary: target.summary } : null,
    };
  }
}

export type PreviewTimetableGridDependencies = GridReaderDependencies;
/** A prévia não grava nada. */
export class PreviewTimetableGrid {
  readonly #reader: GridReader;
  constructor(deps: PreviewTimetableGridDependencies) {
    this.#reader = new GridReader(deps);
  }
  async execute(actor: Actor, input: GridCommand): Promise<GridEvaluation> {
    return (await prepare(this.#reader, actor, input)).evaluation;
  }
}

export type ApplyTimetableGridDependencies = GridWriterDependencies;
export class ApplyTimetableGrid {
  readonly #reader: GridReader;
  readonly #writer: GridWriter;
  constructor(deps: ApplyTimetableGridDependencies) {
    this.#reader = new GridReader(deps);
    this.#writer = new GridWriter(deps);
  }
  async execute(actor: Actor, input: GridCommand) {
    const { loaded, delta, evaluation } = await prepare(this.#reader, actor, input);
    if (!evaluation.accepted) rejected(evaluation);
    return this.#writer.commit(actor, loaded.planning, loaded.revision.id, {
      kind: 'operation',
      summary: evaluation.summary,
      delta,
      revertsId: null,
    });
  }
}

export type UndoTimetableGridDependencies = GridWriterDependencies;
export class UndoTimetableGrid {
  readonly #deps: UndoTimetableGridDependencies;
  readonly #reader: GridReader;
  readonly #writer: GridWriter;
  constructor(deps: UndoTimetableGridDependencies) {
    this.#deps = deps;
    this.#reader = new GridReader(deps);
    this.#writer = new GridWriter(deps);
  }
  async execute(actor: Actor, input: { id: string; version: number; revisionId: string }) {
    requireRole(actor, WRITE_ROLES);
    const loaded = await this.#reader.loadDraft(input);
    const target = undoTarget(await this.#deps.grids.history(loaded.revision.id));
    if (!target)
      throw new PlanningError('grid.undo_unavailable', 'Não há alteração para desfazer.');
    const delta = invertDelta(target.delta);
    const evaluation = evaluate(
      loaded.translated,
      loaded.placements,
      applyDelta(loaded.placements, delta),
      'Desfez: ' + target.summary,
    );
    if (!evaluation.accepted) rejected(evaluation);
    return this.#writer.commit(actor, loaded.planning, loaded.revision.id, {
      kind: 'undo',
      summary: evaluation.summary,
      delta,
      revertsId: target.id,
    });
  }
}

export type ChangeGridRulesDependencies = GridReaderDependencies;
/** Regras novas exigem nova conferência das regras antes da conclusão. */
export class ChangeGridRules {
  readonly #deps: ChangeGridRulesDependencies;
  readonly #reader: GridReader;
  constructor(deps: ChangeGridRulesDependencies) {
    this.#deps = deps;
    this.#reader = new GridReader(deps);
  }
  async execute(
    actor: Actor,
    input: { id: string; version: number; revisionId: string; rules: GridRules },
  ) {
    requireRole(actor, WRITE_ROLES);
    const { planning, revision } = await this.#reader.loadDraft(input);
    await this.#deps.plannings.save(
      planning,
      PlanningRevisionEntity.reconstitute(revision)
        .changeRules(validateGridRules(input.rules))
        .snapshot(),
    );
    return { id: planning.id, version: planning.version + 1 };
  }
}
