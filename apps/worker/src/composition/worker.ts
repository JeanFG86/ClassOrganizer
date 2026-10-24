import { hostname } from 'node:os';
import {
  checkDatabase,
  createDatabase,
  createLogger,
  PrismaGenerationQueue,
} from '@classorganizer/infrastructure';
import type { WorkerConfig } from '../config.ts';
import { GenerationConsumer } from '../consumers/generation-consumer.ts';
import { ThreadGenerationExecutor } from '../generation/thread-runner.ts';
import { WorkerHeartbeat } from '../health/heartbeat.ts';

export function composeWorker(config: WorkerConfig) {
  const logger = createLogger('worker', config.LOG_LEVEL);
  const db = createDatabase(config.DATABASE_URL);
  const heartbeat = new WorkerHeartbeat({
    checkReadiness: () => checkDatabase(db),
    logger,
    path: config.WORKER_HEARTBEAT_FILE,
    intervalMs: config.WORKER_HEARTBEAT_INTERVAL_MS,
  });
  const executor = new ThreadGenerationExecutor();
  const consumer = new GenerationConsumer({
    queue: new PrismaGenerationQueue(db),
    executor,
    logger,
    options: {
      workerId: hostname() + ':' + process.pid,
      leaseMs: config.GENERATION_LEASE_MS,
      heartbeatMs: config.GENERATION_HEARTBEAT_MS,
      pollMs: config.GENERATION_POLL_MS,
      maxAttempts: config.GENERATION_MAX_ATTEMPTS,
    },
  });
  return {
    logger,
    async start() {
      await heartbeat.start();
      consumer.start();
      logger.info('worker pronto');
    },
    async stop() {
      await consumer.stop();
      await heartbeat.stop();
      await db.$disconnect();
    },
  };
}
