import type { AccountsApi } from '../application/accounts-api.ts';

import { userAccountSchema, usersSchema, type UserAccountDto } from '@classorganizer/contracts';

import { type HttpClient } from '../../../shared/application/ports/http-client.ts';
export function createAccountsApi(client: HttpClient): AccountsApi {
  const apiRequest = client.request.bind(client);
  return {
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
  };
}
