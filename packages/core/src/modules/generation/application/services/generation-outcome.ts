import { proposalPlacements, type GenerationOutcome } from '../../../planning/domain/index.ts';
import type { TimetableSnapshot } from '../../../timetable/domain/index.ts';
import type { GenerationResult } from '../ports/engine.ts';

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
