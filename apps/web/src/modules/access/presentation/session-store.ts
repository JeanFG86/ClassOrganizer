import { computed, inject, ref, type InjectionKey } from 'vue';
import type { Session } from '@classorganizer/contracts';
import { ApiRequestError } from '../../../shared/application/api-error.ts';
import type { AuthenticationApi } from '../application/authentication-api.ts';
export function createSessionStore(authentication: AuthenticationApi) {
  const session = ref<Session | null>(null);
  const loaded = ref(false);
  return {
    session,
    loaded,
    async load() {
      try {
        session.value = await authentication.session();
      } catch (error) {
        if (!(error instanceof ApiRequestError && error.status === 401)) throw error;
        session.value = null;
      }
      loaded.value = true;
    },
    async login(username: string, password: string) {
      session.value = await authentication.login(username, password);
      loaded.value = true;
    },
    async logout() {
      try {
        await authentication.logout();
      } catch (error) {
        if (!(error instanceof ApiRequestError && error.status === 401)) throw error;
      }
      session.value = null;
      loaded.value = true;
    },
    async password(currentPassword: string, password: string) {
      await authentication.password(currentPassword, password);
      session.value = null;
    },
  };
}
export type SessionStore = ReturnType<typeof createSessionStore>;
export const accessApiKey: InjectionKey<SessionStore> = Symbol('SessionStore');
export const roleLabels = { admin: 'Administrador', editor: 'Editor', viewer: 'Consulta' } as const;
export function useAccess() {
  const api = inject(accessApiKey, null);
  return {
    canWrite: computed(() =>
      api ? api.session.value?.user.role !== 'viewer' && api.session.value !== null : true,
    ),
  };
}
