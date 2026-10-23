import {
  AccessError,
  StaleVersionError,
  makeManageAccounts,
  type StoredUser,
  validateCredentials,
  validatePassword,
  type Role,
  type UserAccount,
} from '@classorganizer/core';
import type { Prisma, AppUser } from '../generated/prisma/client.ts';
import type { Database } from '../persistence/database.ts';
import { isUuid } from '../persistence/uuid.ts';
import { systemClock, uuidGenerator } from '../system/system-ports.ts';
import { audit, lockApp } from './unit-of-work.ts';
import { hashPassword, hashToken, newToken, verifyPassword } from './passwords.ts';

export function publicUser(user: AppUser): UserAccount {
  const { id, username, role, disabled, version, createdAt } = user;
  if (role !== 'admin' && role !== 'editor' && role !== 'viewer')
    throw new AccessError('access.role_invalid', 'Perfil de acesso inválido.');
  return { id, username, role, disabled, version, createdAt };
}
export function makeAccounts(tx: Prisma.TransactionClient) {
  function stored(user: AppUser): StoredUser {
    return { ...publicUser(user), passwordHash: user.passwordHash };
  }
  return makeManageAccounts({
    clock: systemClock,
    ids: uuidGenerator,
    passwords: { hash: hashPassword, verify: verifyPassword },
    repository: {
      list: async () => (await tx.appUser.findMany({ orderBy: { username: 'asc' } })).map(stored),
      find: async (id) => {
        const user = isUuid(id) ? await tx.appUser.findUnique({ where: { id } }) : null;
        return user ? stored(user) : null;
      },
      findUsername: async (username) => {
        const user = await tx.appUser.findUnique({ where: { username } });
        return user ? stored(user) : null;
      },
      activeAdmins: () => tx.appUser.count({ where: { role: 'admin', disabled: false } }),
      add: async (user) => {
        await tx.appUser.create({ data: user });
      },
      update: async (user, expectedVersion) => {
        const { count } = await tx.appUser.updateMany({
          where: { id: user.id, version: expectedVersion },
          data: {
            role: user.role,
            disabled: user.disabled,
            passwordHash: user.passwordHash,
            version: user.version,
          },
        });
        if (!count) throw new StaleVersionError();
      },
      revokeSessions: async (userId) => {
        await tx.loginSession.deleteMany({ where: { userId } });
      },
    },
  });
}
export async function prepareAccount(input: { username: string; password: string; role: Role }) {
  return {
    username: validateCredentials(input.username, input.password),
    passwordHash: await hashPassword(input.password),
    role: input.role,
  };
}
export async function preparePassword(password: string): Promise<string> {
  validatePassword(password);
  return hashPassword(password);
}

/** A criação inicial só pode ser feita no computador que opera a API, pela CLI. */
export async function bootstrapAdmin(
  db: Database,
  username: string,
  password: string,
): Promise<void> {
  const data = await prepareAccount({ username, password, role: 'admin' });
  await db.$transaction(async (tx) => {
    await lockApp(tx);
    if ((await tx.appUser.count()) !== 0)
      throw new AccessError(
        'access.bootstrap_closed',
        'O primeiro administrador já foi criado.',
        'conflict',
      );
    const user = await tx.appUser.create({
      data: { ...data, id: uuidGenerator.next(), createdAt: systemClock.now() },
    });
    await audit(tx, user.id, 'access.bootstrap', user.id);
  });
}
export function makeLogin(db: Database) {
  // Mesmo custo de verificação quando o usuário não existe.
  const dummyHash = 'scrypt$00000000000000000000000000000000$' + '0'.repeat(128);
  let concurrent = 0;
  return async (username: string, password: string, ip: string) => {
    if (concurrent >= 2)
      throw new AccessError(
        'access.login_busy',
        'Aguarde um momento e tente entrar novamente.',
        'rate_limit',
      );
    concurrent++;
    try {
      const normalized = username.trim().toLowerCase();
      await db.$transaction(async (tx) => {
        const now = systemClock.now();
        await tx.loginAttempt.deleteMany({ where: { expiresAt: { lte: now } } });
        for (const [scope, limit] of [
          ['user:' + normalized, 10],
          ['ip:' + ip, 30],
        ] as const) {
          const attempt = await tx.loginAttempt.upsert({
            where: { key: hashToken(scope) },
            create: {
              key: hashToken(scope),
              attempts: 1,
              expiresAt: new Date(now.getTime() + 15 * 60_000),
            },
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
      const user = await db.appUser.findUnique({ where: { username: normalized } });
      const valid = await verifyPassword(password, user?.passwordHash ?? dummyHash);
      if (!user || user.disabled || !valid)
        throw new AccessError(
          'access.credentials_invalid',
          'Usuário ou senha inválidos.',
          'unauthorized',
        );
      const token = newToken();
      const expiresAt = new Date(systemClock.now().getTime() + 8 * 60 * 60_000);
      await db.$transaction(async (tx) => {
        await lockApp(tx);
        const current = await tx.appUser.findUnique({ where: { id: user.id } });
        if (!current || current.disabled || current.version !== user.version)
          throw new AccessError(
            'access.credentials_invalid',
            'Usuário ou senha inválidos.',
            'unauthorized',
          );
        await tx.loginSession.deleteMany({ where: { expiresAt: { lte: systemClock.now() } } });
        await tx.loginSession.create({
          data: { tokenHash: hashToken(token), userId: user.id, expiresAt },
        });
        await audit(tx, user.id, 'access.login', user.id);
      });
      return { token, expiresAt, user: publicUser(user) };
    } finally {
      concurrent--;
    }
  };
}
