import { loadConfig } from './config.ts';
import { composeWorker } from './composition/worker.ts';
const worker = composeWorker(loadConfig());
await worker.start();
async function shutdown(signal: string): Promise<void> {
  worker.logger.info({ signal }, 'encerrando o worker');
  await worker.stop();
  process.exit(0);
}
process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));
