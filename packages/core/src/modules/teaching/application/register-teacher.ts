import type { Clock, IdGenerator } from '../../../shared/ports.ts';
import { assertQualificationsAllowed, createTeacher } from '../domain/teacher.ts';
import type { Teacher, WorkloadInput } from '../domain/teacher.ts';
import type { SubjectLookup, TeacherRepository } from './ports.ts';

export interface RegisterTeacherDeps {
  teachers: TeacherRepository;
  subjects: SubjectLookup;
  clock: Clock;
  ids: IdGenerator;
}

export function makeRegisterTeacher({ teachers, subjects, clock, ids }: RegisterTeacherDeps) {
  return async function registerTeacher(
    input: { name: string; subjectIds: readonly string[] } & WorkloadInput,
  ): Promise<Teacher> {
    const teacher = createTeacher({ ...input, id: ids.next(), createdAt: clock.now() });

    const statuses = await subjects.subjectStatuses(teacher.subjectIds);
    assertQualificationsAllowed(teacher.subjectIds, [], statuses);

    await teachers.add(teacher);
    return teacher;
  };
}

export type RegisterTeacher = ReturnType<typeof makeRegisterTeacher>;
