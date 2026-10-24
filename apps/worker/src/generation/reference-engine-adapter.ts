import type { TimetableEngine, GenerationOptions, TimetableSnapshot } from '@classorganizer/core';
import { solveReference } from './reference-engine.ts';

export class ReferenceTimetableEngine implements TimetableEngine {
  readonly #control: { now(): number; cancelled(): boolean };
  constructor(control: { now(): number; cancelled(): boolean }) {
    this.#control = control;
  }
  async solve(snapshot: TimetableSnapshot, options: GenerationOptions) {
    return solveReference(snapshot, options, this.#control);
  }
}
