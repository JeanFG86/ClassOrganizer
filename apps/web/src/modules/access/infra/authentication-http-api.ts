import type { AuthenticationApi } from '../application/authentication-api.ts';

import { sessionSchema } from '@classorganizer/contracts';
import { z } from 'zod';
import type { HttpClient } from '../../../shared/application/ports/http-client.ts';

export class AuthenticationHttpApi implements AuthenticationApi {
  readonly #client: HttpClient;
  constructor(client: HttpClient) {
    this.#client = client;
  }
  session() {
    return this.#client.request(sessionSchema, '/auth/session');
  }
  login(username: string, password: string) {
    return this.#client.request(sessionSchema, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }
  async logout(): Promise<void> {
    await this.#client.request(z.undefined(), '/auth/logout', { method: 'POST' });
  }
  async password(currentPassword: string, password: string): Promise<void> {
    await this.#client.request(z.undefined(), '/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, password }),
    });
  }
}
