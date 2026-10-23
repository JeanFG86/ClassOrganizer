import {
  PeriodInUseError,
  ShiftNameAlreadyInUseError,
  StaleVersionError,
} from '@classorganizer/core';
import type { PeriodLookup, Shift, ShiftRepository } from '@classorganizer/core';
import type { Prisma } from '../generated/prisma/client.ts';
import type { Database } from './database.ts';
import { PrismaErrorCode, translatePrismaError } from './prisma-errors.ts';
import { isUuid } from './uuid.ts';

const withPeriods = {
  periods: {
    select: { id: true, startMinute: true, endMinute: true },
    orderBy: { startMinute: 'asc' },
  },
} as const satisfies Prisma.ShiftInclude;

type ShiftRecord = Prisma.ShiftGetPayload<{ include: typeof withPeriods }>;

function toDomain(record: ShiftRecord): Shift {
  return {
    id: record.id,
    name: record.name,
    normalizedName: record.normalizedName,
    periods: record.periods.map((p) => ({ ...p })),
    createdAt: record.createdAt,
    archivedAt: record.archivedAt,
    version: record.version,
  };
}

/** Também atende a porta `PeriodLookup` do módulo de ensino. */
export class PrismaShiftRepository implements ShiftRepository, PeriodLookup {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async findById(id: string): Promise<Shift | null> {
    if (!isUuid(id)) {
      return null;
    }
    const record = await this.#db.shift.findUnique({ where: { id }, include: withPeriods });
    return record ? toDomain(record) : null;
  }

  async findByNormalizedName(normalizedName: string): Promise<Shift | null> {
    const record = await this.#db.shift.findUnique({
      where: { normalizedName },
      include: withPeriods,
    });
    return record ? toDomain(record) : null;
  }

  async add(shift: Shift): Promise<void> {
    await translatePrismaError(
      // Criação aninhada: turno e aulas na mesma instrução, de forma atômica.
      () =>
        this.#db.shift.create({
          data: {
            id: shift.id,
            name: shift.name,
            normalizedName: shift.normalizedName,
            createdAt: shift.createdAt,
            archivedAt: shift.archivedAt,
            version: shift.version,
            periods: { create: shift.periods.map((p) => ({ ...p })) },
          },
        }),
      PrismaErrorCode.uniqueViolation,
      () => new ShiftNameAlreadyInUseError(shift),
    );
  }

  async update(shift: Shift): Promise<Shift> {
    await this.#db.$transaction(async (tx) => {
      // A condição na versão garante que nenhuma alteração concorrente seja sobrescrita;
      // a linha fica bloqueada até o fim da transação.
      const { count } = await translatePrismaError(
        () =>
          tx.shift.updateMany({
            where: { id: shift.id, version: shift.version },
            data: {
              name: shift.name,
              normalizedName: shift.normalizedName,
              archivedAt: shift.archivedAt,
              version: { increment: 1 },
            },
          }),
        PrismaErrorCode.uniqueViolation,
        () => new ShiftNameAlreadyInUseError(shift),
      );
      if (count === 0) {
        throw new StaleVersionError();
      }

      // Remove só as aulas que saíram: se alguma estiver marcada numa turma, a FK de
      // class_group_period impede a remoção.
      const ids = shift.periods.map((p) => p.id);
      await translatePrismaError(
        () => tx.shiftPeriod.deleteMany({ where: { shiftId: shift.id, id: { notIn: ids } } }),
        PrismaErrorCode.foreignKeyViolation,
        () => new PeriodInUseError(),
      );

      // A condição no turno impede alterar a aula de outro turno com o mesmo id.
      for (const { id, startMinute, endMinute } of shift.periods) {
        const updated = await tx.shiftPeriod.updateMany({
          where: { id, shiftId: shift.id },
          data: { startMinute, endMinute },
        });
        if (updated.count === 0) {
          await tx.shiftPeriod.create({ data: { id, shiftId: shift.id, startMinute, endMinute } });
        }
      }
    });
    return { ...shift, version: shift.version + 1 };
  }

  async existingPeriodIds(ids: readonly string[]): Promise<Set<string>> {
    const valid = ids.filter(isUuid);
    if (valid.length === 0) {
      return new Set();
    }
    const records = await this.#db.shiftPeriod.findMany({
      where: { id: { in: valid } },
      select: { id: true },
    });
    return new Set(records.map((r) => r.id));
  }

  async listAll(): Promise<Shift[]> {
    const records = await this.#db.shift.findMany({ include: withPeriods });
    return records.map(toDomain);
  }
}
