import { subjectListSchema, subjectSchema } from '@classorganizer/contracts';
import type { SubjectDto } from '@classorganizer/contracts';
import type { InjectionKey } from 'vue';
import { httpCatalogApi, type CatalogApi } from './catalog-api.ts';

export type SubjectsApi = CatalogApi<SubjectDto>;

export const subjectsApiKey: InjectionKey<SubjectsApi> = Symbol('SubjectsApi');

export const httpSubjectsApi: SubjectsApi = httpCatalogApi(
  '/subjects',
  subjectSchema,
  subjectListSchema,
);
