import type {
  ListAccounts,
  CreateAccount,
  ChangeAccount,
  ChangePassword,
  SessionView,
  LoginResult,
} from '@classorganizer/core';
type WithoutActor<T> = T extends (actor: infer _Actor, ...args: infer Args) => infer Result
  ? (...args: Args) => Result
  : never;
export interface AccessOperations {
  login(username: string, password: string, ip: string): Promise<LoginResult>;
  session(): Promise<SessionView>;
  logout(): Promise<void>;
  listUsers: WithoutActor<ListAccounts['execute']>;
  createUser: WithoutActor<CreateAccount['execute']>;
  changeUser: WithoutActor<ChangeAccount['execute']>;
  changePassword: WithoutActor<ChangePassword['execute']>;
}
export class AccessController {
  readonly #operations: AccessOperations;
  constructor(operations: AccessOperations) {
    this.#operations = operations;
  }
  login(...args: Parameters<AccessOperations['login']>) {
    return this.#operations.login(...args);
  }
  session(...args: Parameters<AccessOperations['session']>) {
    return this.#operations.session(...args);
  }
  logout(...args: Parameters<AccessOperations['logout']>) {
    return this.#operations.logout(...args);
  }
  listUsers(...args: Parameters<AccessOperations['listUsers']>) {
    return this.#operations.listUsers(...args);
  }
  createUser(...args: Parameters<AccessOperations['createUser']>) {
    return this.#operations.createUser(...args);
  }
  changeUser(...args: Parameters<AccessOperations['changeUser']>) {
    return this.#operations.changeUser(...args);
  }
  changePassword(...args: Parameters<AccessOperations['changePassword']>) {
    return this.#operations.changePassword(...args);
  }
}
