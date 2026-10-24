import type { AuditReader, AuditCursor, AuditEntry } from '@classorganizer/core';
import type { PersistenceClient } from '../../persistence/database.ts';

export class PrismaAuditReader implements AuditReader {
  readonly #db: PersistenceClient;
  constructor(db: PersistenceClient) {
    this.#db = db;
  }
  list(before?: AuditCursor): Promise<AuditEntry[]> {
    return this.#db.auditEvent.findMany({
      where: before
        ? {
            OR: [
              { occurredAt: { lt: before.at } },
              { occurredAt: before.at, id: { lt: before.id } },
            ],
          }
        : {},
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 100,
      include: { actor: { select: { username: true } } },
    });
  }
}
