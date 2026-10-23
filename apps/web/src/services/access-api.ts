import { computed, inject, ref, type InjectionKey } from 'vue';
import {
  sessionSchema,
  userAccountSchema,
  usersSchema,
  planningsSchema,
  planningDetailSchema,
  planningSchema,
  auditsSchema,
  type Session,
  type UserAccountDto,
} from '@classorganizer/contracts';
import { z } from 'zod';
import type { changePlanningSchema } from '@classorganizer/contracts';
import { ApiRequestError, apiRequest } from './api-client.ts';

export function createAccessApi() {
  const session = ref<Session | null>(null);
  const loaded = ref(false);
  return {
    session,
    loaded,
    async load() {
      try {
        session.value = await apiRequest(sessionSchema, '/auth/session');
      } catch (error) {
        if (!(error instanceof ApiRequestError && error.status === 401)) throw error;
        session.value = null;
      }
      loaded.value = true;
    },
    async login(username: string, password: string) {
      session.value = await apiRequest(sessionSchema, '/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      loaded.value = true;
    },
    async logout() {
      try {
        await apiRequest(z.undefined(), '/auth/logout', { method: 'POST' });
      } catch (error) {
        if (!(error instanceof ApiRequestError && error.status === 401)) throw error;
      }
      session.value = null;
      loaded.value = true;
    },
    async password(currentPassword: string, password: string) {
      await apiRequest(z.undefined(), '/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, password }),
      });
      session.value = null;
    },
    users: () => apiRequest(usersSchema, '/users'),
    createUser: (username: string, password: string, role: UserAccountDto['role']) =>
      apiRequest(userAccountSchema, '/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, role }),
      }),
    changeUser: (
      user: UserAccountDto,
      role: UserAccountDto['role'],
      disabled: boolean,
      password?: string,
    ) =>
      apiRequest(userAccountSchema, '/users/' + user.id, {
        method: 'PUT',
        body: JSON.stringify({
          version: user.version,
          role,
          disabled,
          ...(password ? { password } : {}),
        }),
      }),
    plannings: () => apiRequest(planningsSchema, '/plannings'),
    planning: (id: string) => apiRequest(planningDetailSchema, '/plannings/' + id),
    createPlanning: (input: {
      name: string;
      year: number;
      sourceId?: string;
      sourceVersion?: number;
    }) => apiRequest(planningSchema, '/plannings', { method: 'POST', body: JSON.stringify(input) }),
    changePlanning: (id: string, input: z.infer<typeof changePlanningSchema>) =>
      apiRequest(planningSchema, '/plannings/' + id, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    audits: (before?: { occurredAt: string; id: string }) =>
      apiRequest(
        auditsSchema,
        '/audit' +
          (before
            ? '?before=' +
              encodeURIComponent(before.occurredAt) +
              '&beforeId=' +
              encodeURIComponent(before.id)
            : ''),
      ),
  };
}
export type AccessApi = ReturnType<typeof createAccessApi>;
export const accessApiKey: InjectionKey<AccessApi> = Symbol('accessApi');
export const httpAccessApi = createAccessApi();
export const roleLabels = { admin: 'Administrador', editor: 'Editor', viewer: 'Consulta' } as const;
export function useAccess() {
  const api = inject(accessApiKey, null);
  return {
    canWrite: computed(() =>
      api ? api.session.value?.user.role !== 'viewer' && api.session.value !== null : true,
    ),
  };
}
