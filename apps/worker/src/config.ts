import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOG_LEVELS } from '@classorganizer/infrastructure';
import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  WORKER_HEARTBEAT_FILE: z.string().min(1).default(join(tmpdir(), 'classorganizer-worker.alive')),
  WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(1_000).default(10_000),
});

export type WorkerConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Configuração inválida do worker:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
