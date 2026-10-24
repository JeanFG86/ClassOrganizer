import type { makePlannings } from '@classorganizer/core';
type WithoutActor<T> = T extends (actor: infer _Actor, ...args: infer Args) => infer Result
  ? (...args: Args) => Result
  : never;
export interface PlanningOperations {
  listPlannings: WithoutActor<ReturnType<typeof makePlannings>['list']>;
  detailPlanning: WithoutActor<ReturnType<typeof makePlannings>['detail']>;
  createPlanning: WithoutActor<ReturnType<typeof makePlannings>['create']>;
  changePlanning: WithoutActor<ReturnType<typeof makePlannings>['change']>;
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
