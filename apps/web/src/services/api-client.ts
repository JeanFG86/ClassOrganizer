import { apiErrorSchema } from '@classorganizer/contracts';
import type { z } from 'zod';

/** Erro de chamada à API com mensagem pronta para exibir à secretaria. */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number | undefined;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const baseUrl = `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1`;

export async function apiRequest<T extends z.ZodType>(
  schema: T,
  path: string,
  init: RequestInit = {},
): Promise<z.infer<T>> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        // Sem corpo, o content-type JSON faria o servidor recusar a requisição (ex.: DELETE).
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiRequestError('network', 'Não foi possível conectar ao servidor.');
  }

  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw parsed.success
      ? new ApiRequestError(parsed.data.error.code, parsed.data.error.message, response.status)
      : new ApiRequestError(
          'http',
          'O servidor respondeu de forma inesperada. Tente novamente.',
          response.status,
        );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiRequestError('contract', 'O servidor respondeu em um formato inesperado.');
  }
  return parsed.data;
}
