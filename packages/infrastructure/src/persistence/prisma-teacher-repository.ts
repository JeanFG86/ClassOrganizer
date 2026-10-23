import { UnknownSubjectError } from '@classorganizer/core';
import type { Teacher, TeacherRepository } from '@classorganizer/core';
import { Prisma } from '../generated/prisma/client.ts';
import type { Database } from './database.ts';

const FOREIGN_KEY_VIOLATION = 'P2003';

export class PrismaTeacherRepository implements TeacherRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async add(teacher: Teacher): Promise<void> {
    try {
      // Criação aninhada: professor e habilitações na mesma instrução, de forma atômica.
      await this.#db.teacher.create({
        data: {
          id: teacher.id,
          name: teacher.name,
          createdAt: teacher.createdAt,
          subjects: {
            create: teacher.subjectIds.map((subjectId, position) => ({ subjectId, position })),
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === FOREIGN_KEY_VIOLATION
      ) {
        throw new UnknownSubjectError();
      }
      throw error;
    }
  }

  async listAll(): Promise<Teacher[]> {
    const records = await this.#db.teacher.findMany({
      include: { subjects: { select: { subjectId: true }, orderBy: { position: 'asc' } } },
    });
    return records.map((record) => ({
      id: record.id,
      name: record.name,
      subjectIds: record.subjects.map((s) => s.subjectId),
      createdAt: record.createdAt,
    }));
  }
}
