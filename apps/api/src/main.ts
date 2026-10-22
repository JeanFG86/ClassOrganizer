import { makeListSubjects, makeRegisterSubject } from '@classorganizer/core';
import {
  PrismaSubjectRepository,
  checkDatabase,
  createDatabase,
  loggerOptions,
  systemClock,
  uuidGenerator,
} from '@classorganizer/infrastructure';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

// Raiz de composição da API: único ponto que conhece as implementações concretas.
const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);
const subjects = new PrismaSubjectRepository(db);

const app = buildApp(
  {
    registerSubject: makeRegisterSubject({ subjects, clock: systemClock, ids: uuidGenerator }),
    listSubjects: makeListSubjects({ subjects }),
    checkReadiness: () => checkDatabase(db),
  },
  { logger: loggerOptions('api', config.LOG_LEVEL) },
);

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'encerrando a API');
  await app.close();
  await db.$disconnect();
  process.exit(0);
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));

await app.listen({ host: config.API_HOST, port: config.API_PORT });
