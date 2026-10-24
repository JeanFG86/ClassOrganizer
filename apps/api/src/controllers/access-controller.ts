import type { makeManageAccounts, SessionView, LoginResult } from '@classorganizer/core';
type WithoutActor<T> = T extends (actor: infer _Actor, ...args: infer Args) => infer Result
  ? (...args: Args) => Result
  : never;
export interface AccessOperations {
  login(username: string, password: string, ip: string): Promise<LoginResult>;
  session(): Promise<SessionView>;
  logout(): Promise<void>;
  listUsers: WithoutActor<ReturnType<typeof makeManageAccounts>['list']>;
  createUser: WithoutActor<ReturnType<typeof makeManageAccounts>['create']>;
  changeUser: WithoutActor<ReturnType<typeof makeManageAccounts>['change']>;
  changePassword: WithoutActor<ReturnType<typeof makeManageAccounts>['changePassword']>;
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
