import {
  ClassGroupNameAlreadyInUseError,
  InvalidClassScheduleError,
  StaleVersionError,
  statusOf,
} from '@classorganizer/core';
import type {
  ClassGroup,
  ClassGroupRepository,
  ClassGroupStatusLookup,
  EntityStatus,
} from '@classorganizer/core';
import type { Prisma } from '../../generated/prisma/client.ts';
import { inTransaction, type PersistenceClient } from '../../persistence/database.ts';
import { PrismaErrorCode, translatePrismaError } from '../../persistence/prisma-errors.ts';
import { isUuid } from '../../persistence/uuid.ts';

const withPeriods = {
  periods: { select: { periodId: true }, orderBy: { period: { startMinute: 'asc' } } },
} as const satisfies Prisma.ClassGroupInclude;

type ClassGroupRecord = Prisma.ClassGroupGetPayload<{ include: typeof withPeriods }>;

function toDomain(record: ClassGroupRecord): ClassGroup {
  return {
    id: record.id,
    name: record.name,
    normalizedName: record.normalizedName,
    shiftId: record.shiftId,
    periodIds: record.periods.map((p) => p.periodId),
    createdAt: record.createdAt,
    archivedAt: record.archivedAt,
    version: record.version,
  };
}

/** Turno ou aula removidos depois que a tela foi carregada violam as FKs. */
function outdatedSchedule(): InvalidClassScheduleError {
  return new InvalidClassScheduleError(
    'O turno ou uma das aulas escolhidas não existe mais. Recarregue a página e tente novamente.',
  );
}

/** Também atende a porta `ClassGroupStatusLookup` do módulo de ensino. */
export class PrismaClassGroupRepository implements ClassGroupRepository, ClassGroupStatusLookup {
  readonly #db: PersistenceClient;

  constructor(db: PersistenceClient) {
    this.#db = db;
  }

  async findById(id: string): Promise<ClassGroup | null> {
    if (!isUuid(id)) {
      return null;
    }
    const record = await this.#db.classGroup.findUnique({ where: { id }, include: withPeriods });
    return record ? toDomain(record) : null;
  }

  async findByNormalizedName(normalizedName: string): Promise<ClassGroup | null> {
    const record = await this.#db.classGroup.findUnique({
      where: { normalizedName },
      include: withPeriods,
    });
    return record ? toDomain(record) : null;
  }

  async findByShift(shiftId: string): Promise<ClassGroup[]> {
    if (!isUuid(shiftId)) {
      return [];
    }
    const records = await this.#db.classGroup.findMany({
      where: { shiftId },
      include: withPeriods,
    });
    return records.map(toDomain);
  }

  /** Turmas nascem sem turno (`createClassGroup`); turno e aulas são gravados por `update`. */
  async add(classGroup: ClassGroup): Promise<void> {
    await translatePrismaError(
      () =>
        this.#db.classGroup.create({
          data: {
            id: classGroup.id,
            name: classGroup.name,
            normalizedName: classGroup.normalizedName,
            createdAt: classGroup.createdAt,
            archivedAt: classGroup.archivedAt,
            version: classGroup.version,
          },
        }),
      PrismaErrorCode.uniqueViolation,
      () => new ClassGroupNameAlreadyInUseError(classGroup),
    );
  }

  async update(classGroup: ClassGroup): Promise<ClassGroup> {
    const { id, shiftId, periodIds } = classGroup;
    await inTransaction(this.#db, async (tx) => {
      // As aulas que deixam de valer saem antes: a FK composta não deixa a turma mudar de
      // turno enquanto ainda tiver aulas do turno anterior.
      await tx.classGroupPeriod.deleteMany({
        where:
          shiftId === null
            ? { classGroupId: id }
            : { classGroupId: id, NOT: { shiftId, periodId: { in: [...periodIds] } } },
      });

      // A condição na versão garante que nenhuma alteração concorrente seja sobrescrita.
      const { count } = await translatePrismaError(
        () =>
          translatePrismaError(
            () =>
              tx.classGroup.updateMany({
                where: { id, version: classGroup.version },
                data: {
                  name: classGroup.name,
                  normalizedName: classGroup.normalizedName,
                  shiftId,
                  archivedAt: classGroup.archivedAt,
                  version: { increment: 1 },
                },
              }),
            PrismaErrorCode.uniqueViolation,
            () => new ClassGroupNameAlreadyInUseError(classGroup),
          ),
        PrismaErrorCode.foreignKeyViolation,
        outdatedSchedule,
      );
      if (count === 0) {
        throw new StaleVersionError();
      }

      if (shiftId !== null) {
        await translatePrismaError(
          () =>
            tx.classGroupPeriod.createMany({
              data: periodIds.map((periodId) => ({ classGroupId: id, shiftId, periodId })),
              skipDuplicates: true,
            }),
          PrismaErrorCode.foreignKeyViolation,
          outdatedSchedule,
        );
      }
    });
    return { ...classGroup, version: classGroup.version + 1 };
  }

  async listAll(): Promise<ClassGroup[]> {
    const records = await this.#db.classGroup.findMany({ include: withPeriods });
    return records.map(toDomain);
  }

  async classGroupStatus(id: string): Promise<EntityStatus | undefined> {
    if (!isUuid(id)) {
      return undefined;
    }
    const record = await this.#db.classGroup.findUnique({
      where: { id },
      select: { archivedAt: true },
    });
    return record ? statusOf(record) : undefined;
  }
}
