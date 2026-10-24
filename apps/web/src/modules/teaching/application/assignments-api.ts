import type {
  AssignmentDto,
  CreateAssignmentRequest,
  UpdateAssignmentRequest,
} from '@classorganizer/contracts';

export interface AssignmentsApi {
  list(): Promise<AssignmentDto[]>;
  create(input: CreateAssignmentRequest): Promise<AssignmentDto>;
  update(id: string, input: UpdateAssignmentRequest): Promise<AssignmentDto>;
  remove(id: string, version: number): Promise<void>;
}
