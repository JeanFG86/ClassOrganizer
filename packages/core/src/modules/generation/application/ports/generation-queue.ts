import {
  type GenerationOutcome,
  type GenerationRunOptions,
} from '../../../planning/domain/generation-run.ts';
import type { TimetableSnapshot } from '../../../timetable/domain/model.ts';

export interface ClaimedGeneration {
  readonly id: string;
  readonly attempt: number;
  readonly snapshot: TimetableSnapshot;
  readonly options: GenerationRunOptions;
}
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
