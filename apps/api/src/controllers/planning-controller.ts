import type {
  ListPlannings,
  GetPlanning,
  CreatePlanning,
  ChangePlanning,
} from '@classorganizer/core';

type WithoutActor<T> = T extends (actor: infer _Actor, ...args: infer Args) => infer Result
  ? (...args: Args) => Result
  : never;
export interface PlanningOperations {
  listPlannings: WithoutActor<ListPlannings['execute']>;
  detailPlanning: WithoutActor<GetPlanning['execute']>;
  createPlanning: WithoutActor<CreatePlanning['execute']>;
  changePlanning: WithoutActor<ChangePlanning['execute']>;
}
export class PlanningController {
  readonly #operations: PlanningOperations;
  constructor(operations: PlanningOperations) {
    this.#operations = operations;
  }
  listPlannings(...args: Parameters<PlanningOperations['listPlannings']>) {
    return this.#operations.listPlannings(...args);
  }
  detailPlanning(...args: Parameters<PlanningOperations['detailPlanning']>) {
    return this.#operations.detailPlanning(...args);
  }
  createPlanning(...args: Parameters<PlanningOperations['createPlanning']>) {
    return this.#operations.createPlanning(...args);
  }
  changePlanning(...args: Parameters<PlanningOperations['changePlanning']>) {
    return this.#operations.changePlanning(...args);
  }
}
