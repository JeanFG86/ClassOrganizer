import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOG_LEVELS } from '@classorganizer/infrastructure';
import { z } from 'zod';

const configSchema = z
  .object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    WORKER_HEARTBEAT_FILE: z.string().min(1).default(join(tmpdir(), 'classorganizer-worker.alive')),
    WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(1_000).default(10_000),
    /** Prazo da reserva de uma execução; vencido, outro worker pode retomá-la. */
    GENERATION_LEASE_MS: z.coerce.number().int().min(5_000).default(30_000),
    GENERATION_HEARTBEAT_MS: z.coerce.number().int().min(500).default(5_000),
    GENERATION_POLL_MS: z.coerce.number().int().min(200).default(2_000),
    GENERATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  })
  .refine((c) => c.GENERATION_HEARTBEAT_MS * 2 <= c.GENERATION_LEASE_MS, {
    message: 'GENERATION_HEARTBEAT_MS deve ser no máximo metade de GENERATION_LEASE_MS.',
  });

export type WorkerConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Configuração inválida do worker:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
