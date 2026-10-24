import type { AssignmentDto } from '@classorganizer/contracts';
import type {
  AssignTeaching,
  ChangeAssignment,
  ListAssignments,
  RemoveAssignment,
  TeachingAssignment,
} from '@classorganizer/core';

export interface AssignmentOperations {
  assignTeaching: AssignTeaching['execute'];
  listAssignments: ListAssignments['execute'];
  changeAssignment: ChangeAssignment['execute'];
  removeAssignment: RemoveAssignment['execute'];
}
function toDto(assignment: TeachingAssignment): AssignmentDto {
  return {
    id: assignment.id,
    classGroupId: assignment.classGroupId,
    participants: assignment.participants.map((p) => ({ ...p })),
    weeklyLessons: assignment.weeklyLessons,
    resourceIds: [...assignment.resourceIds],
    createdAt: assignment.createdAt.toISOString(),
    version: assignment.version,
  };
}
export class AssignmentController {
  readonly #operations: AssignmentOperations;
  constructor(operations: AssignmentOperations) {
    this.#operations = operations;
  }
  async assignTeaching(...args: Parameters<AssignmentOperations['assignTeaching']>) {
    return toDto(await this.#operations.assignTeaching(...args));
  }
  async listAssignments(...args: Parameters<AssignmentOperations['listAssignments']>) {
    return { items: (await this.#operations.listAssignments(...args)).map(toDto) };
  }
  async changeAssignment(...args: Parameters<AssignmentOperations['changeAssignment']>) {
    return toDto(await this.#operations.changeAssignment(...args));
  }
  removeAssignment(...args: Parameters<AssignmentOperations['removeAssignment']>) {
    return this.#operations.removeAssignment(...args);
  }
}
