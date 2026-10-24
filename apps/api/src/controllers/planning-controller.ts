import type {
  ListPlannings,
  GetPlanning,
  CreatePlanning,
  ChangePlanning,
  ComparePlanningRevisions,
  RenamePlanningRevision,
  RestorePlanningRevision,
  PreservePlanningRevision,
} from '@classorganizer/core';

type WithoutActor<T> = T extends (actor: infer _Actor, ...args: infer Args) => infer Result
  ? (...args: Args) => Result
  : never;
export interface PlanningOperations {
  preserveRevision: WithoutActor<PreservePlanningRevision['execute']>;
  listPlannings: WithoutActor<ListPlannings['execute']>;
  detailPlanning: WithoutActor<GetPlanning['execute']>;
  createPlanning: WithoutActor<CreatePlanning['execute']>;
  changePlanning: WithoutActor<ChangePlanning['execute']>;
  compareRevisions: WithoutActor<ComparePlanningRevisions['execute']>;
  renameRevision: WithoutActor<RenamePlanningRevision['execute']>;
  restoreRevision: WithoutActor<RestorePlanningRevision['execute']>;
}
export class PlanningController {
  readonly #operations: PlanningOperations;
  constructor(operations: PlanningOperations) {
    this.#operations = operations;
  }
  preserveRevision(...args: Parameters<PlanningOperations['preserveRevision']>) {
    return this.#operations.preserveRevision(...args);
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
  compareRevisions(...args: Parameters<PlanningOperations['compareRevisions']>) {
    return this.#operations.compareRevisions(...args);
  }
  renameRevision(...args: Parameters<PlanningOperations['renameRevision']>) {
    return this.#operations.renameRevision(...args);
  }
  restoreRevision(...args: Parameters<PlanningOperations['restoreRevision']>) {
    return this.#operations.restoreRevision(...args);
  }
}
