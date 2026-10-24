import {
  PlanningError,
  isWeekday,
  type GridChange,
  type GridDelta,
  type GridHistoryEntry,
  type GridRepository,
  type Placement,
} from '@classorganizer/core';
import type { Prisma } from '../generated/prisma/client.ts';
import type { PersistenceClient } from './database.ts';
import { inTransaction } from './database.ts';
import { PrismaErrorCode, translatePrismaError } from './prisma-errors.ts';
import { isUuid } from './uuid.ts';

function placement(row: {
  kind: string;
  entityId: string;
  weekday: number;
  periodId: string;
  pinned: boolean;
}): Placement {
  const { kind, entityId, weekday, periodId, pinned } = row;
  if ((kind !== 'lesson' && kind !== 'planning') || !isWeekday(weekday))
    throw new Error('Alocação inválida no banco.');
  return { kind, entityId, weekday, periodId, pinned };
}
const placements = (value: Prisma.JsonValue): Placement[] =>
  Array.isArray(value)
    ? value.map((item) => placement(item as unknown as Parameters<typeof placement>[0]))
    : [];

/** Grade e histórico de uma revisão; as garantias de imutabilidade ficam também no banco. */
export class PrismaGridRepository implements GridRepository {
  readonly #db: PersistenceClient;
  constructor(db: PersistenceClient) {
    this.#db = db;
  }
  async placements(revisionId: string): Promise<Placement[]> {
    if (!isUuid(revisionId)) return [];
    const rows = await this.#db.timetablePlacement.findMany({
      where: { revisionId },
      orderBy: [{ weekday: 'asc' }, { periodId: 'asc' }, { kind: 'asc' }, { entityId: 'asc' }],
    });
    return rows.map(placement);
  }
  async history(revisionId: string): Promise<GridHistoryEntry[]> {
    if (!isUuid(revisionId)) return [];
    const rows = await this.#db.timetableChange.findMany({
      where: { revisionId },
      orderBy: { sequence: 'asc' },
      include: { actor: { select: { username: true } } },
    });
    return rows.map((row) => {
      const kind = row.kind;
      if (kind !== 'operation' && kind !== 'undo' && kind !== 'import')
        throw new Error('Alteração inválida no banco.');
      const delta = row.delta as { removed?: Prisma.JsonValue; added?: Prisma.JsonValue };
      return {
        id: row.id,
        revisionId: row.revisionId,
        sequence: row.sequence,
        actorId: row.actorId,
        actorUsername: row.actor.username,
        occurredAt: row.occurredAt,
        kind,
        summary: row.summary,
        delta: { removed: placements(delta.removed ?? []), added: placements(delta.added ?? []) },
        revertsId: row.revertsId,
      };
    });
  }
  async apply(revisionId: string, delta: GridDelta): Promise<void> {
    await inTransaction(this.#db, async (tx) => {
      for (const removed of delta.removed) {
        const { count } = await tx.timetablePlacement.deleteMany({
          where: {
            revisionId,
            kind: removed.kind,
            entityId: removed.entityId,
            weekday: removed.weekday,
            periodId: removed.periodId,
            pinned: removed.pinned,
          },
        });
        if (count !== 1)
          throw new PlanningError(
            'grid.slot_missing',
            'A grade mudou desde a última leitura. Atualize a grade.',
          );
      }
      if (delta.added.length)
        await translatePrismaError(
          () =>
            tx.timetablePlacement.createMany({
              data: delta.added.map((p) => ({ ...p, revisionId })),
            }),
          PrismaErrorCode.uniqueViolation,
          () =>
            new PlanningError('grid.duplicate', 'Esta aula já está neste horário.', 'validation'),
        );
    });
  }
  async record(change: GridChange): Promise<void> {
    await this.#db.timetableChange.create({
      data: {
        ...change,
        delta: change.delta as unknown as Prisma.InputJsonObject,
      },
    });
  }
}
