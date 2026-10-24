export type { ClaimedGeneration, GenerationQueue } from './ports/generation-queue.ts';
import {
  proposalPlacements,
  type GenerationOutcome,
} from '../../planning/domain/generation-run.ts';
import type { TimetableSnapshot } from '../../timetable/domain/model.ts';
import type { GenerationResult } from './ports/engine.ts';

/** Execução reservada por um worker, com a entrada gravada na solicitação. */

/**
 * Fila durável das execuções (ADR 0014). A reserva tem prazo: um worker interrompido perde
 * a execução, que volta a ser reservada até o limite de tentativas.
 */

/** Resultado conferido do motor, no formato guardado pela execução. */
export function outcomeOf(
  snapshot: TimetableSnapshot,
  result: GenerationResult,
): GenerationOutcome {
  return {
    status: result.status,
    reason: result.reason,
    placements:
      result.status === 'feasible' && result.proposal
        ? proposalPlacements(snapshot, result.proposal)
        : null,
    diagnostics: result.diagnostics,
    warnings: result.warnings,
    metrics: {
      elapsedMs: Math.round(result.elapsedMs),
      visitedNodes: result.visitedNodes,
      backtracks: result.backtracks,
      restarts: result.restarts,
      preferences: result.preferences,
    },
  };
}
