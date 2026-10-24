import { type PreferenceCriterionDto } from '@classorganizer/contracts';

import type { GridRef } from '../../planning/application/grid-api.ts';
import type { z } from 'zod';
import type {
  GenerationListDto,
  GenerationDetailDto,
  GenerationRunDto,
  gridResultSchema,
} from '@classorganizer/contracts';
export interface GenerationApi {
  list(planningId: string): Promise<GenerationListDto>;
  detail(planningId: string, runId: string): Promise<GenerationDetailDto>;
  request(ref: GridRef, preferences: readonly PreferenceCriterionDto[]): Promise<GenerationRunDto>;
  cancel(planningId: string, runId: string): Promise<GenerationRunDto>;
  apply(ref: GridRef, runId: string): Promise<z.infer<typeof gridResultSchema>>;
}
