import { LOG_LEVELS } from '@classorganizer/infrastructure';
import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
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
