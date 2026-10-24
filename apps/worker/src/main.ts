import { hostname } from 'node:os';
import { rm, writeFile } from 'node:fs/promises';
import {
  checkDatabase,
  createDatabase,
  createLogger,
  PrismaGenerationQueue,
} from '@classorganizer/infrastructure';
import { loadConfig } from './config.ts';
import { makeQueueRunner } from './generation/queue-runner.ts';
import { runGeneration } from './generation/thread-runner.ts';

// O daemon mantém banco e heartbeat do container e consome a fila de geração (ADR 0014).
// A busca roda em thread isolada (ADR 0010); o CLI da prova E2 continua disponível.
const config = loadConfig();
const logger = createLogger('worker', config.LOG_LEVEL);
const db = createDatabase(config.DATABASE_URL);

async function beat(): Promise<void> {
  try {
    await checkDatabase(db);
    await writeFile(config.WORKER_HEARTBEAT_FILE, new Date().toISOString());
  } catch (error) {
    logger.warn({ err: error }, 'heartbeat falhou');
  }
}

await checkDatabase(db);
await beat();
const heartbeat = setInterval(() => void beat(), config.WORKER_HEARTBEAT_INTERVAL_MS);
const runner = makeQueueRunner({
  queue: new PrismaGenerationQueue(db),
  run: runGeneration,
  logger,
  options: {
    workerId: hostname() + ':' + process.pid,
    leaseMs: config.GENERATION_LEASE_MS,
    heartbeatMs: config.GENERATION_HEARTBEAT_MS,
    pollMs: config.GENERATION_POLL_MS,
    maxAttempts: config.GENERATION_MAX_ATTEMPTS,
  },
});
runner.start();
logger.info('worker pronto');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'encerrando o worker');
  clearInterval(heartbeat);
  await runner.stop();
  await rm(config.WORKER_HEARTBEAT_FILE, { force: true });
  await db.$disconnect();
  process.exit(0);
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));
