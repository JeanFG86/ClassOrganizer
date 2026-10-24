import { setTimeout as sleep } from 'node:timers/promises';
import { outcomeOf, stoppedOutcome, type GenerationQueue } from '@classorganizer/core';
import type { GenerationExecutor, GenerationLogger } from '@classorganizer/core';

export interface QueueRunnerOptions {
  readonly workerId: string;
  readonly leaseMs: number;
  readonly heartbeatMs: number;
  readonly pollMs: number;
  readonly maxAttempts: number;
}
export interface GenerationConsumerDeps {
  queue: GenerationQueue;
  executor: GenerationExecutor;
  logger: GenerationLogger;
  options: QueueRunnerOptions;
}
/** Consome uma execução por vez e mantém reserva e cancelamento (ADR 0014). */
export class GenerationConsumer {
  readonly #deps: GenerationConsumerDeps;
  readonly #stopping = new AbortController();
  #loop: Promise<void> | null = null;
  constructor(deps: GenerationConsumerDeps) {
    this.#deps = deps;
  }
  /** Processa a próxima execução da fila; devolve `false` se não havia nenhuma. */
  async processNext(): Promise<boolean> {
    const { queue, executor, logger, options } = this.#deps;
    const stopping = this.#stopping;
    const job = await queue.claim(options.workerId, options.leaseMs, options.maxAttempts);
    if (!job) return false;
    logger.info({ runId: job.id, attempt: job.attempt }, 'geração iniciada');
    const search = new AbortController();
    let lost = false;
    const stop = () => search.abort();
    stopping.signal.addEventListener('abort', stop, { once: true });
    const beat = setInterval(() => {
      queue.heartbeat(job.id, options.workerId, options.leaseMs).then(
        (state) => {
          if (!state) lost = true;
          if (!state || state.cancelRequested) search.abort();
        },
        (error: unknown) => logger.warn({ err: error, runId: job.id }, 'renovação falhou'),
      );
    }, options.heartbeatMs);
    try {
      const result = await executor.execute(job.snapshot, job.options, search.signal);
      // Só uma busca interrompida pelo encerramento volta à fila; um resultado pronto é gravado.
      if (stopping.signal.aborted && result.status === 'cancelled' && !lost) {
        await queue.release(job.id, options.workerId);
        logger.info({ runId: job.id }, 'geração devolvida à fila no encerramento');
      } else if (await queue.finish(job.id, options.workerId, outcomeOf(job.snapshot, result)))
        logger.info({ runId: job.id, status: result.status }, 'geração concluída');
      else
        logger.warn({ runId: job.id }, 'resultado descartado: a reserva não era mais deste worker');
    } catch (error) {
      logger.error({ err: error, runId: job.id }, 'geração falhou');
      await queue
        .finish(
          job.id,
          options.workerId,
          stoppedOutcome(
            'failed',
            'worker_error',
            'A execução falhou no worker. A grade atual foi preservada.',
          ),
        )
        .catch((cause: unknown) =>
          logger.error({ err: cause, runId: job.id }, 'falha ao registrar'),
        );
    } finally {
      clearInterval(beat);
      stopping.signal.removeEventListener('abort', stop);
    }
    return true;
  }

  private async poll(): Promise<void> {
    const { logger, options } = this.#deps;
    const stopping = this.#stopping;
    while (!stopping.signal.aborted) {
      let processed = false;
      try {
        processed = await this.processNext();
      } catch (error) {
        logger.warn({ err: error }, 'leitura da fila falhou');
      }
      if (!processed)
        await sleep(options.pollMs, undefined, { signal: stopping.signal }).catch(() => undefined);
    }
  }

  start() {
    this.#loop ??= this.poll();
  }
  async stop() {
    this.#stopping.abort();
    await this.#loop;
  }
}
