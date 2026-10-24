import { StaleVersionError, type AccountRepository, type StoredUser } from '@classorganizer/core';
import type { AppUser } from '../../generated/prisma/client.ts';
import type { PersistenceClient } from '../../persistence/database.ts';
import { isUuid } from '../../persistence/uuid.ts';
import { publicUser } from './user-mapper.ts';

const stored = (user: AppUser): StoredUser => ({
  ...publicUser(user),
  passwordHash: user.passwordHash,
});

export class PrismaAccountRepository implements AccountRepository {
  readonly #db: PersistenceClient;
  constructor(db: PersistenceClient) {
    this.#db = db;
  }
  async list(): Promise<StoredUser[]> {
    return (await this.#db.appUser.findMany({ orderBy: { username: 'asc' } })).map(stored);
  }
  async find(id: string): Promise<StoredUser | null> {
    const user = isUuid(id) ? await this.#db.appUser.findUnique({ where: { id } }) : null;
    return user ? stored(user) : null;
  }
  async findUsername(username: string): Promise<StoredUser | null> {
    const user = await this.#db.appUser.findUnique({ where: { username } });
    return user ? stored(user) : null;
  }
  activeAdmins(): Promise<number> {
    return this.#db.appUser.count({ where: { role: 'admin', disabled: false } });
  }
  async add(user: StoredUser): Promise<void> {
    await this.#db.appUser.create({ data: user });
  }
  async update(user: StoredUser, expectedVersion: number): Promise<void> {
    const { count } = await this.#db.appUser.updateMany({
      where: { id: user.id, version: expectedVersion },
      data: {
        role: user.role,
        disabled: user.disabled,
        passwordHash: user.passwordHash,
        version: user.version,
      },
    });
    if (!count) throw new StaleVersionError();
  }
  async revokeSessions(userId: string): Promise<void> {
    await this.#db.loginSession.deleteMany({ where: { userId } });
  }
}
