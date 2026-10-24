import type { makeGenerationRuns } from '@classorganizer/core';
type WithoutActor<T> = T extends (actor: infer _Actor, ...args: infer Args) => infer Result
  ? (...args: Args) => Result
  : never;
export interface GenerationOperations {
  listGenerations: WithoutActor<ReturnType<typeof makeGenerationRuns>['list']>;
  detailGeneration: WithoutActor<ReturnType<typeof makeGenerationRuns>['detail']>;
  requestGeneration: WithoutActor<ReturnType<typeof makeGenerationRuns>['request']>;
  cancelGeneration: WithoutActor<ReturnType<typeof makeGenerationRuns>['cancel']>;
  applyGeneration: WithoutActor<ReturnType<typeof makeGenerationRuns>['apply']>;
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
