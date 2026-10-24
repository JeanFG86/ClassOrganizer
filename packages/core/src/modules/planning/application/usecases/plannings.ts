import type { Clock, IdGenerator } from '../../../../shared/ports.ts';
import { NotFoundError } from '../../../../shared/domain-error.ts';
import { StaleVersionError } from '../../../../shared/versioning.ts';
import {
  ADMIN_ROLES,
  READ_ROLES,
  WRITE_ROLES,
  requireRole,
  type Actor,
} from '../../../access/domain/index.ts';
import { translateCatalog } from '../../domain/catalog-translation.ts';
import { diagnoseGrid, isGridComplete } from '../../domain/diagnosis.ts';
import { DEFAULT_GRID_RULES } from '../../domain/grid.ts';
import {
  PlanningEntity,
  PlanningError,
  PlanningRevisionEntity,
  type Planning,
  type PlanningRevision,
} from '../../domain/planning.ts';
import type { GridRepository, PlanningRepository } from '../ports/index.ts';
import { carryGrid } from '../services/grid-transfer.ts';

/** Dependências de todas as operações de planejamento, usadas pela composição. */
export type PlanningsDependencies = {
  repository: PlanningRepository;
  grids: GridRepository;
  clock: Clock;
  ids: IdGenerator;
};

/** Referência à revisão atual, exigida pelas operações que alteram um rascunho. */
type RevisionRef = { id: string; version: number; revisionId?: string | undefined };

async function findPlanning(
  repository: PlanningRepository,
  id: string,
  version?: number,
): Promise<Planning> {
  const planning = await repository.find(id);
  if (!planning) throw new NotFoundError('planning.not_found', 'Planejamento não encontrado.');
  if (version !== undefined && planning.version !== version) throw new StaleVersionError();
  return planning;
}

/** Carrega o planejamento ativo e confere que a revisão informada é a mais recente. */
async function findCurrentRevision(repository: PlanningRepository, ref: RevisionRef) {
  const planning = await findPlanning(repository, ref.id, ref.version);
  const latest = (await repository.revisions(planning.id)).at(-1);
  if (!latest || latest.id !== ref.revisionId)
    throw new PlanningError(
      'planning.revision_invalid',
      'Atualize a página e selecione a revisão atual.',
    );
  if (planning.archivedAt)
    throw new PlanningError('planning.archived', 'Restaure o planejamento antes de alterá-lo.');
  return { planning, latest };
}

/** A gravação avança a versão do planejamento em uma unidade. */
function saved(planning: Planning): Planning {
  return { ...planning, version: planning.version + 1 };
}

export type ListPlanningsDependencies = Pick<PlanningsDependencies, 'repository'>;
export class ListPlannings {
  readonly #deps: ListPlanningsDependencies;
  constructor(deps: ListPlanningsDependencies) {
    this.#deps = deps;
  }
  async execute(actor: Actor) {
    requireRole(actor, READ_ROLES);
    return this.#deps.repository.list();
  }
}

export type GetPlanningDependencies = Pick<PlanningsDependencies, 'repository'>;
export class GetPlanning {
  readonly #deps: GetPlanningDependencies;
  constructor(deps: GetPlanningDependencies) {
    this.#deps = deps;
  }
  async execute(actor: Actor, id: string) {
    const { repository } = this.#deps;
    requireRole(actor, READ_ROLES);
    const planning = await findPlanning(repository, id);
    return { ...planning, revisions: await repository.revisions(id) };
  }
}

/**
 * Cria um planejamento com a fotografia atual ou copia a última revisão de outro. A cópia usa a
 * fotografia da origem ou os cadastros atuais e pode trazer a grade da origem (ADR 0022).
 */
