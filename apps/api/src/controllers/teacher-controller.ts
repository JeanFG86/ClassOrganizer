import type { TeacherDto } from '@classorganizer/contracts';
import type {
  ArchiveTeacher,
  ChangeTeacherAvailability,
  ListTeachers,
  RegisterTeacher,
  RestoreTeacher,
  Teacher,
  UpdateTeacher,
} from '@classorganizer/core';

export interface TeacherOperations {
  registerTeacher: RegisterTeacher['execute'];
  listTeachers: ListTeachers['execute'];
  updateTeacher: UpdateTeacher['execute'];
  archiveTeacher: ArchiveTeacher['execute'];
  restoreTeacher: RestoreTeacher['execute'];
  changeTeacherAvailability: ChangeTeacherAvailability['execute'];
}
function toDto(teacher: Teacher): TeacherDto {
  return {
    id: teacher.id,
    name: teacher.name,
    subjectIds: [...teacher.subjectIds],
    maxWeeklyLessons: teacher.maxWeeklyLessons,
    planningPeriods: teacher.planningPeriods,
    unavailable: teacher.unavailable.map((slot) => ({ ...slot })),
    createdAt: teacher.createdAt.toISOString(),
    archivedAt: teacher.archivedAt?.toISOString() ?? null,
    version: teacher.version,
  };
}
export class TeacherController {
  readonly #operations: TeacherOperations;
  constructor(operations: TeacherOperations) {
    this.#operations = operations;
  }
  async registerTeacher(...args: Parameters<TeacherOperations['registerTeacher']>) {
    return toDto(await this.#operations.registerTeacher(...args));
  }
  async listTeachers(...args: Parameters<TeacherOperations['listTeachers']>) {
    return { items: (await this.#operations.listTeachers(...args)).map(toDto) };
  }
  async updateTeacher(...args: Parameters<TeacherOperations['updateTeacher']>) {
    return toDto(await this.#operations.updateTeacher(...args));
  }
  async archiveTeacher(...args: Parameters<TeacherOperations['archiveTeacher']>) {
    return toDto(await this.#operations.archiveTeacher(...args));
  }
  async restoreTeacher(...args: Parameters<TeacherOperations['restoreTeacher']>) {
    return toDto(await this.#operations.restoreTeacher(...args));
  }
  async changeTeacherAvailability(
    ...args: Parameters<TeacherOperations['changeTeacherAvailability']>
  ) {
    return toDto(await this.#operations.changeTeacherAvailability(...args));
  }
}
