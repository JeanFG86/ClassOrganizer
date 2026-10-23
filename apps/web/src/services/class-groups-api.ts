import { classGroupListSchema, classGroupSchema } from '@classorganizer/contracts';
import type { ClassGroupDto } from '@classorganizer/contracts';
import type { InjectionKey } from 'vue';
import { httpCatalogApi, type CatalogApi } from './catalog-api.ts';

export type ClassGroupsApi = CatalogApi<ClassGroupDto>;

export const classGroupsApiKey: InjectionKey<ClassGroupsApi> = Symbol('ClassGroupsApi');

export const httpClassGroupsApi: ClassGroupsApi = httpCatalogApi(
  '/class-groups',
  classGroupSchema,
  classGroupListSchema,
);
