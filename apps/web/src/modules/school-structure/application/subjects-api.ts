import type { SubjectDto } from '@classorganizer/contracts';

import { type CatalogApi } from '../../../shared/application/catalog-api.ts';

export type SubjectsApi = CatalogApi<SubjectDto>;
