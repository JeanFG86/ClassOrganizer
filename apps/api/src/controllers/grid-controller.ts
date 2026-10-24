import type { makeTimetableGrid } from '@classorganizer/core';
type WithoutActor<T> = T extends (actor: infer _Actor, ...args: infer Args) => infer Result
  ? (...args: Args) => Result
  : never;
export interface GridOperations {
  viewGrid: WithoutActor<ReturnType<typeof makeTimetableGrid>['view']>;
  previewGrid: WithoutActor<ReturnType<typeof makeTimetableGrid>['preview']>;
  applyGrid: WithoutActor<ReturnType<typeof makeTimetableGrid>['apply']>;
  undoGrid: WithoutActor<ReturnType<typeof makeTimetableGrid>['undo']>;
  changeGridRules: WithoutActor<ReturnType<typeof makeTimetableGrid>['changeRules']>;
}
export class GridController {
  readonly #operations: GridOperations;
  constructor(operations: GridOperations) {
    this.#operations = operations;
  }
  viewGrid(...args: Parameters<GridOperations['viewGrid']>) {
    return this.#operations.viewGrid(...args);
  }
  previewGrid(...args: Parameters<GridOperations['previewGrid']>) {
    return this.#operations.previewGrid(...args);
  }
  applyGrid(...args: Parameters<GridOperations['applyGrid']>) {
    return this.#operations.applyGrid(...args);
  }
  undoGrid(...args: Parameters<GridOperations['undoGrid']>) {
    return this.#operations.undoGrid(...args);
  }
  changeGridRules(...args: Parameters<GridOperations['changeGridRules']>) {
    return this.#operations.changeGridRules(...args);
  }
}
