import { SubjectNameAlreadyInUseError } from '@classorganizer/core';
import type { Subject, SubjectRepository } from '@classorganizer/core';
import { Prisma } from '../generated/prisma/client.ts';
import type { Subject as SubjectRecord } from '../generated/prisma/client.ts';
import type { Database } from './database.ts';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

function toDomain(record: SubjectRecord): Subject {
  return {
    id: record.id,
    name: record.name,
    normalizedName: record.normalizedName,
    createdAt: record.createdAt,
  };
}

export class PrismaSubjectRepository implements SubjectRepository {
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

  async listAll(): Promise<Subject[]> {
    const records = await this.#db.subject.findMany();
    return records.map(toDomain);
  }
}
