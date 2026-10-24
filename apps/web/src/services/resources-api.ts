import { resourceListSchema, resourceSchema } from '@classorganizer/contracts';
import type { ResourceDto } from '@classorganizer/contracts';
import type { InjectionKey } from 'vue';
import { httpCatalogApi, type CatalogApi } from './catalog-api.ts';

export type ResourcesApi = CatalogApi<ResourceDto>;

export const resourcesApiKey: InjectionKey<ResourcesApi> = Symbol('ResourcesApi');

export const httpResourcesApi: ResourcesApi = httpCatalogApi(
  '/resources',
  resourceSchema,
  resourceListSchema,
);
