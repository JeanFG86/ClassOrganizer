import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

// O Prisma não carrega `.env` sozinho. Em desenvolvimento usamos o `.env` da raiz;
// em containers e na CI a variável vem do ambiente (que tem precedência).
const rootEnvFile = resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // O valor padrão só permite `prisma generate` sem banco disponível.
    url: process.env['DATABASE_URL'] ?? 'postgresql://unused@localhost:5432/unused',
  },
});
