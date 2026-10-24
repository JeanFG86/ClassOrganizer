import { ResourceNameAlreadyInUseError, StaleVersionError, statusOf } from '@classorganizer/core';
import type {
  EntityStatus,
  Resource,
  ResourceLookup,
  ResourceRepository,
} from '@classorganizer/core';
import type { Resource as ResourceRecord } from '../../generated/prisma/client.ts';
import type { PersistenceClient } from '../../persistence/database.ts';
import { PrismaErrorCode, translatePrismaError } from '../../persistence/prisma-errors.ts';
import { isUuid } from '../../persistence/uuid.ts';

function toDomain(record: ResourceRecord): Resource {
  return {
    id: record.id,
    name: record.name,
    normalizedName: record.normalizedName,
    createdAt: record.createdAt,
    archivedAt: record.archivedAt,
    version: record.version,
  };
}

/** Também atende a porta `ResourceLookup` do módulo de ensino. */
export class PrismaResourceRepository implements ResourceRepository, ResourceLookup {
  readonly #db: PersistenceClient;

  constructor(db: PersistenceClient) {
    this.#db = db;
  }

  async findById(id: string): Promise<Resource | null> {
    if (!isUuid(id)) return null;
    const record = await this.#db.resource.findUnique({ where: { id } });
    return record ? toDomain(record) : null;
  }

  async findByNormalizedName(normalizedName: string): Promise<Resource | null> {
    const record = await this.#db.resource.findUnique({ where: { normalizedName } });
    return record ? toDomain(record) : null;
  }

  async add(resource: Resource): Promise<void> {
    await translatePrismaError(
      () => this.#db.resource.create({ data: { ...resource } }),
      PrismaErrorCode.uniqueViolation,
      () => new ResourceNameAlreadyInUseError(resource),
    );
  }

  async update(resource: Resource): Promise<Resource> {
    // A condição na versão garante que nenhuma alteração concorrente seja sobrescrita.
    const { count } = await translatePrismaError(
      () =>
        this.#db.resource.updateMany({
          where: { id: resource.id, version: resource.version },
          data: {
            name: resource.name,
            normalizedName: resource.normalizedName,
            archivedAt: resource.archivedAt,
            version: { increment: 1 },
          },
        }),
      PrismaErrorCode.uniqueViolation,
      () => new ResourceNameAlreadyInUseError(resource),
    );
    if (count === 0) throw new StaleVersionError();
    return { ...resource, version: resource.version + 1 };
  }

  async listAll(): Promise<Resource[]> {
    return (await this.#db.resource.findMany()).map(toDomain);
  }

  async resourceStatuses(ids: readonly string[]): Promise<Map<string, EntityStatus>> {
    const validIds = ids.filter(isUuid);
    if (!validIds.length) return new Map();
    const found = await this.#db.resource.findMany({
      where: { id: { in: validIds } },
      select: { id: true, archivedAt: true },
    });
    return new Map(found.map((r) => [r.id, statusOf(r)]));
  }
}
