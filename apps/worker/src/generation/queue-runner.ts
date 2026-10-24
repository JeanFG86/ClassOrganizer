import type {
  GenerationConsumerDeps,
  QueueRunnerOptions,
} from '../consumers/generation-consumer.ts';
import { GenerationConsumer } from '../consumers/generation-consumer.ts';
export type { QueueRunnerOptions };
export function makeQueueRunner(
  deps: Omit<GenerationConsumerDeps, 'executor'> & {
    run: GenerationConsumerDeps['executor']['execute'];
  },
) {
  return new GenerationConsumer({ ...deps, executor: { execute: deps.run } });
}
