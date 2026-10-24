import type { z } from 'zod';
import type { changePlanningSchema } from '@classorganizer/contracts';

import type { PlanningDto, PlanningDetailDto } from '@classorganizer/contracts';
export interface PlanningsApi {
  plannings(): Promise<PlanningDto[]>;
  planning(id: string): Promise<PlanningDetailDto>;
  createPlanning(input: {
    name: string;
    year: number;
    sourceId?: string;
    sourceVersion?: number;
  }): Promise<PlanningDto>;
  changePlanning(id: string, input: z.infer<typeof changePlanningSchema>): Promise<PlanningDto>;
}
