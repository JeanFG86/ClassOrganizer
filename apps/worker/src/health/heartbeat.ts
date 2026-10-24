import { rm, writeFile } from 'node:fs/promises';
import type { GenerationLogger } from '@classorganizer/core';

export class WorkerHeartbeat {
  readonly #deps: {
    checkReadiness(): Promise<void>;
    logger: GenerationLogger;
    path: string;
    intervalMs: number;
  };
  #timer: ReturnType<typeof setInterval> | undefined;
  #pending: Promise<void> | undefined;
  constructor(deps: {
    checkReadiness(): Promise<void>;
    logger: GenerationLogger;
    path: string;
    intervalMs: number;
  }) {
    this.#deps = deps;
  }

  private async beat(): Promise<void> {
    try {
      await this.#deps.checkReadiness();
      await writeFile(this.#deps.path, new Date().toISOString());
    } catch (error) {
      this.#deps.logger.warn({ err: error }, 'heartbeat falhou');
    }
  }
  async start(): Promise<void> {
    await this.#deps.checkReadiness();
    await this.beat();
    this.#timer = setInterval(() => {
      this.#pending ??= this.beat().finally(() => {
        this.#pending = undefined;
      });
    }, this.#deps.intervalMs);
  }
  async stop(): Promise<void> {
    clearInterval(this.#timer);
    await this.#pending;
    await rm(this.#deps.path, { force: true });
  }
}
