import { TeacherEntity } from '../../domain/teacher.ts';
import { bindUseCase } from '../../../../shared/use-case.ts';
import type { Clock, IdGenerator } from '../../../../shared/ports.ts';
import { assertQualificationsAllowed } from '../../domain/teacher.ts';
import type { Teacher, WorkloadInput } from '../../domain/teacher.ts';
import type { SubjectLookup, TeacherRepository } from '../ports/index.ts';

export interface RegisterTeacherDeps {
  teachers: TeacherRepository;
  subjects: SubjectLookup;
  clock: Clock;
  ids: IdGenerator;
}

export type RegisterTeacherDependencies = RegisterTeacherDeps;
export class RegisterTeacher {
  readonly #deps: RegisterTeacherDependencies;
  constructor(deps: RegisterTeacherDependencies) {
    this.#deps = deps;
  }
  async execute(
    input: { name: string; subjectIds: readonly string[] } & WorkloadInput,
  ): Promise<Teacher> {
    const { teachers, subjects, clock, ids } = this.#deps;

    const teacher = TeacherEntity.create({
      ...input,
      id: ids.next(),
      createdAt: clock.now(),
    }).snapshot();

    const statuses = await subjects.subjectStatuses(teacher.subjectIds);

    assertQualificationsAllowed(teacher.subjectIds, [], statuses);

    await teachers.add(teacher);

    return teacher;
  }
}
export function makeRegisterTeacher(deps: RegisterTeacherDependencies) {
  return bindUseCase(new RegisterTeacher(deps));
}
