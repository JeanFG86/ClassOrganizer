import type { ResourcesApi } from '../application/resources-api.ts';
import { type HttpClient } from '../../../shared/application/ports/http-client.ts';
import { resourceListSchema, resourceSchema } from '@classorganizer/contracts';

import { httpCatalogApi } from '../../../shared/infra/http/catalog-http-api.ts';

export function createResourcesApi(client: HttpClient): ResourcesApi {
  return httpCatalogApi('/resources', resourceSchema, resourceListSchema, client);
}
