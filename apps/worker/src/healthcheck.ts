import { stat } from 'node:fs/promises';
import { loadConfig } from './config.ts';

// Usado pelo healthcheck do container: o worker é saudável se o heartbeat
// (que também confere o banco) foi renovado recentemente.
const config = loadConfig();
const maxAgeMs = config.WORKER_HEARTBEAT_INTERVAL_MS * 3;

try {
  const { mtimeMs } = await stat(config.WORKER_HEARTBEAT_FILE);
  process.exit(Date.now() - mtimeMs <= maxAgeMs ? 0 : 1);
} catch {
  process.exit(1);
}