export class CreatePlanning {
  readonly #deps: PlanningsDependencies;
  constructor(deps: PlanningsDependencies) {
    this.#deps = deps;
  }
  async execute(
    actor: Actor,
    input: {
      name: string;
      year: number;
      sourceId?: string | undefined;
      sourceVersion?: number | undefined;
      /** `source`: fotografia da origem (padrão); `current`: cadastros atuais. */
      base?: 'source' | 'current' | undefined;
      /** Traz a grade da origem para a cópia; padrão verdadeiro. */
      keepGrid?: boolean | undefined;
    },
  ): Promise<Planning> {
    const { repository, grids, clock, ids } = this.#deps;
    requireRole(actor, WRITE_ROLES);
    const planning = PlanningEntity.create({
      id: ids.next(),
      name: input.name,
      year: input.year,
      createdAt: clock.now(),
      copiedFromId: input.sourceId ?? null,
    }).snapshot();

    let source: { planning: Planning; revision: PlanningRevision } | null = null;
    if (input.sourceId) {
      if (input.sourceVersion === undefined) throw new StaleVersionError();
      const original = await findPlanning(repository, input.sourceId, input.sourceVersion);
      const revision = (await repository.revisions(input.sourceId)).at(-1);
      if (!revision)
        throw new PlanningError('planning.empty', 'O planejamento não possui revisão para copiar.');
      source = { planning: original, revision };
    }

    const revision = PlanningRevisionEntity.open({
      id: ids.next(),
      planningId: planning.id,
      number: 1,
      snapshot:
        source && input.base !== 'current' ? source.revision.snapshot : await repository.capture(),
      gridRules: source ? source.revision.gridRules : DEFAULT_GRID_RULES,
      createdAt: clock.now(),
      createdBy: actor.id,
      sourceRevisionId: source?.revision.id,
    }).snapshot();
    await repository.add(planning, revision);
    if (source && input.keepGrid !== false)
      await carryGrid(
        { grids, clock, ids },
        {
          from: source.revision,
          to: revision,
          actor,
          origin: source.planning.name + ', revisão ' + source.revision.number,
        },
      );
    return planning;
  }
}

/** Abre um rascunho novo depois de uma revisão concluída, trazendo a grade dela. */
export class OpenPlanningDraft {
  readonly #deps: PlanningsDependencies;
  constructor(deps: PlanningsDependencies) {
    this.#deps = deps;
  }
  async execute(actor: Actor, input: RevisionRef): Promise<Planning> {
    const { repository, grids, clock, ids } = this.#deps;
    requireRole(actor, WRITE_ROLES);
    const { planning, latest } = await findCurrentRevision(repository, input);
    if (!latest.sealedAt)
      throw new PlanningError(
        'planning.draft_exists',
        'Conclua o rascunho atual antes de abrir outro.',
      );
    const next = PlanningRevisionEntity.open({
      id: ids.next(),
      planningId: planning.id,
      number: latest.number + 1,
      snapshot: await repository.capture(),
      gridRules: latest.gridRules,
      createdAt: clock.now(),
      createdBy: actor.id,
    }).snapshot();
    await repository.save(planning, next);
    await carryGrid(
      { grids, clock, ids },
      { from: latest, to: next, actor, origin: 'revisão ' + latest.number },
    );
    return saved(planning);
  }
}

export type ReviewPlanningRevisionDependencies = Pick<PlanningsDependencies, 'repository'>;
/** Registra os itens conferidos do checklist do rascunho (ADR 0022). */
export class ReviewPlanningRevision {
  readonly #deps: ReviewPlanningRevisionDependencies;
  constructor(deps: ReviewPlanningRevisionDependencies) {
    this.#deps = deps;
  }
  async execute(
    actor: Actor,
    input: RevisionRef & { reviewedItems?: readonly string[] | undefined },
  ): Promise<Planning> {
    const { repository } = this.#deps;
    requireRole(actor, WRITE_ROLES);
    const { planning, latest } = await findCurrentRevision(repository, input);
    PlanningEntity.reconstitute(planning).requireDraft(latest);
    const reviewed = PlanningRevisionEntity.reconstitute(latest)
      .review(input.reviewedItems)
      .snapshot();
    await repository.save(planning, reviewed);
    return saved(planning);
  }
}

export type SealPlanningRevisionDependencies = Pick<
  PlanningsDependencies,
  'repository' | 'grids' | 'clock'
