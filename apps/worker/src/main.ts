import { rm, writeFile } from 'node:fs/promises';
import { checkDatabase, createDatabase, createLogger } from '@classorganizer/infrastructure';
import { loadConfig } from './config.ts';

// O daemon mantém banco e heartbeat. A prova E2 roda pelo CLI em thread isolada
// (ADR 0010); consumo da fila e aplicação de propostas entram na E6 (ADR 0004).
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
logger.info('worker pronto');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'encerrando o worker');
  clearInterval(heartbeat);
  await rm(config.WORKER_HEARTBEAT_FILE, { force: true });
  await db.$disconnect();
  process.exit(0);
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));
