import { parentPort, workerData } from 'node:worker_threads';
import { makeGenerateTimetable } from '@classorganizer/core';
import { generationRequestSchema } from '@classorganizer/contracts';
import { solveReference } from './reference-engine.ts';

const { request, cancellation } = workerData as {
  request: unknown;
  cancellation: SharedArrayBuffer;
};
const input = generationRequestSchema.parse(request);
const flag = new Int32Array(cancellation);
const generate = makeGenerateTimetable({
  engine: {
    solve: async (snapshot, options) =>
      solveReference(snapshot, options, {
        now: () => performance.now(),
        cancelled: () => Atomics.load(flag, 0) !== 0,
      }),
  },
});
parentPort?.postMessage(await generate(input.snapshot, input.options));