>;
/** Conclui o rascunho conferido; a conclusão exige uma grade completa e sem problemas (ADR 0013). */
export class SealPlanningRevision {
  readonly #deps: SealPlanningRevisionDependencies;
  constructor(deps: SealPlanningRevisionDependencies) {
    this.#deps = deps;
  }
  async execute(actor: Actor, input: RevisionRef): Promise<Planning> {
    const { repository, clock } = this.#deps;
    requireRole(actor, WRITE_ROLES);
    const { planning, latest } = await findCurrentRevision(repository, input);
    PlanningEntity.reconstitute(planning).requireDraft(latest);
    const revision = PlanningRevisionEntity.reconstitute(latest);
    revision.requireReviewed();
    await this.#requireCompleteGrid(latest);
    await repository.save(planning, revision.seal(clock.now()).snapshot());
    return saved(planning);
  }

  async #requireCompleteGrid(revision: PlanningRevision): Promise<void> {
    const diagnosis = diagnoseGrid(
      translateCatalog(revision.snapshot, revision.gridRules, revision.id),
      await this.#deps.grids.placements(revision.id),
    );
    if (isGridComplete(diagnosis)) return;
    const issues = [...diagnosis.model, ...diagnosis.problems, ...diagnosis.pending];
    throw new PlanningError(
      'planning.grid_incomplete',
      'A grade precisa estar completa e sem problemas para concluir a revisão. ' +
        (issues.length === 1
          ? 'Há 1 pendência: '
          : 'Há ' + issues.length + ' pendências; a primeira: ') +
        (issues[0]?.message ?? ''),
    );
  }
}

export type ArchivePlanningDependencies = Pick<PlanningsDependencies, 'repository' | 'clock'>;
export class ArchivePlanning {
  readonly #deps: ArchivePlanningDependencies;
  constructor(deps: ArchivePlanningDependencies) {
    this.#deps = deps;
  }
  async execute(actor: Actor, input: { id: string; version: number }): Promise<Planning> {
    const { repository, clock } = this.#deps;
    requireRole(actor, ADMIN_ROLES);
    const planning = await findPlanning(repository, input.id, input.version);
    const archived = PlanningEntity.reconstitute(planning).archive(clock.now()).snapshot();
    await repository.save(archived);
    return saved(archived);
  }
}

export type RestorePlanningDependencies = Pick<PlanningsDependencies, 'repository'>;
export class RestorePlanning {
  readonly #deps: RestorePlanningDependencies;
  constructor(deps: RestorePlanningDependencies) {
    this.#deps = deps;
  }
  async execute(actor: Actor, input: { id: string; version: number }): Promise<Planning> {
    const { repository } = this.#deps;
    requireRole(actor, ADMIN_ROLES);
    const planning = await findPlanning(repository, input.id, input.version);
    const restored = PlanningEntity.reconstitute(planning).restore().snapshot();
    await repository.save(restored);
    return saved(restored);
  }
}

export type PlanningChangeOperation = 'draft' | 'review' | 'seal' | 'archive' | 'restore';

/**
 * Encaminha a operação pedida pelo contrato público (`operation`) ao caso de uso
 * correspondente. A auditoria registra a operação como `planning.<operation>`.
 */
export class ChangePlanning {
  readonly #operations: {
    readonly [Operation in PlanningChangeOperation]: {
      execute(actor: Actor, input: RevisionRef): Promise<Planning>;
    };
  };
  constructor(deps: PlanningsDependencies) {
    this.#operations = {
      draft: new OpenPlanningDraft(deps),
      review: new ReviewPlanningRevision(deps),
      seal: new SealPlanningRevision(deps),
      archive: new ArchivePlanning(deps),
      restore: new RestorePlanning(deps),
    };
  }
  execute(
    actor: Actor,
    input: RevisionRef & {
      operation: PlanningChangeOperation;
      reviewedItems?: readonly string[] | undefined;
    },
  ): Promise<Planning> {
    return this.#operations[input.operation].execute(actor, input);
  }
}
