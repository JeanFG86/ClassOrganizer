import type { Clock, IdGenerator } from '../../../shared/ports.ts';
import type { Actor } from '../../access/domain/access.ts';
import { isKnownSlot, translateCatalog } from '../domain/catalog-translation.ts';
import type { GridDelta } from '../domain/grid.ts';
import type { PlanningRevision } from '../domain/planning.ts';
import type { GridRepository } from './ports/index.ts';

/**
 * Leva a grade e as regras de outra revisão para um rascunho novo. Alocações sem bloco,
 * professor ou aula na fotografia de destino são descartadas e o histórico registra a contagem.
 */
export async function carryGrid(
  deps: { grids: GridRepository; clock: Clock; ids: IdGenerator },
  input: { from: PlanningRevision; to: PlanningRevision; actor: Actor; origin: string },
): Promise<void> {
  const placements = await deps.grids.placements(input.from.id);
  if (!placements.length) return;
  const translated = translateCatalog(input.to.snapshot, input.to.gridRules, input.to.id);
  const kept = placements.filter((p) => isKnownSlot(translated, p));
  const dropped = placements.length - kept.length;
  const delta: GridDelta = { removed: [], added: kept };
  await deps.grids.apply(input.to.id, delta);
  await deps.grids.record({
    id: deps.ids.next(),
    revisionId: input.to.id,
    sequence: 1,
    actorId: input.actor.id,
    occurredAt: deps.clock.now(),
    kind: 'import',
    summary:
      'Grade trazida de ' +
      input.origin +
      ': ' +
      kept.length +
      (kept.length === 1 ? ' alocação mantida' : ' alocações mantidas') +
      ', ' +
      dropped +
      (dropped === 1 ? ' descartada' : ' descartadas') +
      ' por não existirem nos cadastros desta revisão.',
    delta,
    revertsId: null,
  });
}
