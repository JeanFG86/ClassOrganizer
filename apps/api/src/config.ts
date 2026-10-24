import { LOG_LEVELS } from '@classorganizer/infrastructure';
import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  APP_ORIGIN: z
    .url()
    .refine(
      (value) => /^https?:\/\//.test(value) && new URL(value).origin === value,
      'Informe apenas a origem HTTP(S), sem caminho.',
    )
    .default('http://localhost:8080'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  /** Metas provisórias da busca (ADR 0014), gravadas em cada solicitação. */
  GENERATION_TIME_LIMIT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  GENERATION_NODE_LIMIT: z.coerce.number().int().min(1_000).default(2_000_000),
  GENERATION_MEMORY_LIMIT_MB: z.coerce.number().int().min(16).max(1024).default(256),
});

export type ApiConfig = z.infer<typeof configSchema>;

/** Valida a configuração na inicialização; falha cedo com mensagem legível. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Configuração inválida da API:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
