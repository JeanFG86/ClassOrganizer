import { defineConfig } from 'prisma/config';

// O Prisma não carrega `.env` automaticamente: DATABASE_URL vem do ambiente
// (Compose, CI ou `node --env-file`). O valor padrão só permite `prisma generate`
// sem banco disponível.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://unused@localhost:5432/unused',
  },
});
