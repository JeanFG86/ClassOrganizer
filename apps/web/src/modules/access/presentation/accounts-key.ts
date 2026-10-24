import type { InjectionKey } from 'vue';
import type { AccountsApi } from '../application/accounts-api.ts';
export const accountsApiKey: InjectionKey<AccountsApi> = Symbol('AccountsApi');
