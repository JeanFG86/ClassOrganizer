import { subjectListSchema, subjectSchema } from '@classorganizer/contracts';
import type { HttpClient } from '../../../shared/application/ports/http-client.ts';
import { httpCatalogApi } from '../../../shared/infra/http/catalog-http-api.ts';
import type { SubjectsApi } from '../application/subjects-api.ts';

export function createSubjectsApi(client: HttpClient): SubjectsApi {
  return httpCatalogApi('/subjects', subjectSchema, subjectListSchema, client);
}
