import { subjectListSchema, subjectSchema } from '@classorganizer/contracts';
import type { SubjectDto } from '@classorganizer/contracts';

import { CatalogHttpApi } from '../../../shared/infra/http/catalog-http-api.ts';

import { type HttpClient } from '../../../shared/application/ports/http-client.ts';

export class SubjectsHttpApi extends CatalogHttpApi<SubjectDto> {
  constructor(client: HttpClient) {
    super('/subjects', subjectSchema, subjectListSchema, client);
  }
}
