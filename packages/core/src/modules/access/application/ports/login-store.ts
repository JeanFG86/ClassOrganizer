import type { StoredUser } from './account-repository.ts';

export interface LoginAttempt {
  key: string;
  limit: number;
}
export interface LoginStore {
  /** Registra os limites atomicamente; recusa tentativas além de cada limite. */
  recordAttempts(attempts: readonly LoginAttempt[], now: Date, expiresAt: Date): Promise<void>;
  findUser(username: string): Promise<StoredUser | null>;
  /** Confere novamente versão e estado da conta e grava sessão e auditoria na mesma transação. */
  createSession(input: {
    userId: string;
    expectedVersion: number;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<void>;
}
export interface TokenService {
  create(): string;
  hash(token: string): string;
}
