import { AsyncLocalStorage } from 'node:async_hooks';
import type { FastifyInstance } from 'fastify';
import { AccessError } from '@classorganizer/core';

export class SessionContext {
  readonly #context = new AsyncLocalStorage<{ sessionHash: string | null }>();
  readonly #hashToken: (token: string) => string;
  constructor(hashToken: (token: string) => string) {
    this.#hashToken = hashToken;
  }
  current(): string | null {
    return this.#context.getStore()?.sessionHash ?? null;
  }
  run(cookie: string | undefined, done: () => void): void {
    const token = cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('entreaulas_session='))
      ?.slice('entreaulas_session='.length);
    this.#context.run(
      { sessionHash: token && /^[\w-]{43}$/.test(token) ? this.#hashToken(token) : null },
      done,
    );
  }
}

export function sessionCookie(token: string, maxAge: number, origin: string): string {
  return (
    'entreaulas_session=' +
    token +
    '; Path=/api; HttpOnly; SameSite=Strict; Max-Age=' +
    maxAge +
    (origin.startsWith('https://') ? '; Secure' : '')
  );
}

export function registerSecurityHooks(
  app: FastifyInstance,
  context: SessionContext,
  origin: string,
): void {
  app.addHook('onRequest', (request, reply, done) => {
    reply.header('cache-control', 'no-store');
    context.run(request.headers.cookie, done);
  });
  app.addHook('preHandler', async (request) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    if (
      request.headers['x-entreaulas-client'] !== 'web' ||
      (request.headers.origin !== undefined && request.headers.origin !== origin) ||
      request.headers['sec-fetch-site'] === 'cross-site'
    )
      throw new AccessError(
        'access.origin_invalid',
        'Abra a aplicação no endereço configurado para continuar.',
      );
  });
}
