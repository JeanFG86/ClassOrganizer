import {
  AssignmentAlreadyExistsError,
  InvalidAssignmentReferenceError,
  StaleVersionError,
} from '@classorganizer/core';
import type { AssignmentRepository, TeachingAssignment } from '@classorganizer/core';
import type { TeachingAssignment as AssignmentRecord } from '../generated/prisma/client.ts';
import type { Database } from './database.ts';
import { PrismaErrorCode, isPrismaError } from './prisma-errors.ts';
import { isUuid } from './uuid.ts';

function toDomain(record: AssignmentRecord): TeachingAssignment {
  return {
    id: record.id,
    classGroupId: record.classGroupId,
    subjectId: record.subjectId,
    teacherId: record.teacherId,
    weeklyLessons: record.weeklyLessons,
    createdAt: record.createdAt,
    version: record.version,
  };
}

/**
 * As FKs (turma, disciplina e a FK composta para a habilitação) garantem a integridade
 * mesmo com alterações concorrentes; aqui viram um erro compreensível.
 */
async function translateErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isPrismaError(error, PrismaErrorCode.uniqueViolation)) {
      throw new AssignmentAlreadyExistsError();
    }
    if (isPrismaError(error, PrismaErrorCode.foreignKeyViolation)) {
      throw new InvalidAssignmentReferenceError(
        'A turma, a disciplina ou a habilitação do professor mudou enquanto a atribuição ' +
          'era salva. Atualize a página e tente novamente.',
      );
    }
    throw error;
  }
}

export class PrismaAssignmentRepository implements AssignmentRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async findById(id: string): Promise<TeachingAssignment | null> {
    if (!isUuid(id)) {
      return null;
    }
    const record = await this.#db.teachingAssignment.findUnique({ where: { id } });
    return record ? toDomain(record) : null;
  }

  async add(assignment: TeachingAssignment): Promise<void> {
    await translateErrors(() => this.#db.teachingAssignment.create({ data: { ...assignment } }));
  }

  async update(assignment: TeachingAssignment): Promise<TeachingAssignment> {
    const { count } = await translateErrors(() =>
      this.#db.teachingAssignment.updateMany({
        where: { id: assignment.id, version: assignment.version },
        data: {
          teacherId: assignment.teacherId,
          weeklyLessons: assignment.weeklyLessons,
          version: { increment: 1 },
        },
      }),
    );
    if (count === 0) {
      throw new StaleVersionError();
    }
    return { ...assignment, version: assignment.version + 1 };
  }

  async remove(assignment: TeachingAssignment): Promise<void> {
    const { count } = await this.#db.teachingAssignment.deleteMany({
      where: { id: assignment.id, version: assignment.version },
    });
    if (count === 0) {
      throw new StaleVersionError();
    }
  }

  async listAll(): Promise<TeachingAssignment[]> {
    const records = await this.#db.teachingAssignment.findMany();
    return records.map(toDomain);
  }

  async subjectIdsAssignedTo(teacherId: string): Promise<Set<string>> {
    if (!isUuid(teacherId)) {
      return new Set();
    }
    const records = await this.#db.teachingAssignment.findMany({
      where: { teacherId },
      select: { subjectId: true },
    });
    return new Set(records.map((r) => r.subjectId));
  }
}
