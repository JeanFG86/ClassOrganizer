import type { SessionRepository, SessionView } from '@classorganizer/core';
import type { PersistenceClient } from '../../persistence/database.ts';
import { publicUser } from '../../access/accounts.ts';

export class PrismaSessionRepository implements SessionRepository {
  readonly #db: PersistenceClient;
  constructor(db: PersistenceClient) {
    this.#db = db;
  }
  async find(tokenHash: string): Promise<SessionView | null> {
    const session = await this.#db.loginSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    return session ? { user: publicUser(session.user), expiresAt: session.expiresAt } : null;
  }
  async revoke(tokenHash: string): Promise<void> {
    await this.#db.loginSession.deleteMany({ where: { tokenHash } });
  }
}
