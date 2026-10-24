import type {
  GenerationExecutor,
  GenerationOptions,
  GenerationResult,
  TimetableSnapshot,
} from '@classorganizer/core';
import { Worker } from 'node:worker_threads';
import { generationRequestSchema, generationResultSchema } from '@classorganizer/contracts';

/** O processo principal continua livre para heartbeat e cancelamento durante o cálculo. */
export class ThreadGenerationExecutor implements GenerationExecutor {
  readonly #now: () => number;
  constructor(now: () => number = () => performance.now()) {
    this.#now = now;
  }
  async execute(
    snapshot: TimetableSnapshot,
    options: GenerationOptions,
    signal?: AbortSignal,
  ): Promise<GenerationResult> {
    const started = this.#now();
    const sourceRevision = snapshot.sourceRevision;
    const fallback = (
      status: GenerationResult['status'],
      reason: string,
      message: string,
    ): GenerationResult => ({
      status,
      reason,
      proposal: null,
      diagnostics: [{ code: 'engine.' + reason, message, entityIds: [] }],
      sourceRevision,
      warnings: [],
      teacherIdleMinutes: null,
      preferences: null,
      elapsedMs: this.#now() - started,
      visitedNodes: 0,
      backtracks: 0,
      restarts: 0,
    });
    const parsed = generationRequestSchema.safeParse({ snapshot, options });
    if (!parsed.success)
      return fallback('invalid_model', 'request', 'A entrada não segue o contrato do motor.');
    if (signal?.aborted) return fallback('cancelled', 'cancelled', 'A geração foi cancelada.');
    const cancellation = new SharedArrayBuffer(4);
    const flag = new Int32Array(cancellation);
    return new Promise<GenerationResult>((resolve) => {
      let settled = false;
      let cancelTimer: ReturnType<typeof setTimeout> | undefined;
      let worker: Worker;
      try {
        worker = new Worker(new URL('./reference-thread.ts', import.meta.url), {
          workerData: { request: parsed.data, cancellation },
          execArgv: [],
          resourceLimits: { maxOldGenerationSizeMb: options.memoryLimitMb },
        });
      } catch {
        resolve(
          fallback('failed', 'worker_start', 'Não foi possível iniciar a execução do motor.'),
        );
        return;
      }
      const finish = (result: GenerationResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        clearTimeout(cancelTimer);
        signal?.removeEventListener('abort', cancel);
        void worker.terminate().then(
          () => resolve(result),
          () => resolve(result),
        );
      };
      const cancel = () => {
        Atomics.store(flag, 0, 1);
        cancelTimer ??= setTimeout(
          () =>
            finish(
              fallback('cancelled', 'cancelled', 'A geração foi cancelada e a execução encerrada.'),
            ),
          250,
        );
      };
      // Inclui uma tolerância fixa para inicialização da thread e validação de saída.
      const deadline = setTimeout(
        () =>
          finish(
            signal?.aborted
              ? fallback('cancelled', 'cancelled', 'A geração foi cancelada.')
              : fallback(
                  'inconclusive',
                  'time_limit',
                  'O prazo terminou sem solução nem prova de inviabilidade.',
                ),
          ),
        options.timeLimitMs + 1000,
      );
      worker.once('message', (message: unknown) => {
        const result = generationResultSchema.safeParse(message);
        if (signal?.aborted) finish(fallback('cancelled', 'cancelled', 'A geração foi cancelada.'));
        else
          finish(
            result.success
              ? result.data
              : fallback('failed', 'protocol', 'O motor retornou uma resposta fora do contrato.'),
          );
      });
      worker.once('error', (error) => {
        const code = 'code' in error ? error.code : undefined;
        finish(
          code === 'ERR_WORKER_OUT_OF_MEMORY'
            ? fallback('inconclusive', 'memory_limit', 'O limite de memória da busca foi atingido.')
            : fallback('failed', 'worker_error', 'A execução do motor falhou.'),
        );
      });
      worker.once('exit', () => {
        if (!settled)
          finish(fallback('failed', 'worker_exit', 'O motor encerrou sem devolver um resultado.'));
      });
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
    });
  }
}
const defaultExecutor = new ThreadGenerationExecutor();
export const runGeneration = defaultExecutor.execute.bind(defaultExecutor);
