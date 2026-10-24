import {
  AccessError,
  type LoginStore,
  type LoginAttempt,
  type StoredUser,
} from '@classorganizer/core';
import type { Database } from '../../persistence/database.ts';
import { publicUser } from './user-mapper.ts';
import { lockApp, audit } from './unit-of-work.ts';

export class PrismaLoginStore implements LoginStore {
  readonly #db: Database;
  constructor(db: Database) {
    this.#db = db;
  }

  async recordAttempts(
    attempts: readonly LoginAttempt[],
    now: Date,
    expiresAt: Date,
  ): Promise<void> {
    await this.#db.$transaction(async (tx) => {
      await tx.loginAttempt.deleteMany({ where: { expiresAt: { lte: now } } });
      for (const { key, limit } of attempts) {
        const attempt = await tx.loginAttempt.upsert({
          where: { key },
          create: { key, attempts: 1, expiresAt },
          update: { attempts: { increment: 1 } },
        });
        if (attempt.attempts > limit)
          throw new AccessError(
            'access.login_limited',
            'Muitas tentativas de entrada. Aguarde 15 minutos.',
            'rate_limit',
          );
      }
    });
  }

  async findUser(username: string): Promise<StoredUser | null> {
    const user = await this.#db.appUser.findUnique({ where: { username } });
    return user ? { ...publicUser(user), passwordHash: user.passwordHash } : null;
  }

  async createSession(input: Parameters<LoginStore['createSession']>[0]): Promise<void> {
    await this.#db.$transaction(async (tx) => {
      await lockApp(tx);
      const current = await tx.appUser.findUnique({ where: { id: input.userId } });
      if (!current || current.disabled || current.version !== input.expectedVersion)
        throw new AccessError(
          'access.credentials_invalid',
          'Usuário ou senha inválidos.',
          'unauthorized',
        );
      await tx.loginSession.deleteMany({ where: { expiresAt: { lte: input.now } } });
      await tx.loginSession.create({
        data: { tokenHash: input.tokenHash, userId: input.userId, expiresAt: input.expiresAt },
      });
      await audit(tx, input.userId, 'access.login', input.userId);
    });
  }
}
