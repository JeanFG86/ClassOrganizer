import {
  QualificationInUseError,
  StaleVersionError,
  UnknownSubjectError,
} from '@classorganizer/core';
import type { Teacher, TeacherRepository } from '@classorganizer/core';
import type { Prisma } from '../generated/prisma/client.ts';
import type { Database } from './database.ts';
import { PrismaErrorCode, translatePrismaError } from './prisma-errors.ts';
import { isUuid } from './uuid.ts';

const withSubjects = {
  subjects: { select: { subjectId: true }, orderBy: { position: 'asc' } },
} as const satisfies Prisma.TeacherInclude;

type TeacherRecord = Prisma.TeacherGetPayload<{ include: typeof withSubjects }>;

function toDomain(record: TeacherRecord): Teacher {
  return {
    id: record.id,
    name: record.name,
    subjectIds: record.subjects.map((s) => s.subjectId),
    createdAt: record.createdAt,
    archivedAt: record.archivedAt,
    version: record.version,
  };
}

function qualifications(teacher: Teacher) {
  return teacher.subjectIds.map((subjectId, position) => ({ subjectId, position }));
}

/** Disciplina inexistente numa habilitação nova viola a FK para `subject`. */
function translateUnknownSubject<T>(operation: () => Promise<T>): Promise<T> {
  return translatePrismaError(
    operation,
    PrismaErrorCode.foreignKeyViolation,
    () => new UnknownSubjectError(),
  );
}

export class PrismaTeacherRepository implements TeacherRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async findById(id: string): Promise<Teacher | null> {
    if (!isUuid(id)) {
      return null;
    }
    const record = await this.#db.teacher.findUnique({ where: { id }, include: withSubjects });
    return record ? toDomain(record) : null;
  }

  async add(teacher: Teacher): Promise<void> {
    await translateUnknownSubject(() =>
      // Criação aninhada: professor e habilitações na mesma instrução, de forma atômica.
      this.#db.teacher.create({
        data: {
          id: teacher.id,
          name: teacher.name,
          createdAt: teacher.createdAt,
          archivedAt: teacher.archivedAt,
          version: teacher.version,
          subjects: { create: qualifications(teacher) },
        },
      }),
    );
  }

  async update(teacher: Teacher): Promise<Teacher> {
    await this.#db.$transaction(async (tx) => {
      // A condição na versão garante que nenhuma alteração concorrente seja sobrescrita;
      // a linha fica bloqueada até o fim da transação.
      const { count } = await tx.teacher.updateMany({
        where: { id: teacher.id, version: teacher.version },
        data: { name: teacher.name, archivedAt: teacher.archivedAt, version: { increment: 1 } },
      });
      if (count === 0) {
        throw new StaleVersionError();
      }

      // Remove só as habilitações desmarcadas: se alguma tiver atribuição, a FK composta
      // de teaching_assignment impede a remoção.
      await translatePrismaError(
        () =>
          tx.teacherSubject.deleteMany({
            where: { teacherId: teacher.id, subjectId: { notIn: [...teacher.subjectIds] } },
          }),
        PrismaErrorCode.foreignKeyViolation,
        () => new QualificationInUseError(),
      );

      for (const { subjectId, position } of qualifications(teacher)) {
        await translateUnknownSubject(() =>
          tx.teacherSubject.upsert({
            where: { teacherId_subjectId: { teacherId: teacher.id, subjectId } },
            create: { teacherId: teacher.id, subjectId, position },
            update: { position },
          }),
        );
      }
    });
    return { ...teacher, version: teacher.version + 1 };
  }

  async listAll(): Promise<Teacher[]> {
    const records = await this.#db.teacher.findMany({ include: withSubjects });
    return records.map(toDomain);
  }
}
