import {
  proposalPlacements,
  type GenerationOutcome,
  type GenerationRunOptions,
} from '../../planning/domain/generation-run.ts';
import type { TimetableSnapshot } from '../../timetable/domain/model.ts';
import type { GenerationResult } from './engine.ts';

/** Execução reservada por um worker, com a entrada gravada na solicitação. */
export interface ClaimedGeneration {
  readonly id: string;
  readonly attempt: number;
  readonly snapshot: TimetableSnapshot;
  readonly options: GenerationRunOptions;
}
/**
 * Fila durável das execuções (ADR 0014). A reserva tem prazo: um worker interrompido perde
 * a execução, que volta a ser reservada até o limite de tentativas.
 */
export interface GenerationQueue {
  claim(workerId: string, leaseMs: number, maxAttempts: number): Promise<ClaimedGeneration | null>;
  /** Renova a reserva; `null` quando ela já não pertence a este worker. */
  heartbeat(
    id: string,
    workerId: string,
    leaseMs: number,
  ): Promise<{ cancelRequested: boolean } | null>;
  /** Grava o resultado se a reserva ainda for deste worker; cancelamento pedido prevalece. */
  finish(id: string, workerId: string, outcome: GenerationOutcome): Promise<boolean>;
  /** Devolve a execução à fila sem consumir o resultado, no encerramento do worker. */
  release(id: string, workerId: string): Promise<void>;
}

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
    },
  };
}
