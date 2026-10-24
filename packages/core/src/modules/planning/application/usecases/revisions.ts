import type { Clock, IdGenerator } from '../../../../shared/ports.ts';
import { NotFoundError } from '../../../../shared/domain-error.ts';
import { StaleVersionError } from '../../../../shared/versioning.ts';
import { requireRole, READ_ROLES, WRITE_ROLES, type Actor } from '../../../access/domain/index.ts';
import {
  PlanningError,
  PlanningRevisionEntity,
  type PlanningRevision,
} from '../../domain/planning.ts';
import { compareRevisions } from '../../domain/revision-comparison.ts';
import { reviewChecklist, type ChecklistReference } from '../../domain/review-checklist.ts';
import type { GridRepository, PlanningRepository } from '../ports/index.ts';
import { saveRevisionCopy, type RevisionCopyDependencies } from '../services/revision-copy.ts';

async function load(repository: PlanningRepository, id: string, version?: number) {
  const planning = await repository.find(id);
  if (!planning) throw new NotFoundError('planning.not_found', 'Planejamento não encontrado.');
  if (version !== undefined && planning.version !== version) throw new StaleVersionError();
  if (version !== undefined && planning.archivedAt)
    throw new PlanningError('planning.archived', 'Restaure o planejamento antes de alterá-lo.');
  return { planning, revisions: await repository.revisions(id) };
}
function revisionOf(revisions: Awaited<ReturnType<typeof load>>['revisions'], id: string) {
  const revision = revisions.find((item) => item.id === id);
  if (!revision) throw new NotFoundError('planning.revision_not_found', 'Revisão não encontrada.');
  return revision;
}

