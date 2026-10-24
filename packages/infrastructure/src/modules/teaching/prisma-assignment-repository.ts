import {
  InvalidAssignmentParticipantsError,
  InvalidAssignmentReferenceError,
  StaleVersionError,
} from '@classorganizer/core';
import type { AssignmentRepository, TeachingAssignment } from '@classorganizer/core';
import type { Prisma } from '../../generated/prisma/client.ts';
import { inTransaction, type PersistenceClient } from '../../persistence/database.ts';
import { PrismaErrorCode, isPrismaError } from '../../persistence/prisma-errors.ts';
import { isUuid } from '../../persistence/uuid.ts';

const withParticipants = {
  participants: {
    select: { teacherId: true, subjectId: true },
    orderBy: { position: 'asc' },
  },
  resources: { select: { resourceId: true }, orderBy: { position: 'asc' } },
} as const satisfies Prisma.TeachingAssignmentInclude;
type AssignmentRecord = Prisma.TeachingAssignmentGetPayload<{ include: typeof withParticipants }>;

function toDomain(record: AssignmentRecord): TeachingAssignment {
  return {
    id: record.id,
    classGroupId: record.classGroupId,
    participants: record.participants.map((p) => ({ ...p })),
    weeklyLessons: record.weeklyLessons,
    resourceIds: record.resources.map((r) => r.resourceId),
    createdAt: record.createdAt,
    version: record.version,
  };
}

/** As FKs protegem inclusive contra mudanças concorrentes nas habilitações. */
async function translateErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isPrismaError(error, PrismaErrorCode.uniqueViolation)) {
      throw new InvalidAssignmentParticipantsError();
    }
    if (isPrismaError(error, PrismaErrorCode.foreignKeyViolation)) {
      throw new InvalidAssignmentReferenceError(
        'A turma, a disciplina, um recurso ou a habilitação de um professor mudou enquanto ' +
          'o bloco era salvo. Atualize a página e tente novamente.',
      );
    }
    throw error;
  }
}

export class PrismaAssignmentRepository implements AssignmentRepository {
  readonly #db: PersistenceClient;

  constructor(db: PersistenceClient) {
    this.#db = db;
  }

  async findById(id: string): Promise<TeachingAssignment | null> {
    if (!isUuid(id)) return null;
    const record = await this.#db.teachingAssignment.findUnique({
      where: { id },
      include: withParticipants,
    });
    return record ? toDomain(record) : null;
  }

  async add(assignment: TeachingAssignment): Promise<void> {
    const { participants, resourceIds, ...data } = assignment;
    await translateErrors(() =>
      this.#db.teachingAssignment.create({
        data: {
          ...data,
          participants: { create: participants.map((p, position) => ({ ...p, position })) },
          resources: {
            create: resourceIds.map((resourceId, position) => ({ resourceId, position })),
          },
        },
      }),
    );
  }

  async update(assignment: TeachingAssignment): Promise<TeachingAssignment> {
    await translateErrors(() =>
      inTransaction(this.#db, async (tx) => {
        // Bloqueia o agregado pela versão antes de alterar qualquer participação.
        const { count } = await tx.teachingAssignment.updateMany({
          where: { id: assignment.id, version: assignment.version },
          data: { weeklyLessons: assignment.weeklyLessons, version: { increment: 1 } },
        });
        if (count === 0) throw new StaleVersionError();

        const teacherIds = assignment.participants.map((p) => p.teacherId);
        await tx.assignmentParticipant.deleteMany({
          where: { assignmentId: assignment.id, teacherId: { notIn: teacherIds } },
        });
        for (const [position, participant] of assignment.participants.entries()) {
          const data = { ...participant, position };
          await tx.assignmentParticipant.upsert({
            where: {
              assignmentId_teacherId: {
                assignmentId: assignment.id,
                teacherId: participant.teacherId,
              },
            },
            create: { assignmentId: assignment.id, ...data },
            update: data,
          });
        }
        await tx.assignmentResource.deleteMany({
          where: {
            assignmentId: assignment.id,
            resourceId: { notIn: [...assignment.resourceIds] },
          },
        });
        for (const [position, resourceId] of assignment.resourceIds.entries())
          await tx.assignmentResource.upsert({
            where: { assignmentId_resourceId: { assignmentId: assignment.id, resourceId } },
            create: { assignmentId: assignment.id, resourceId, position },
            update: { position },
          });
      }),
    );
    return { ...assignment, version: assignment.version + 1 };
  }

  async remove(assignment: TeachingAssignment): Promise<void> {
    const { count } = await this.#db.teachingAssignment.deleteMany({
      where: { id: assignment.id, version: assignment.version },
    });
    if (count === 0) throw new StaleVersionError();
  }

  async listAll(): Promise<TeachingAssignment[]> {
    const records = await this.#db.teachingAssignment.findMany({ include: withParticipants });
    return records.map(toDomain);
  }

  async subjectIdsAssignedTo(teacherId: string): Promise<Set<string>> {
    if (!isUuid(teacherId)) return new Set();
    const records = await this.#db.assignmentParticipant.findMany({
      where: { teacherId },
      select: { subjectId: true },
    });
    return new Set(records.map((r) => r.subjectId));
  }
}
