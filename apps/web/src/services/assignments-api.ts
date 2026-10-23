import { assignmentListSchema, assignmentSchema } from '@classorganizer/contracts';
import type { AssignmentDto } from '@classorganizer/contracts';
import { z } from 'zod';
import type { InjectionKey } from 'vue';
import { apiRequest } from './api-client.ts';

export interface AssignmentsApi {
  list(): Promise<AssignmentDto[]>;
  create(input: {
    classGroupId: string;
    subjectId: string;
    teacherId: string;
    weeklyLessons: number;
  }): Promise<AssignmentDto>;
  update(
    id: string,
    input: { teacherId: string; weeklyLessons: number; version: number },
  ): Promise<AssignmentDto>;
  remove(id: string, version: number): Promise<void>;
}

export const assignmentsApiKey: InjectionKey<AssignmentsApi> = Symbol('AssignmentsApi');

const itemPath = (id: string) => `/assignments/${encodeURIComponent(id)}`;

export const httpAssignmentsApi: AssignmentsApi = {
  async list() {
    const { items } = await apiRequest(assignmentListSchema, '/assignments');
    return items;
  },
  create(input) {
    return apiRequest(assignmentSchema, '/assignments', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  update(id, input) {
    return apiRequest(assignmentSchema, itemPath(id), {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  async remove(id, version) {
    // 204 sem corpo: o cliente lê o corpo como `undefined`.
    await apiRequest(z.undefined(), `${itemPath(id)}?version=${version}`, { method: 'DELETE' });
  },
};
