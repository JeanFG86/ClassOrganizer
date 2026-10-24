import type { Clock, IdGenerator } from '../../../shared/ports.ts';
import { NotFoundError } from '../../../shared/domain-error.ts';
import { StaleVersionError } from '../../../shared/versioning.ts';
import { READ_ROLES, WRITE_ROLES, requireRole, type Actor } from '../../access/domain/access.ts';
import type { TimetableIssue } from '../../timetable/domain/model.ts';
import { translateCatalog, type TranslatedCatalog } from '../domain/catalog-translation.ts';
import { diagnoseGrid, issuesAdded, type GridDiagnosis } from '../domain/diagnosis.ts';
import {
  applyDelta,
  invertDelta,
  operationDelta,
  validateGridRules,
  type GridOperation,
  type GridRules,
  type Placement,
} from '../domain/grid.ts';
import { describeOperation } from '../domain/grid-summary.ts';
import { PlanningError, requireDraft, type Planning } from '../domain/planning.ts';
import type { GridChange, GridHistoryEntry, GridRepository, PlanningRepository } from './ports.ts';

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
/** Desfaz a alteração mais recente ainda não desfeita; desfazer não tem refazer. */
function undoTarget(history: readonly GridHistoryEntry[]): GridHistoryEntry | null {
  const reverted = new Set(history.flatMap((c) => (c.revertsId ? [c.revertsId] : [])));
  return history.findLast((c) => c.kind === 'operation' && !reverted.has(c.id)) ?? null;
}

export function makeTimetableGrid(deps: {
  plannings: PlanningRepository;
  grids: GridRepository;
  clock: Clock;
  ids: IdGenerator;
}) {
  const { plannings, grids, clock, ids } = deps;
  async function load(id: string, revisionId?: string, version?: number) {
    const planning = await plannings.find(id);
    if (!planning) throw new NotFoundError('planning.not_found', 'Planejamento não encontrado.');
    if (version !== undefined && planning.version !== version) throw new StaleVersionError();
    const revisions = await plannings.revisions(id);
    const revision = revisionId ? revisions.find((r) => r.id === revisionId) : revisions.at(-1);
    if (!revision)
      throw new NotFoundError('planning.revision_not_found', 'Revisão não encontrada.');
    const placements = await grids.placements(revision.id);
    const translated = translateCatalog(revision.snapshot, revision.gridRules, revision.id);
    return { planning, revisions, revision, placements, translated };
  }
  /** Escritas valem só para o rascunho atual de um planejamento ativo. */
  async function loadDraft(input: { id: string; version: number; revisionId: string }) {
    const loaded = await load(input.id, input.revisionId, input.version);
    if (loaded.revisions.at(-1)?.id !== loaded.revision.id)
      throw new PlanningError(
        'planning.revision_invalid',
        'Atualize a página e selecione a revisão atual.',
      );
    requireDraft(loaded.planning, loaded.revision);
    return loaded;
  }
  async function commit(
    actor: Actor,
    planning: Planning,
    revisionId: string,
    change: Pick<GridChange, 'kind' | 'summary' | 'delta' | 'revertsId'>,
  ) {
    await plannings.save(planning);
    await grids.apply(revisionId, change.delta);
    const sequence = ((await grids.history(revisionId)).at(-1)?.sequence ?? 0) + 1;
    await grids.record({
      ...change,
      id: ids.next(),
      revisionId,
      sequence,
      actorId: actor.id,
      occurredAt: clock.now(),
    });
    return { id: planning.id, version: planning.version + 1, summary: change.summary };
  }
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
  return {
    async view(actor: Actor, input: { id: string; revisionId?: string | undefined }) {
      requireRole(actor, READ_ROLES);
      const { planning, revisions, revision, placements, translated } = await load(
        input.id,
        input.revisionId,
      );
      const history = await grids.history(revision.id);
      const reverted = new Set(history.flatMap((c) => (c.revertsId ? [c.revertsId] : [])));
      const editable =
        revisions.at(-1)?.id === revision.id && !revision.sealedAt && !planning.archivedAt;
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
    },
    /** Calcula o efeito da operação sem gravar nada. */
    async preview(
      actor: Actor,
      input: { id: string; version: number; revisionId: string; operation: GridOperation },
    ): Promise<GridEvaluation> {
      return (await prepare(actor, input)).evaluation;
    },
    /** Recalcula no servidor e aplica a operação inteira, ou nada. */
    async apply(
      actor: Actor,
      input: { id: string; version: number; revisionId: string; operation: GridOperation },
    ) {
      const { loaded, delta, evaluation } = await prepare(actor, input);
      if (!evaluation.accepted) rejected(evaluation);
      return commit(actor, loaded.planning, loaded.revision.id, {
        kind: 'operation',
        summary: evaluation.summary,
        delta,
        revertsId: null,
      });
    },
    async undo(actor: Actor, input: { id: string; version: number; revisionId: string }) {
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
    },
    /** Alterar regras exige nova conferência de regras e cargas. */
    async changeRules(
      actor: Actor,
      input: { id: string; version: number; revisionId: string; rules: GridRules },
    ) {
      requireRole(actor, WRITE_ROLES);
      const { planning, revision } = await loadDraft(input);
      await plannings.save(planning, {
        ...revision,
        gridRules: validateGridRules(input.rules),
        rulesReviewed: false,
      });
      return { id: planning.id, version: planning.version + 1 };
    },
  };
}
export type TimetableGrid = ReturnType<typeof makeTimetableGrid>;
