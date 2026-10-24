import { Login, bindUseCase } from '@classorganizer/core';
import { PrismaLoginStore } from './prisma-login-store.ts';
import {
  AccessError,
  StaleVersionError,
  makeManageAccounts,
  type StoredUser,
  validateCredentials,
  validatePassword,
  type Role,
} from '@classorganizer/core';
import type { Prisma, AppUser } from '../../generated/prisma/client.ts';
import type { Database } from '../../persistence/database.ts';
import { isUuid } from '../../persistence/uuid.ts';
import { systemClock, uuidGenerator } from '../../system/system-ports.ts';
import { audit, lockApp } from './unit-of-work.ts';
import { hashPassword, hashToken, newToken, verifyPassword } from './passwords.ts';

import { publicUser } from './user-mapper.ts';
export { publicUser };
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
  return bindUseCase(
    new Login({
      store: new PrismaLoginStore(db),
      passwords: { hash: hashPassword, verify: verifyPassword },
      tokens: { create: newToken, hash: hashToken },
      clock: systemClock,
    }),
  );
}
