import type { Clock, IdGenerator } from '../../../../shared/ports.ts';
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
import { PlanningError } from '../../domain/planning.ts';
import { makeGridAccess, undoTarget } from '../grid-access.ts';
import type { GridRepository, PlanningRepository } from '../ports/index.ts';

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
export type TimetableGridDependencies = {
  plannings: PlanningRepository;
  grids: GridRepository;
  clock: Clock;
  ids: IdGenerator;
};
function timetableGridContext(deps: TimetableGridDependencies) {
  const { plannings, grids } = deps;
  const { load, loadDraft, commit } = makeGridAccess(deps);
  async function prepare(
    actor: Actor,
    input: { id: string; version: number; revisionId: string; operation: GridOperation },
  ) {
    requireRole(actor, WRITE_ROLES);
    const loaded = await loadDraft(input);
    const delta = operationDelta(loaded.placements, input.operation);
    const evaluation = evaluate(
      loaded.translated,
      loaded.placements,
      applyDelta(loaded.placements, delta),
      describeOperation(loaded.translated, input.operation),
    );
    return { loaded, delta, evaluation };
  }
  return { deps, plannings, grids, load, loadDraft, commit, prepare };
}
export class ViewTimetableGrid {
  readonly #deps: TimetableGridDependencies;
  constructor(deps: TimetableGridDependencies) {
    this.#deps = deps;
  }
  async execute(actor: Actor, input: { id: string; revisionId?: string | undefined }) {
    const { grids, load } = timetableGridContext(this.#deps);

    requireRole(actor, READ_ROLES);

    const { planning, revisions, revision, placements, translated, editable } = await load(
      input.id,
      input.revisionId,
    );

    const history = await grids.history(revision.id);

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
export class PreviewTimetableGrid {
  readonly #deps: TimetableGridDependencies;
  constructor(deps: TimetableGridDependencies) {
    this.#deps = deps;
  }
  async execute(
    actor: Actor,
    input: { id: string; version: number; revisionId: string; operation: GridOperation },
  ): Promise<GridEvaluation> {
    const { prepare } = timetableGridContext(this.#deps);

    return (await prepare(actor, input)).evaluation;
  }
}
export class ApplyTimetableGrid {
  readonly #deps: TimetableGridDependencies;
  constructor(deps: TimetableGridDependencies) {
    this.#deps = deps;
  }
  async execute(
    actor: Actor,
    input: { id: string; version: number; revisionId: string; operation: GridOperation },
  ) {
    const { commit, prepare } = timetableGridContext(this.#deps);

    const { loaded, delta, evaluation } = await prepare(actor, input);

    if (!evaluation.accepted) rejected(evaluation);

    return commit(actor, loaded.planning, loaded.revision.id, {
      kind: 'operation',
      summary: evaluation.summary,
      delta,
      revertsId: null,
    });
  }
}
export class UndoTimetableGrid {
  readonly #deps: TimetableGridDependencies;
  constructor(deps: TimetableGridDependencies) {
    this.#deps = deps;
  }
  async execute(actor: Actor, input: { id: string; version: number; revisionId: string }) {
    const { grids, loadDraft, commit } = timetableGridContext(this.#deps);

    requireRole(actor, WRITE_ROLES);

    const loaded = await loadDraft(input);

    const target = undoTarget(await grids.history(loaded.revision.id));

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

    return commit(actor, loaded.planning, loaded.revision.id, {
      kind: 'undo',
      summary: evaluation.summary,
      delta,
      revertsId: target.id,
    });
  }
}
export class ChangeGridRules {
  readonly #deps: TimetableGridDependencies;
  constructor(deps: TimetableGridDependencies) {
    this.#deps = deps;
  }
  async execute(
    actor: Actor,
    input: { id: string; version: number; revisionId: string; rules: GridRules },
  ) {
    const { plannings, loadDraft } = timetableGridContext(this.#deps);

    requireRole(actor, WRITE_ROLES);

    const { planning, revision } = await loadDraft(input);

    await plannings.save(planning, {
      ...revision,
      gridRules: validateGridRules(input.rules),
      rulesReviewed: false,
    });

    return { id: planning.id, version: planning.version + 1 };
  }
}
