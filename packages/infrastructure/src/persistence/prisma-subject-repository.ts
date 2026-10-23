import { SubjectNameAlreadyInUseError } from '@classorganizer/core';
import type { Subject, SubjectLookup, SubjectRepository } from '@classorganizer/core';
import { Prisma } from '../generated/prisma/client.ts';
import type { Subject as SubjectRecord } from '../generated/prisma/client.ts';
import type { Database } from './database.ts';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids que não são UUID não existem no banco; filtrá-los evita erro de conversão do PostgreSQL. */
function isUuid(id: string): boolean {
  return UUID_PATTERN.test(id);
}

function toDomain(record: SubjectRecord): Subject {
  return {
    id: record.id,
    name: record.name,
    normalizedName: record.normalizedName,
    createdAt: record.createdAt,
  };
}

/** Também atende a porta `SubjectLookup` do módulo de ensino. */
export class PrismaSubjectRepository implements SubjectRepository, SubjectLookup {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async existsWithNormalizedName(normalizedName: string): Promise<boolean> {
    const found = await this.#db.subject.findUnique({
      where: { normalizedName },
      select: { id: true },
    });
    return found !== null;
  }

  async add(subject: Subject): Promise<void> {
    try {
      await this.#db.subject.create({
        data: {
          id: subject.id,
          name: subject.name,
          normalizedName: subject.normalizedName,
          createdAt: subject.createdAt,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new SubjectNameAlreadyInUseError(subject.name);
      }
      throw error;
    }
  }

  async existingSubjectIds(ids: readonly string[]): Promise<Set<string>> {
    if (ids.length === 0) {
      return new Set();
    }
    const found = await this.#db.subject.findMany({
      where: { id: { in: ids.filter(isUuid) } },
      select: { id: true },
    });
    return new Set(found.map((s) => s.id));
  }

  async listAll(): Promise<Subject[]> {
    const records = await this.#db.subject.findMany();
    return records.map(toDomain);
  }
}
