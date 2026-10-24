import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import type { AuthenticationApi } from '../modules/access/application/authentication-api.ts';
import { createSessionStore } from '../modules/access/presentation/session-store.ts';
import { ApiRequestError } from '../shared/application/api-error.ts';
import { createAppRouter } from './router.ts';

const session = {
  user: {
    id: 'unit-user',
    username: 'unit-reader',
    role: 'viewer' as const,
    disabled: false,
    version: 1,
    createdAt: '2026-02-01T12:00:00.000Z',
  },
  expiresAt: '2026-02-01T20:00:00.000Z',
};
function authentication() {
  return {
    session: vi.fn(async () => session),
    login: vi.fn(async () => session),
    logout: vi.fn(async () => {}),
    password: vi.fn(async () => {}),
  } satisfies AuthenticationApi;
}

describe('sessão e roteador compostos', () => {
  it('carrega a sessão injetada e impede consulta de abrir a administração', async () => {
    const api = authentication();
    const store = createSessionStore(api);
    const router = createAppRouter(store, createMemoryHistory());
    await router.push('/acessos');
    expect(router.currentRoute.value.path).toBe('/');
    await router.push('/professores');
    expect(router.currentRoute.value.path).toBe('/professores');
    expect(api.session).toHaveBeenCalledOnce();
  });

  it('direciona uma sessão ausente para entrar', async () => {
    const api = authentication();
    api.session.mockRejectedValue(
      new ApiRequestError('access.session_required', 'Entre novamente.', 401),
    );
    const store = createSessionStore(api);
    const router = createAppRouter(store, createMemoryHistory());
    await router.push('/planejamentos');
    expect(router.currentRoute.value.path).toBe('/entrar');
    expect(store.session.value).toBeNull();
  });

  it('mantém estado independente em duas composições', async () => {
    const api = authentication();
    const first = createSessionStore(api);
    const second = createSessionStore(api);
    await first.login('unit-reader', 'senha ficticia de teste');
    expect(first.session.value).toEqual(session);
    expect(second.session.value).toBeNull();
  });
});
