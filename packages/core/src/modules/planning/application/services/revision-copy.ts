import type { Clock, IdGenerator } from '../../../../shared/ports.ts';
import type { Actor } from '../../../access/domain/index.ts';
import type { Planning, PlanningRevision } from '../../domain/planning.ts';
import type { GridRepository, PlanningRepository } from '../ports/index.ts';

export type RevisionCopyDependencies = {
  repository: PlanningRepository;
  grids: GridRepository;
  clock: Clock;
  ids: IdGenerator;
};

/** Copia todas as alocações, incluindo fixações, sem reinterpretar a fotografia original. */
export async function saveRevisionCopy(
  deps: RevisionCopyDependencies,
  input: {
    planning: Planning;
    source: PlanningRevision;
    revision: PlanningRevision;
    actor: Actor;
    summary: string;
  },
) {
  const { repository, grids, clock, ids } = deps;
  const { planning, source, revision, actor, summary } = input;
  const delta = { removed: [], added: await grids.placements(source.id) };
  await repository.save(planning, revision);
  await grids.apply(revision.id, delta);
  await grids.record({
    id: ids.next(),
    revisionId: revision.id,
    sequence: 1,
    actorId: actor.id,
    occurredAt: clock.now(),
    kind: 'import',
    summary,
    delta,
    revertsId: null,
  });
  return { id: planning.id, version: planning.version + 1, revisionId: revision.id };
}
