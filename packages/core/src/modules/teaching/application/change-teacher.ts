import type { Clock } from '../../../shared/ports.ts';
import { assertVersion } from '../../../shared/versioning.ts';
import type { VersionedRef } from '../../../shared/versioning.ts';
import {
  QualificationInUseError,
  TeacherHasAssignmentsError,
  TeacherNotFoundError,
  archiveTeacher,
  assertQualificationsAllowed,
  changeTeacher,
  restoreTeacher,
} from '../domain/teacher.ts';
import type { Teacher } from '../domain/teacher.ts';
import type { AssignmentRepository, SubjectLookup, TeacherRepository } from './ports.ts';

async function loadForChange(teachers: TeacherRepository, ref: VersionedRef): Promise<Teacher> {
  const teacher = await teachers.findById(ref.id);
  if (!teacher) {
    throw new TeacherNotFoundError();
  }
  assertVersion(teacher.version, ref.version);
  return teacher;
}

export function makeUpdateTeacher({
  teachers,
  subjects,
  assignments,
}: {
  teachers: TeacherRepository;
  subjects: SubjectLookup;
  assignments: AssignmentRepository;
}) {
  return async function updateTeacher(
    input: VersionedRef & { name: string; subjectIds: readonly string[] },
  ): Promise<Teacher> {
    const current = await loadForChange(teachers, input);
    const changed = changeTeacher(current, input);

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
  };
}

export function makeArchiveTeacher({
  teachers,
  assignments,
  clock,
}: {
  teachers: TeacherRepository;
  assignments: AssignmentRepository;
  clock: Clock;
}) {
  return async function archive(ref: VersionedRef): Promise<Teacher> {
    const current = await loadForChange(teachers, ref);
    if (current.archivedAt) {
      return current;
    }
    if ((await assignments.subjectIdsAssignedTo(current.id)).size > 0) {
      throw new TeacherHasAssignmentsError();
    }
    return teachers.update(archiveTeacher(current, clock.now()));
  };
}

export function makeRestoreTeacher({ teachers }: { teachers: TeacherRepository }) {
  return async function restore(ref: VersionedRef): Promise<Teacher> {
    const current = await loadForChange(teachers, ref);
    if (!current.archivedAt) {
      return current;
    }
    return teachers.update(restoreTeacher(current));
  };
}

export type UpdateTeacher = ReturnType<typeof makeUpdateTeacher>;
export type ArchiveTeacher = ReturnType<typeof makeArchiveTeacher>;
export type RestoreTeacher = ReturnType<typeof makeRestoreTeacher>;
