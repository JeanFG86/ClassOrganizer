import type { ShiftsApi } from '../application/shifts-api.ts';
import { shiftListSchema, shiftSchema } from '@classorganizer/contracts';

import { type HttpClient } from '../../../shared/application/ports/http-client.ts';

const shiftPath = (id: string) => `/shifts/${encodeURIComponent(id)}`;

export function createShiftsApi(client: HttpClient): ShiftsApi {
  const apiRequest = client.request.bind(client);
  return {
    async list() {
      const { items } = await apiRequest(shiftListSchema, '/shifts');
      return items;
    },
    register(input) {
      return apiRequest(shiftSchema, '/shifts', { method: 'POST', body: JSON.stringify(input) });
    },
    update(id, input) {
      return apiRequest(shiftSchema, shiftPath(id), { method: 'PUT', body: JSON.stringify(input) });
    },
    archive(id, version) {
      return apiRequest(shiftSchema, `${shiftPath(id)}/archive`, {
        method: 'POST',
        body: JSON.stringify({ version }),
      });
    },
    restore(id, version) {
      return apiRequest(shiftSchema, `${shiftPath(id)}/restore`, {
        method: 'POST',
        body: JSON.stringify({ version }),
      });
    },
  };
}
