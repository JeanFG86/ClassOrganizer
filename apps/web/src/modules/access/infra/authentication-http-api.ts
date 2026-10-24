import { sessionSchema } from '@classorganizer/contracts';
import { z } from 'zod';
import type { HttpClient } from '../../../shared/application/ports/http-client.ts';
import type { AuthenticationApi } from '../application/authentication-api.ts';

export function createAuthenticationApi(client: HttpClient): AuthenticationApi {
  return {
    session() {
      return client.request(sessionSchema, '/auth/session');
    },
    login(username, password) {
      return client.request(sessionSchema, '/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
    },
    async logout() {
      await client.request(z.undefined(), '/auth/logout', { method: 'POST' });
    },
    async password(currentPassword, password) {
      await client.request(z.undefined(), '/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, password }),
      });
    },
  };
}
