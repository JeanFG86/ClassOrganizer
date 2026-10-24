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

export interface HttpClient {
  request<T extends z.ZodType>(schema: T, path: string, init?: RequestInit): Promise<z.infer<T>>;
}

export class FetchHttpClient implements HttpClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #onSessionExpired: () => void;

  constructor(
    options: { baseUrl?: string; fetch?: typeof fetch; onSessionExpired?: () => void } = {},
  ) {
    this.#baseUrl = options.baseUrl ?? baseUrl;
    this.#fetch = options.fetch ?? ((...args) => fetch(...args));
    this.#onSessionExpired =
      options.onSessionExpired ?? (() => window.dispatchEvent(new Event('session-expired')));
  }

  async request<T extends z.ZodType>(
    schema: T,
    path: string,
    init: RequestInit = {},
  ): Promise<z.infer<T>> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        ...init,
        headers: {
          accept: 'application/json',
          'x-entreaulas-client': 'web',
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
      if (response.status === 401 && !path.startsWith('/auth/')) this.#onSessionExpired();

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
}

const baseUrl = `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1`;
export const httpClient: HttpClient = new FetchHttpClient();
export const apiRequest = httpClient.request.bind(httpClient);
