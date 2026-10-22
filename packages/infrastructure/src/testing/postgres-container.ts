import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createDatabase } from '../persistence/database.ts';
import type { Database } from '../persistence/database.ts';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));

export interface TestDatabase {
  db: Database;
  /** Remove os dados de todas as tabelas da aplicação, preservando o esquema. */
  truncateAll(): Promise<void>;
  stop(): Promise<void>;
}

/** Sobe um PostgreSQL descartável e aplica as migrações reais do projeto. */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:18.6-alpine',
  ).start();
  const url = container.getConnectionUri();

  execFileSync(process.execPath, [prismaCli(), 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  const db = createDatabase(url);

  return {
    db,
    async truncateAll() {
      const tables = await db.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
      if (tables.length > 0) {
        const list = tables.map((t) => `"${t.tablename}"`).join(', ');
        await db.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`);
      }
    },
    async stop() {
      await db.$disconnect();
      await container.stop();
    },
  };
}

function prismaCli(): string {
  return fileURLToPath(import.meta.resolve('prisma/build/index.js'));
}
