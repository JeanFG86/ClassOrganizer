import {
  AccessError,
  validateCredentials,
  validatePassword,
  type Role,
} from '@classorganizer/core';

import type { Database } from '../../persistence/database.ts';

import { systemClock, uuidGenerator } from '../../system/system-ports.ts';
import { audit, lockApp } from './unit-of-work.ts';
import { hashPassword } from './passwords.ts';

import { publicUser } from './user-mapper.ts';
export { publicUser };
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
