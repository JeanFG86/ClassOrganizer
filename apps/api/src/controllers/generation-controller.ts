import type {
  ListGenerationRuns,
  GetGenerationRun,
  RequestGeneration,
  CancelGeneration,
  ApplyGeneration,
} from '@classorganizer/core';

type WithoutActor<T> = T extends (actor: infer _Actor, ...args: infer Args) => infer Result
  ? (...args: Args) => Result
  : never;
export interface GenerationOperations {
  listGenerations: WithoutActor<ListGenerationRuns['execute']>;
  detailGeneration: WithoutActor<GetGenerationRun['execute']>;
  requestGeneration: WithoutActor<RequestGeneration['execute']>;
  cancelGeneration: WithoutActor<CancelGeneration['execute']>;
  applyGeneration: WithoutActor<ApplyGeneration['execute']>;
}
export class GenerationController {
  readonly #operations: GenerationOperations;
  constructor(operations: GenerationOperations) {
    this.#operations = operations;
  }
  listGenerations(...args: Parameters<GenerationOperations['listGenerations']>) {
    return this.#operations.listGenerations(...args);
  }
  detailGeneration(...args: Parameters<GenerationOperations['detailGeneration']>) {
    return this.#operations.detailGeneration(...args);
  }
  requestGeneration(...args: Parameters<GenerationOperations['requestGeneration']>) {
    return this.#operations.requestGeneration(...args);
  }
  cancelGeneration(...args: Parameters<GenerationOperations['cancelGeneration']>) {
    return this.#operations.cancelGeneration(...args);
  }
  applyGeneration(...args: Parameters<GenerationOperations['applyGeneration']>) {
    return this.#operations.applyGeneration(...args);
  }
}
