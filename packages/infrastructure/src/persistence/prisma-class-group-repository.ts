import { ClassGroupNameAlreadyInUseError, StaleVersionError, statusOf } from '@classorganizer/core';
import type {
  ClassGroup,
  ClassGroupRepository,
  ClassGroupStatusLookup,
  EntityStatus,
} from '@classorganizer/core';
import type { ClassGroup as ClassGroupRecord } from '../generated/prisma/client.ts';
import type { Database } from './database.ts';
import { PrismaErrorCode, translatePrismaError } from './prisma-errors.ts';
import { isUuid } from './uuid.ts';

function toDomain(record: ClassGroupRecord): ClassGroup {
  return {
    id: record.id,
    name: record.name,
    normalizedName: record.normalizedName,
    createdAt: record.createdAt,
    archivedAt: record.archivedAt,
    version: record.version,
  };
}

/** Também atende a porta `ClassGroupStatusLookup` do módulo de ensino. */
export class PrismaClassGroupRepository implements ClassGroupRepository, ClassGroupStatusLookup {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async findById(id: string): Promise<ClassGroup | null> {
    if (!isUuid(id)) {
      return null;
    }
    const record = await this.#db.classGroup.findUnique({ where: { id } });
    return record ? toDomain(record) : null;
  }

  async findByNormalizedName(normalizedName: string): Promise<ClassGroup | null> {
    const record = await this.#db.classGroup.findUnique({ where: { normalizedName } });
    return record ? toDomain(record) : null;
  }

  async add(classGroup: ClassGroup): Promise<void> {
    await translatePrismaError(
      () => this.#db.classGroup.create({ data: { ...classGroup } }),
      PrismaErrorCode.uniqueViolation,
      () => new ClassGroupNameAlreadyInUseError(classGroup),
    );
  }

  async update(classGroup: ClassGroup): Promise<ClassGroup> {
    const { count } = await translatePrismaError(
      () =>
        this.#db.classGroup.updateMany({
          where: { id: classGroup.id, version: classGroup.version },
          data: {
            name: classGroup.name,
            normalizedName: classGroup.normalizedName,
            archivedAt: classGroup.archivedAt,
            version: { increment: 1 },
          },
        }),
      PrismaErrorCode.uniqueViolation,
      () => new ClassGroupNameAlreadyInUseError(classGroup),
    );
    if (count === 0) {
      throw new StaleVersionError();
    }
    return { ...classGroup, version: classGroup.version + 1 };
  }

  async listAll(): Promise<ClassGroup[]> {
    const records = await this.#db.classGroup.findMany();
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
