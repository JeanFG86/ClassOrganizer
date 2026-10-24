import type { AssignmentsApi } from '../application/assignments-api.ts';
import { assignmentListSchema, assignmentSchema } from '@classorganizer/contracts';

import { z } from 'zod';

import { type HttpClient } from '../../../shared/application/ports/http-client.ts';

const itemPath = (id: string) => `/assignments/${encodeURIComponent(id)}`;

export function createAssignmentsApi(client: HttpClient): AssignmentsApi {
  const apiRequest = client.request.bind(client);
  return {
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
}
