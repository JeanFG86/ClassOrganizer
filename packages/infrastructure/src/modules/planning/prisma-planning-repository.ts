import {
  StaleVersionError,
  PlanningError,
  type CatalogSnapshot,
  type JsonValue,
  type Planning,
  type PlanningRepository,
  type PlanningRevision,
  validateGridRules,
} from '@classorganizer/core';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { PersistenceClient } from '../../persistence/database.ts';
import { inTransaction } from '../../persistence/database.ts';
import { isUuid } from '../../persistence/uuid.ts';
import { PrismaSubjectRepository } from '../../persistence/prisma-subject-repository.ts';
import { PrismaTeacherRepository } from '../teaching/prisma-teacher-repository.ts';
import { PrismaClassGroupRepository } from '../school-structure/prisma-class-group-repository.ts';
import { PrismaShiftRepository } from '../school-structure/prisma-shift-repository.ts';
import { PrismaAssignmentRepository } from '../teaching/prisma-assignment-repository.ts';
import { PrismaResourceRepository } from '../school-structure/prisma-resource-repository.ts';
import { systemClock } from '../../system/system-ports.ts';

function jsonRows(rows: unknown[]): JsonValue[] {
  return JSON.parse(JSON.stringify(rows)) as JsonValue[];
}
function revisionData(revision: PlanningRevision) {
  return {
    ...revision,
    snapshot: revision.snapshot as unknown as Prisma.InputJsonObject,
    gridRules: revision.gridRules as unknown as Prisma.InputJsonObject,
  };
}
export class PrismaPlanningRepository implements PlanningRepository {
  readonly #db: PersistenceClient;
  constructor(db: PersistenceClient) {
    this.#db = db;
  }
  async list(): Promise<Planning[]> {
    return this.#db.planning.findMany({ orderBy: { createdAt: 'desc' } });
  }
  async find(id: string): Promise<Planning | null> {
    return isUuid(id) ? this.#db.planning.findUnique({ where: { id } }) : null;
  }
  async revisions(planningId: string): Promise<PlanningRevision[]> {
    if (!isUuid(planningId)) return [];
    const rows = await this.#db.planningRevision.findMany({
      where: { planningId },
      orderBy: { number: 'asc' },
    });
    return rows.map((row) => ({
      ...row,
      snapshot: row.snapshot as unknown as CatalogSnapshot,
      gridRules: validateGridRules(row.gridRules),
    }));
  }
  async add(planning: Planning, revision: PlanningRevision): Promise<void> {
    await inTransaction(this.#db, async (tx) => {
      await tx.planning.create({ data: planning });
      await tx.planningRevision.create({ data: revisionData(revision) });
    });
  }
  async save(planning: Planning, revision?: PlanningRevision): Promise<void> {
    if (revision && revision.planningId !== planning.id)
      throw new PlanningError(
        'planning.revision_invalid',
        'A revisão pertence a outro planejamento.',
      );
    await inTransaction(this.#db, async (tx) => {
      const { count } = await tx.planning.updateMany({
        where: { id: planning.id, version: planning.version },
        data: { archivedAt: planning.archivedAt, version: { increment: 1 } },
      });
      if (!count) throw new StaleVersionError();
      if (revision) {
        await tx.planningRevision.upsert({
          where: { id: revision.id, planningId: planning.id },
          create: revisionData(revision),
          update: {
            gridRules: revision.gridRules as unknown as Prisma.InputJsonObject,
            rulesReviewed: revision.rulesReviewed,
            availabilityReviewed: revision.availabilityReviewed,
            sealedAt: revision.sealedAt,
          },
        });
      }
    });
  }
  async capture(): Promise<CatalogSnapshot> {
    // A unidade de trabalho já bloqueou app_state; todas as escritas da API usam esse bloqueio.
    const state = await this.#db.appState.findUniqueOrThrow({ where: { id: 1 } });
    const subjects = await new PrismaSubjectRepository(this.#db).listAll();
    const teachers = await new PrismaTeacherRepository(this.#db).listAll();
    const classGroups = await new PrismaClassGroupRepository(this.#db).listAll();
    const shifts = await new PrismaShiftRepository(this.#db).listAll();
    const assignments = await new PrismaAssignmentRepository(this.#db).listAll();
    const resources = await new PrismaResourceRepository(this.#db).listAll();
    return {
      formatVersion: 1,
      catalogVersion: state.catalogVersion,
      capturedAt: systemClock.now().toISOString(),
      subjects: jsonRows(subjects),
      teachers: jsonRows(teachers),
      classGroups: jsonRows(classGroups),
      shifts: jsonRows(shifts),
      assignments: jsonRows(assignments),
      resources: jsonRows(resources),
    };
  }
}
