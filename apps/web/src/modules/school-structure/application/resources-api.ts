import type { ResourceDto } from '@classorganizer/contracts';

import { type CatalogApi } from '../../../shared/application/catalog-api.ts';

export type ResourcesApi = CatalogApi<ResourceDto>;
