import { rm, writeFile } from 'node:fs/promises';
import { checkDatabase, createDatabase, createLogger } from '@classorganizer/infrastructure';
import { loadConfig } from './config.ts';

// Raiz de composição do worker. Nesta fase ele apenas sobe, confere o banco e
// sinaliza que está vivo; o consumo da fila de geração entra na E6 (ver ADR 0004).
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
