import type { Clock, IdGenerator } from '../../../../shared/ports.ts';
import { NotFoundError } from '../../../../shared/domain-error.ts';
import { StaleVersionError } from '../../../../shared/versioning.ts';
import type { Actor } from '../../../access/domain/index.ts';
import { translateCatalog } from '../../domain/catalog-translation.ts';
import { PlanningEntity, PlanningError, type Planning } from '../../domain/planning.ts';
import type {
  GridChange,
  GridHistoryEntry,
  GridRepository,
  PlanningRepository,
} from '../ports/index.ts';

/** Desfaz a alteração mais recente ainda não desfeita; desfazer não tem refazer. */
export function undoTarget(history: readonly GridHistoryEntry[]): GridHistoryEntry | null {
  const reverted = new Set(history.flatMap((c) => (c.revertsId ? [c.revertsId] : [])));
  return (
    history.findLast(
      (c) => (c.kind === 'operation' || c.kind === 'generation') && !reverted.has(c.id),
    ) ?? null
  );
}

export type GridReaderDependencies = {
  plannings: PlanningRepository;
  grids: GridRepository;
};

/** Leitura da grade de uma revisão, com a fotografia traduzida para o validador (ADR 0013). */
export class GridReader {
  readonly #deps: GridReaderDependencies;
  constructor(deps: GridReaderDependencies) {
    this.#deps = deps;
  }

  async load(id: string, revisionId?: string, version?: number) {
    const { plannings, grids } = this.#deps;
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
  async loadDraft(input: { id: string; version: number; revisionId: string }) {
    const loaded = await this.load(input.id, input.revisionId, input.version);
    if (loaded.revisions.at(-1)?.id !== loaded.revision.id)
      throw new PlanningError(
        'planning.revision_invalid',
        'Atualize a página e selecione a revisão atual.',
      );
    PlanningEntity.reconstitute(loaded.planning).requireDraft(loaded.revision);
    return loaded;
  }
}

export type LoadedGrid = Awaited<ReturnType<GridReader['load']>>;

export type GridWriterDependencies = GridReaderDependencies & {
  clock: Clock;
  ids: IdGenerator;
};

/** Grava uma alteração da grade e o histórico, avançando a versão do planejamento. */
export class GridWriter {
  readonly #deps: GridWriterDependencies;
  constructor(deps: GridWriterDependencies) {
    this.#deps = deps;
  }

  async commit(
    actor: Actor,
    planning: Planning,
    revisionId: string,
    change: Pick<GridChange, 'kind' | 'summary' | 'delta' | 'revertsId'>,
  ) {
    const { plannings, grids, clock, ids } = this.#deps;
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
}
