import { subjectListSchema, subjectSchema } from '@classorganizer/contracts';
import type { SubjectDto } from '@classorganizer/contracts';
import type { InjectionKey } from 'vue';
import { CatalogHttpApi, type CatalogApi } from './catalog-api.ts';

import { httpClient, type HttpClient } from './api-client.ts';

export type SubjectsApi = CatalogApi<SubjectDto>;

export const subjectsApiKey: InjectionKey<SubjectsApi> = Symbol('SubjectsApi');

export class SubjectsHttpApi extends CatalogHttpApi<SubjectDto> {
  constructor(client: HttpClient) {
    super('/subjects', subjectSchema, subjectListSchema, client);
  }
}
export const httpSubjectsApi: SubjectsApi = new SubjectsHttpApi(httpClient);
