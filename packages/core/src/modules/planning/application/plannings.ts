import type { Clock, IdGenerator } from '../../../shared/ports.ts';
import { NotFoundError } from '../../../shared/domain-error.ts';
import { StaleVersionError } from '../../../shared/versioning.ts';
import {
  ADMIN_ROLES,
  READ_ROLES,
  WRITE_ROLES,
  requireRole,
  type Actor,
} from '../../access/domain/access.ts';
import {
  PlanningError,
  requireDraft,
  validatePlanningInput,
  type CatalogSnapshot,
  type Planning,
  type PlanningRevision,
} from '../domain/planning.ts';

export interface PlanningRepository {
  list(): Promise<Planning[]>;
  find(id: string): Promise<Planning | null>;
  revisions(planningId: string): Promise<PlanningRevision[]>;
  add(planning: Planning, revision: PlanningRevision): Promise<void>;
  save(planning: Planning, revision?: PlanningRevision): Promise<void>;
  capture(): Promise<CatalogSnapshot>;
}
export function makePlannings(deps: {
  repository: PlanningRepository;
  clock: Clock;
  ids: IdGenerator;
}) {
  const { repository, clock, ids } = deps;
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
    actor: Actor,
  ): PlanningRevision {
    return {
      id: ids.next(),
      planningId,
      number,
      snapshot,
      createdAt: clock.now(),
      createdBy: actor.id,
      rulesReviewed: false,
      availabilityReviewed: false,
      sealedAt: null,
    };
  }
  return {
    async list(actor: Actor) {
      requireRole(actor, READ_ROLES);
      return repository.list();
    },
    async detail(actor: Actor, id: string) {
      requireRole(actor, READ_ROLES);
      const planning = await find(id);
      return { ...planning, revisions: await repository.revisions(id) };
    },
    async create(
      actor: Actor,
      input: {
        name: string;
        year: number;
        sourceId?: string | undefined;
        sourceVersion?: number | undefined;
      },
    ) {
      requireRole(actor, WRITE_ROLES);
      const name = validatePlanningInput(input.name, input.year);
      let snapshot: CatalogSnapshot;
      if (input.sourceId) {
        if (input.sourceVersion === undefined) throw new StaleVersionError();
        await find(input.sourceId, input.sourceVersion);
        const source = (await repository.revisions(input.sourceId)).at(-1);
        if (!source)
          throw new PlanningError(
            'planning.empty',
            'O planejamento não possui revisão para copiar.',
          );
        snapshot = source.snapshot;
      } else snapshot = await repository.capture();
      const planning: Planning = {
        id: ids.next(),
        name,
        year: input.year,
        version: 1,
        createdAt: clock.now(),
        archivedAt: null,
        copiedFromId: input.sourceId ?? null,
      };
      await repository.add(planning, draft(planning.id, 1, snapshot, actor));
      return planning;
    },
    async change(
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
      requireRole(
        actor,
        input.operation === 'archive' || input.operation === 'restore' ? ADMIN_ROLES : WRITE_ROLES,
      );
      const planning = await find(input.id, input.version);
      if (input.operation === 'archive' || input.operation === 'restore') {
        planning.archivedAt = input.operation === 'archive' ? clock.now() : null;
        await repository.save(planning);
      } else {
        const latest = (await repository.revisions(planning.id)).at(-1);
        if (!latest || latest.id !== input.revisionId)
          throw new PlanningError(
            'planning.revision_invalid',
            'Atualize a página e selecione a revisão atual.',
          );
        if (planning.archivedAt)
          throw new PlanningError(
            'planning.archived',
            'Restaure o planejamento antes de alterá-lo.',
          );
        if (input.operation === 'draft') {
          if (!latest.sealedAt)
            throw new PlanningError(
              'planning.draft_exists',
              'Conclua o rascunho atual antes de abrir outro.',
            );
          await repository.save(
            planning,
            draft(planning.id, latest.number + 1, await repository.capture(), actor),
          );
        } else {
          requireDraft(planning, latest);
          if (input.operation === 'review') {
            if (input.rulesReviewed === undefined || input.availabilityReviewed === undefined)
              throw new PlanningError(
                'planning.review_invalid',
                'Informe a revisão das regras e da disponibilidade.',
                'validation',
              );
            latest.rulesReviewed = input.rulesReviewed;
            latest.availabilityReviewed = input.availabilityReviewed;
          } else {
            if (!latest.rulesReviewed || !latest.availabilityReviewed)
              throw new PlanningError(
                'planning.review_required',
                'Revise as regras e a disponibilidade antes de concluir.',
              );
            latest.sealedAt = clock.now();
          }
          await repository.save(planning, latest);
        }
      }
      return { ...planning, version: planning.version + 1 };
    },
  };
}
