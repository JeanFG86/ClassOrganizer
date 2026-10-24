import {
  type GenerationOutcome,
  type GenerationRunOptions,
} from '../../../planning/domain/index.ts';
import type { TimetableSnapshot } from '../../../timetable/domain/index.ts';

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
