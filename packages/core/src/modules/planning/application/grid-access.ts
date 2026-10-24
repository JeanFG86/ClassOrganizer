import type { Clock, IdGenerator } from '../../../shared/ports.ts';
import { NotFoundError } from '../../../shared/domain-error.ts';
import { StaleVersionError } from '../../../shared/versioning.ts';
import type { Actor } from '../../access/domain/access.ts';
import { translateCatalog } from '../domain/catalog-translation.ts';
import { PlanningError, requireDraft, type Planning } from '../domain/planning.ts';
import type { GridChange, GridHistoryEntry, GridRepository, PlanningRepository } from './ports.ts';

/** Desfaz a alteração mais recente ainda não desfeita; desfazer não tem refazer. */
export function undoTarget(history: readonly GridHistoryEntry[]): GridHistoryEntry | null {
  const reverted = new Set(history.flatMap((c) => (c.revertsId ? [c.revertsId] : [])));
  return (
    history.findLast(
      (c) => (c.kind === 'operation' || c.kind === 'generation') && !reverted.has(c.id),
    ) ?? null
  );
}

/** Leitura da grade de uma revisão e gravação de alterações com histórico (ADR 0013). */
export function makeGridAccess(deps: {
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
    const editable =
      revisions.at(-1)?.id === revision.id && !revision.sealedAt && !planning.archivedAt;
    return { planning, revisions, revision, placements, translated, editable };
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
  return { load, loadDraft, commit };
}
export type GridAccess = ReturnType<typeof makeGridAccess>;
