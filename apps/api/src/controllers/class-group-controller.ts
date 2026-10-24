import type { ClassGroupDto } from '@classorganizer/contracts';
import type {
  ArchiveClassGroup,
  ChangeClassGroupSchedule,
  ClassGroup,
  ListClassGroups,
  RegisterClassGroup,
  RestoreClassGroup,
  UpdateClassGroup,
} from '@classorganizer/core';

export interface ClassGroupOperations {
  registerClassGroup: RegisterClassGroup['execute'];
  listClassGroups: ListClassGroups['execute'];
  updateClassGroup: UpdateClassGroup['execute'];
  changeClassGroupSchedule: ChangeClassGroupSchedule['execute'];
  archiveClassGroup: ArchiveClassGroup['execute'];
  restoreClassGroup: RestoreClassGroup['execute'];
}
function toDto(classGroup: ClassGroup): ClassGroupDto {
  return {
    id: classGroup.id,
    name: classGroup.name,
    shiftId: classGroup.shiftId,
    periodIds: [...classGroup.periodIds],
    createdAt: classGroup.createdAt.toISOString(),
    archivedAt: classGroup.archivedAt?.toISOString() ?? null,
    version: classGroup.version,
  };
}
export class ClassGroupController {
  readonly #operations: ClassGroupOperations;
  constructor(operations: ClassGroupOperations) {
    this.#operations = operations;
  }
  async registerClassGroup(...args: Parameters<ClassGroupOperations['registerClassGroup']>) {
    return toDto(await this.#operations.registerClassGroup(...args));
  }
  async listClassGroups(...args: Parameters<ClassGroupOperations['listClassGroups']>) {
    return { items: (await this.#operations.listClassGroups(...args)).map(toDto) };
  }
  async updateClassGroup(...args: Parameters<ClassGroupOperations['updateClassGroup']>) {
    return toDto(await this.#operations.updateClassGroup(...args));
  }
  async changeClassGroupSchedule(
    ...args: Parameters<ClassGroupOperations['changeClassGroupSchedule']>
  ) {
    return toDto(await this.#operations.changeClassGroupSchedule(...args));
  }
  async archiveClassGroup(...args: Parameters<ClassGroupOperations['archiveClassGroup']>) {
    return toDto(await this.#operations.archiveClassGroup(...args));
  }
  async restoreClassGroup(...args: Parameters<ClassGroupOperations['restoreClassGroup']>) {
    return toDto(await this.#operations.restoreClassGroup(...args));
  }
}