export type RenamePlanningRevisionDependencies = { repository: PlanningRepository };
export class RenamePlanningRevision {
  readonly #deps: RenamePlanningRevisionDependencies;
  constructor(deps: RenamePlanningRevisionDependencies) {
    this.#deps = deps;
  }
  async execute(
    actor: Actor,
    input: { id: string; version: number; revisionId: string; name: string },
  ) {
    requireRole(actor, WRITE_ROLES);
    const { planning, revisions } = await load(this.#deps.repository, input.id, input.version);
    const revision = PlanningRevisionEntity.reconstitute(revisionOf(revisions, input.revisionId))
      .rename(input.name)
      .snapshot();
    await this.#deps.repository.save(planning, revision);
    return { id: planning.id, version: planning.version + 1 };
  }
}

export type ComparePlanningRevisionsDependencies = {
  repository: PlanningRepository;
  grids: GridRepository;
};
export class ComparePlanningRevisions {
  readonly #deps: ComparePlanningRevisionsDependencies;
  constructor(deps: ComparePlanningRevisionsDependencies) {
    this.#deps = deps;
  }
  async execute(actor: Actor, input: { id: string; fromRevisionId: string; toRevisionId: string }) {
    requireRole(actor, READ_ROLES);
    const { repository, grids } = this.#deps;
    const { planning, revisions } = await load(repository, input.id);
    const from = revisionOf(revisions, input.fromRevisionId);
    const to = revisionOf(revisions, input.toRevisionId);
    const comparison = compareRevisions(
      from,
      to,
      await grids.placements(from.id),
      await grids.placements(to.id),
    );
    // A leitura não bloqueia escritas; recusa uma comparação montada durante uma alteração.
    if ((await repository.find(planning.id))?.version !== planning.version)
      throw new StaleVersionError();
    return {
      version: planning.version,
      ...comparison,
    };
  }
}

export type GetRevisionChecklistDependencies = { repository: PlanningRepository };
/**
 * Checklist de conferência de uma revisão (ADR 0022). A referência é a revisão anterior do
 * mesmo planejamento ou, na primeira revisão de uma cópia, a revisão de origem.
 */
export class GetRevisionChecklist {
  readonly #deps: GetRevisionChecklistDependencies;
  constructor(deps: GetRevisionChecklistDependencies) {
    this.#deps = deps;
  }
  async execute(actor: Actor, input: { id: string; revisionId: string }) {
    requireRole(actor, READ_ROLES);
    const { repository } = this.#deps;
    const { planning, revisions } = await load(repository, input.id);
    const revision = revisionOf(revisions, input.revisionId);
    const checklist = reviewChecklist(revision, await this.#reference(revisions, revision));
    // A leitura não bloqueia escritas; recusa um checklist montado durante uma alteração.
    if ((await repository.find(planning.id))?.version !== planning.version)
      throw new StaleVersionError();
    return { version: planning.version, revisionId: revision.id, ...checklist };
  }

  async #reference(
    revisions: readonly PlanningRevision[],
    revision: PlanningRevision,
  ): Promise<ChecklistReference | null> {
    const previous = revisions.find((item) => item.number === revision.number - 1);
    if (previous) return { revision: previous, label: 'revisão ' + previous.number };
    if (!revision.sourceRevisionId) return null;
    const source = await this.#deps.repository.revision(revision.sourceRevisionId);
    const origin = source && (await this.#deps.repository.find(source.planningId));
    if (!source || !origin) return null;
    return { revision: source, label: origin.name + ', revisão ' + source.number };
  }
}

export type RestorePlanningRevisionDependencies = ComparePlanningRevisionsDependencies & {
  clock: Clock;
  ids: IdGenerator;
};
/** Restauração cria outro rascunho; a revisão anterior e o rascunho atual ficam preservados. */
export class RestorePlanningRevision {
  readonly #deps: RestorePlanningRevisionDependencies;
  constructor(deps: RestorePlanningRevisionDependencies) {
    this.#deps = deps;
  }
  async execute(actor: Actor, input: { id: string; version: number; revisionId: string }) {
    requireRole(actor, WRITE_ROLES);
    const { repository, clock, ids } = this.#deps;
    const { planning, revisions } = await load(repository, input.id, input.version);
    const source = revisionOf(revisions, input.revisionId);
    const latest = revisions.at(-1);
    if (!latest || latest.id === source.id)
      throw new PlanningError(
        'planning.restore_current',
        'Selecione uma revisão anterior para restaurar.',
      );
    const revision = PlanningRevisionEntity.restore(
      {
        id: ids.next(),
        planningId: planning.id,
        number: latest.number + 1,
        createdAt: clock.now(),
        createdBy: actor.id,
      },
      source,
    ).snapshot();
    return saveRevisionCopy(this.#deps, {
      planning,
      source,
      revision,
      actor,
      summary:
        'Restaurou a revisão ' + source.number + ' com seus dados, regras e grade originais.',
    });
  }
}

export type PreservePlanningRevisionDependencies = RevisionCopyDependencies;
/** Guarda uma versão intermediária e continua em outro rascunho, sem aprovar uma grade incompleta. */
export class PreservePlanningRevision {
  readonly #deps: PreservePlanningRevisionDependencies;
  constructor(deps: PreservePlanningRevisionDependencies) {
    this.#deps = deps;
  }
  async execute(actor: Actor, input: { id: string; version: number; revisionId: string }) {
    requireRole(actor, WRITE_ROLES);
    const { repository, clock, ids } = this.#deps;
    const { planning, revisions } = await load(repository, input.id, input.version);
    const source = revisionOf(revisions, input.revisionId);
    if (source.id !== revisions.at(-1)?.id || source.sealedAt)
      throw new PlanningError(
        'planning.revision_invalid',
        'Selecione o rascunho atual para preservar.',
      );
    const revision = PlanningRevisionEntity.open({
      id: ids.next(),
      planningId: planning.id,
      number: source.number + 1,
      createdAt: clock.now(),
      createdBy: actor.id,
      snapshot: source.snapshot,
      gridRules: source.gridRules,
    }).snapshot();
    return saveRevisionCopy(this.#deps, {
      planning,
      source,
      revision,
      actor,
      summary: 'Continuou a partir da revisão ' + source.number + ', preservada no histórico.',
    });
  }
}
