import { parentPort, workerData } from 'node:worker_threads';
import { GenerateTimetable } from '@classorganizer/core';
import { generationRequestSchema } from '@classorganizer/contracts';
import { ReferenceTimetableEngine } from './reference-engine-adapter.ts';
const { request, cancellation } = workerData as {
  request: unknown;
  cancellation: SharedArrayBuffer;
};
const input = generationRequestSchema.parse(request);
const flag = new Int32Array(cancellation);
const generate = new GenerateTimetable({
  engine: new ReferenceTimetableEngine({
    now: () => performance.now(),
    cancelled: () => Atomics.load(flag, 0) !== 0,
  }),
});
parentPort?.postMessage(await generate.execute(input.snapshot, input.options));
