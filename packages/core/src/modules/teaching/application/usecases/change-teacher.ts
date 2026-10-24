import { TeacherEntity } from '../../domain/teacher.ts';

import type { Clock } from '../../../../shared/ports.ts';
import { assertVersion } from '../../../../shared/versioning.ts';
import type { VersionedRef } from '../../../../shared/versioning.ts';
import {
  QualificationInUseError,
  TeacherHasAssignmentsError,
  TeacherNotFoundError,
  assertQualificationsAllowed,
} from '../../domain/teacher.ts';
import type { Teacher, WorkloadInput } from '../../domain/teacher.ts';
import type {
  AssignmentRepository,
  PeriodLookup,
  SubjectLookup,
  TeacherRepository,
} from '../ports/index.ts';

async function loadForChange(teachers: TeacherRepository, ref: VersionedRef): Promise<Teacher> {
  const teacher = await teachers.findById(ref.id);
  if (!teacher) {
    throw new TeacherNotFoundError();
  }
  assertVersion(teacher.version, ref.version);
  return teacher;
}

export type UpdateTeacherDependencies = {
  teachers: TeacherRepository;
  subjects: SubjectLookup;
  assignments: AssignmentRepository;
};
export class UpdateTeacher {
  readonly #deps: UpdateTeacherDependencies;
  constructor(deps: UpdateTeacherDependencies) {
    this.#deps = deps;
  }
  async execute(
    input: VersionedRef & { name: string; subjectIds: readonly string[] } & WorkloadInput,
  ): Promise<Teacher> {
    const { teachers, subjects, assignments } = this.#deps;

    const current = await loadForChange(teachers, input);

    const changed = TeacherEntity.reconstitute(current).change(input).snapshot();

    const statuses = await subjects.subjectStatuses(changed.subjectIds);

    assertQualificationsAllowed(changed.subjectIds, current.subjectIds, statuses);

    // Mensagem antecipada; o banco também impede (FK da atribuição para a habilitação).
    const removed = current.subjectIds.filter((id) => !changed.subjectIds.includes(id));

    if (removed.length > 0) {
      const inUse = await assignments.subjectIdsAssignedTo(current.id);
      if (removed.some((id) => inUse.has(id))) {
        throw new QualificationInUseError();
      }
    }

    return teachers.update(changed);
  }
}

export type ArchiveTeacherDependencies = {
  teachers: TeacherRepository;
  assignments: AssignmentRepository;
  clock: Clock;
};
export class ArchiveTeacher {
  readonly #deps: ArchiveTeacherDependencies;
  constructor(deps: ArchiveTeacherDependencies) {
    this.#deps = deps;
  }
  async execute(ref: VersionedRef): Promise<Teacher> {
    const { teachers, assignments, clock } = this.#deps;

    const current = await loadForChange(teachers, ref);

    if (current.archivedAt) {
      return current;
    }

    if ((await assignments.subjectIdsAssignedTo(current.id)).size > 0) {
      throw new TeacherHasAssignmentsError();
    }

    return teachers.update(TeacherEntity.reconstitute(current).archive(clock.now()).snapshot());
  }
}

export type RestoreTeacherDependencies = { teachers: TeacherRepository };
export class RestoreTeacher {
  readonly #deps: RestoreTeacherDependencies;
  constructor(deps: RestoreTeacherDependencies) {
    this.#deps = deps;
  }
  async execute(ref: VersionedRef): Promise<Teacher> {
    const { teachers } = this.#deps;

    const current = await loadForChange(teachers, ref);

    if (!current.archivedAt) {
      return current;
    }

    return teachers.update(TeacherEntity.reconstitute(current).restore().snapshot());
  }
}

/** Substitui os horários em que o professor não pode dar aula. */
export type ChangeTeacherAvailabilityDependencies = {
  teachers: TeacherRepository;
  periods: PeriodLookup;
};
export class ChangeTeacherAvailability {
  readonly #deps: ChangeTeacherAvailabilityDependencies;
  constructor(deps: ChangeTeacherAvailabilityDependencies) {
    this.#deps = deps;
  }
  async execute(
    input: VersionedRef & { unavailable: readonly { weekday: number; periodId: string }[] },
  ): Promise<Teacher> {
    const { teachers, periods } = this.#deps;

    const current = await loadForChange(teachers, input);

    const known = await periods.existingPeriodIds(input.unavailable.map((s) => s.periodId));

    return teachers.update(
      TeacherEntity.reconstitute(current).setUnavailability(input.unavailable, known).snapshot(),
    );
  }
}
