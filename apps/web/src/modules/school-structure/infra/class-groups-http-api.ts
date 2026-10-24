import type { ClassGroupsApi } from '../application/class-groups-api.ts';
import { classGroupListSchema, classGroupSchema } from '@classorganizer/contracts';

import { type HttpClient } from '../../../shared/application/ports/http-client.ts';
import { httpCatalogApi } from '../../../shared/infra/http/catalog-http-api.ts';

export function createClassGroupsApi(client: HttpClient): ClassGroupsApi {
  const apiRequest = client.request.bind(client);
  return {
    ...httpCatalogApi('/class-groups', classGroupSchema, classGroupListSchema, client),
    changeSchedule(id, input) {
      return apiRequest(classGroupSchema, `/class-groups/${encodeURIComponent(id)}/schedule`, {
        method: 'PUT',
        body: JSON.stringify(input),
      });
    },
  };
}
