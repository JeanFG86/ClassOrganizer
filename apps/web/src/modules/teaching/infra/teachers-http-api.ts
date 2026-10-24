import type { TeachersApi } from '../application/teachers-api.ts';
import { teacherListSchema, teacherSchema } from '@classorganizer/contracts';

import { type HttpClient } from '../../../shared/application/ports/http-client.ts';

const teacherPath = (id: string) => `/teachers/${encodeURIComponent(id)}`;

export function createTeachersApi(client: HttpClient): TeachersApi {
  const apiRequest = client.request.bind(client);
  return {
    async list() {
      const { items } = await apiRequest(teacherListSchema, '/teachers');
      return items;
    },
    register(input) {
      return apiRequest(teacherSchema, '/teachers', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    update(id, input) {
      return apiRequest(teacherSchema, teacherPath(id), {
        method: 'PUT',
        body: JSON.stringify(input),
      });
    },
    archive(id, version) {
      return apiRequest(teacherSchema, `${teacherPath(id)}/archive`, {
        method: 'POST',
        body: JSON.stringify({ version }),
      });
    },
    restore(id, version) {
      return apiRequest(teacherSchema, `${teacherPath(id)}/restore`, {
        method: 'POST',
        body: JSON.stringify({ version }),
      });
    },
    changeAvailability(id, input) {
      return apiRequest(teacherSchema, `${teacherPath(id)}/availability`, {
        method: 'PUT',
        body: JSON.stringify(input),
      });
    },
  };
}
