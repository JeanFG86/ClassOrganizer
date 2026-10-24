import { bindUseCase } from '../../../../shared/use-case.ts';
import type { Clock, IdGenerator } from '../../../../shared/ports.ts';
import { NotFoundError } from '../../../../shared/domain-error.ts';
import { StaleVersionError } from '../../../../shared/versioning.ts';
import {
  ADMIN_ROLES,
  READ_ROLES,
  WRITE_ROLES,
  requireRole,
  type Actor,
} from '../../../access/domain/access.ts';
import { translateCatalog } from '../../domain/catalog-translation.ts';
import { diagnoseGrid, isGridComplete } from '../../domain/diagnosis.ts';
import { DEFAULT_GRID_RULES, type GridRules } from '../../domain/grid.ts';
import {
  PlanningError,
  PlanningEntity,
  PlanningRevisionEntity,
  validatePlanningInput,
  type CatalogSnapshot,
  type Planning,
  type PlanningRevision,
} from '../../domain/planning.ts';
import { carryGrid } from '../grid-transfer.ts';
import type { GridRepository, PlanningRepository } from '../ports/index.ts';

export type { PlanningRepository } from '../ports/index.ts';

export type PlanningsDependencies = {
  repository: PlanningRepository;
  grids: GridRepository;
  clock: Clock;
  ids: IdGenerator;
};
function planningsContext(deps: PlanningsDependencies) {
  const { repository, grids, clock, ids } = deps;
  async function find(id: string, version?: number) {
    const planning = await repository.find(id);
    if (!planning) throw new NotFoundError('planning.not_found', 'Planejamento não encontrado.');
    if (version !== undefined && planning.version !== version) throw new StaleVersionError();
    return planning;
  }
  function draft(
    planningId: string,
    number: number,
    snapshot: CatalogSnapshot,
    gridRules: GridRules,
    actor: Actor,
  ): PlanningRevision {
    return {
      id: ids.next(),
      planningId,
      number,
      snapshot,
      gridRules,
      createdAt: clock.now(),
      createdBy: actor.id,
      rulesReviewed: false,
      availabilityReviewed: false,
      sealedAt: null,
    };
  }
  async function requireCompleteGrid(revision: PlanningRevision) {
    const diagnosis = diagnoseGrid(
      translateCatalog(revision.snapshot, revision.gridRules, revision.id),
      await grids.placements(revision.id),
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
  return { deps, repository, grids, clock, ids, find, draft, requireCompleteGrid };
}
export class ListPlannings {
  readonly #deps: PlanningsDependencies;
  constructor(deps: PlanningsDependencies) {
    this.#deps = deps;
  }
  async execute(actor: Actor) {
    const { repository } = planningsContext(this.#deps);

    requireRole(actor, READ_ROLES);

    return repository.list();
  }
}
export class GetPlanning {
  readonly #deps: PlanningsDependencies;
  constructor(deps: PlanningsDependencies) {
    this.#deps = deps;
  }
  async execute(actor: Actor, id: string) {
    const { repository, find } = planningsContext(this.#deps);

    requireRole(actor, READ_ROLES);

    const planning = await find(id);

    return { ...planning, revisions: await repository.revisions(id) };
  }
}
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
    },
  ) {
    const { repository, grids, clock, ids, find, draft } = planningsContext(this.#deps);

    requireRole(actor, WRITE_ROLES);

    const name = validatePlanningInput(input.name, input.year);

    let source: { planning: Planning; revision: PlanningRevision } | null = null;

    if (input.sourceId) {
      if (input.sourceVersion === undefined) throw new StaleVersionError();
      const planning = await find(input.sourceId, input.sourceVersion);
      const revision = (await repository.revisions(input.sourceId)).at(-1);
      if (!revision)
        throw new PlanningError('planning.empty', 'O planejamento não possui revisão para copiar.');
      source = { planning, revision };
    }

    const planning: Planning = PlanningEntity.create({
      id: ids.next(),
      name,
      year: input.year,
      createdAt: clock.now(),
      copiedFromId: input.sourceId ?? null,
    }).snapshot();

    const revision = draft(
      planning.id,
      1,
      source ? source.revision.snapshot : await repository.capture(),
      source ? source.revision.gridRules : DEFAULT_GRID_RULES,
      actor,
    );

    await repository.add(planning, revision);

    if (source)
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
export class ChangePlanning {
  readonly #deps: PlanningsDependencies;
  constructor(deps: PlanningsDependencies) {
    this.#deps = deps;
  }
  async execute(
    actor: Actor,
    input: {
      id: string;
      version: number;
      operation: 'draft' | 'review' | 'seal' | 'archive' | 'restore';
      revisionId?: string | undefined;
      rulesReviewed?: boolean | undefined;
      availabilityReviewed?: boolean | undefined;
    },
  ) {
    const { repository, grids, clock, ids, find, draft, requireCompleteGrid } = planningsContext(
      this.#deps,
    );

    requireRole(
      actor,
      input.operation === 'archive' || input.operation === 'restore' ? ADMIN_ROLES : WRITE_ROLES,
    );

    let planning = await find(input.id, input.version);

    if (input.operation === 'archive' || input.operation === 'restore') {
      const entity = PlanningEntity.reconstitute(planning);
      planning = (
        input.operation === 'archive' ? entity.archive(clock.now()) : entity.restore()
      ).snapshot();
      await repository.save(planning);
    } else {
      let latest = (await repository.revisions(planning.id)).at(-1);
      if (!latest || latest.id !== input.revisionId)
        throw new PlanningError(
          'planning.revision_invalid',
          'Atualize a página e selecione a revisão atual.',
        );
      if (planning.archivedAt)
        throw new PlanningError('planning.archived', 'Restaure o planejamento antes de alterá-lo.');
      if (input.operation === 'draft') {
        if (!latest.sealedAt)
          throw new PlanningError(
            'planning.draft_exists',
            'Conclua o rascunho atual antes de abrir outro.',
          );
        const next = draft(
          planning.id,
          latest.number + 1,
          await repository.capture(),
          latest.gridRules,
          actor,
        );
        await repository.save(planning, next);
        await carryGrid(
          { grids, clock, ids },
          { from: latest, to: next, actor, origin: 'revisão ' + latest.number },
        );
      } else {
        PlanningEntity.reconstitute(planning).requireDraft(latest);
        if (input.operation === 'review') {
          latest = PlanningRevisionEntity.reconstitute(latest)
            .review(input.rulesReviewed, input.availabilityReviewed)
            .snapshot();
        } else {
          const entity = PlanningRevisionEntity.reconstitute(latest);
          entity.requireReviewed();
          await requireCompleteGrid(latest);
          latest = entity.seal(clock.now()).snapshot();
        }
        await repository.save(planning, latest);
      }
    }

    return { ...planning, version: planning.version + 1 };
  }
}
export function makePlannings(deps: PlanningsDependencies) {
  return {
    list: bindUseCase(new ListPlannings(deps)),
    detail: bindUseCase(new GetPlanning(deps)),
    create: bindUseCase(new CreatePlanning(deps)),
    change: bindUseCase(new ChangePlanning(deps)),
  };
}
