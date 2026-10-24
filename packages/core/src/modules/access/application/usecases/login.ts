import type { Clock } from '../../../../shared/ports.ts';
import { AccessError, type UserAccount } from '../../domain/access.ts';
import type { PasswordService, StoredUser } from '../ports/account-repository.ts';
import type { LoginStore, TokenService } from '../ports/login-store.ts';
import type { LoginResult } from '../ports/session-repository.ts';

function publicAccount(user: StoredUser): UserAccount {
  const { id, username, role, disabled, version, createdAt } = user;
  return { id, username, role, disabled, version, createdAt };
}

export class Login {
  readonly #deps: {
    store: LoginStore;
    passwords: PasswordService;
    tokens: TokenService;
    clock: Clock;
  };
  #concurrent = 0;
  constructor(deps: {
    store: LoginStore;
    passwords: PasswordService;
    tokens: TokenService;
    clock: Clock;
  }) {
    this.#deps = deps;
  }

  async execute(username: string, password: string, ip: string): Promise<LoginResult> {
    if (this.#concurrent >= 2)
      throw new AccessError(
        'access.login_busy',
        'Aguarde um momento e tente entrar novamente.',
        'rate_limit',
      );
    this.#concurrent++;
    const { store, passwords, tokens, clock } = this.#deps;
    try {
      const normalized = username.trim().toLowerCase();
      const now = clock.now();
      await store.recordAttempts(
        [
          { key: tokens.hash('user:' + normalized), limit: 10 },
          { key: tokens.hash('ip:' + ip), limit: 30 },
        ],
        now,
        new Date(now.getTime() + 15 * 60_000),
      );
      const user = await store.findUser(normalized);
      // Mesmo custo de verificação quando o usuário não existe.
      const dummyHash = 'scrypt$00000000000000000000000000000000$' + '0'.repeat(128);
      const valid = await passwords.verify(password, user?.passwordHash ?? dummyHash);
      if (!user || user.disabled || !valid)
        throw new AccessError(
          'access.credentials_invalid',
          'Usuário ou senha inválidos.',
          'unauthorized',
        );
      const token = tokens.create();
      const expiresAt = new Date(clock.now().getTime() + 8 * 60 * 60_000);
      await store.createSession({
        userId: user.id,
        expectedVersion: user.version,
        tokenHash: tokens.hash(token),
        expiresAt,
        now: clock.now(),
      });
      return { token, expiresAt, user: publicAccount(user) };
    } finally {
      this.#concurrent--;
    }
  }
}
