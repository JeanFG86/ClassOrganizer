import { createDatabase, loggerOptions } from '@classorganizer/infrastructure';
import { createSecureApp } from './secure-app.ts';
import { loadConfig } from './config.ts';
const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);
const app = createSecureApp(db, {
  logger: loggerOptions('api', config.LOG_LEVEL),
  origin: config.APP_ORIGIN,
});
async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'encerrando a API');
  await app.close();
  await db.$disconnect();
  process.exit(0);
}
process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));
await app.listen({ host: config.API_HOST, port: config.API_PORT });
