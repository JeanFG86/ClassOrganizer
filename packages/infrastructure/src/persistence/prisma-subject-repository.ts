import { StaleVersionError, SubjectNameAlreadyInUseError } from '@classorganizer/core';
import type {
  Subject,
  SubjectLookup,
  SubjectRepository,
  SubjectStatus,
} from '@classorganizer/core';
import { Prisma } from '../generated/prisma/client.ts';
import type { Subject as SubjectRecord } from '../generated/prisma/client.ts';
import type { Database } from './database.ts';
import { isUuid } from './uuid.ts';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

function toDomain(record: SubjectRecord): Subject {
  return {
    id: record.id,
    name: record.name,
    normalizedName: record.normalizedName,
    createdAt: record.createdAt,
    archivedAt: record.archivedAt,
    version: record.version,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  );
}

/** Também atende a porta `SubjectLookup` do módulo de ensino. */
export class PrismaSubjectRepository implements SubjectRepository, SubjectLookup {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async findById(id: string): Promise<Subject | null> {
    if (!isUuid(id)) {
      return null;
    }
    const record = await this.#db.subject.findUnique({ where: { id } });
    return record ? toDomain(record) : null;
  }

  async findByNormalizedName(normalizedName: string): Promise<Subject | null> {
    const record = await this.#db.subject.findUnique({ where: { normalizedName } });
    return record ? toDomain(record) : null;
  }

  async add(subject: Subject): Promise<void> {
    try {
      await this.#db.subject.create({
        data: {
          id: subject.id,
          name: subject.name,
          normalizedName: subject.normalizedName,
          createdAt: subject.createdAt,
          archivedAt: subject.archivedAt,
          version: subject.version,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new SubjectNameAlreadyInUseError(subject);
      }
      throw error;
    }
  }

  async update(subject: Subject): Promise<Subject> {
    try {
      // A condição na versão garante que nenhuma alteração concorrente seja sobrescrita.
      const { count } = await this.#db.subject.updateMany({
        where: { id: subject.id, version: subject.version },
        data: {
          name: subject.name,
          normalizedName: subject.normalizedName,
          archivedAt: subject.archivedAt,
          version: { increment: 1 },
        },
      });
      if (count === 0) {
        throw new StaleVersionError();
      }
      return { ...subject, version: subject.version + 1 };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new SubjectNameAlreadyInUseError(subject);
      }
      throw error;
    }
  }

  async subjectStatuses(ids: readonly string[]): Promise<Map<string, SubjectStatus>> {
    const validIds = ids.filter(isUuid);
    if (validIds.length === 0) {
      return new Map();
    }
    const found = await this.#db.subject.findMany({
      where: { id: { in: validIds } },
      select: { id: true, archivedAt: true },
    });
    return new Map(found.map((s) => [s.id, s.archivedAt ? 'archived' : 'active']));
  }

  async listAll(): Promise<Subject[]> {
    const records = await this.#db.subject.findMany();
    return records.map(toDomain);
  }
}
