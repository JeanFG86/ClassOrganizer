import type { PlanningsApi } from '../application/plannings-api.ts';

import { planningsSchema, planningDetailSchema, planningSchema } from '@classorganizer/contracts';
import type { z } from 'zod';
import type { changePlanningSchema } from '@classorganizer/contracts';

import { type HttpClient } from '../../../shared/application/ports/http-client.ts';
export function createPlanningsApi(client: HttpClient): PlanningsApi {
  const apiRequest = client.request.bind(client);
  return {
    plannings: () => apiRequest(planningsSchema, '/plannings'),
    planning: (id: string) => apiRequest(planningDetailSchema, '/plannings/' + id),
    createPlanning: (input: {
      name: string;
      year: number;
      sourceId?: string;
      sourceVersion?: number;
    }) => apiRequest(planningSchema, '/plannings', { method: 'POST', body: JSON.stringify(input) }),
    changePlanning: (id: string, input: z.infer<typeof changePlanningSchema>) =>
      apiRequest(planningSchema, '/plannings/' + id, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
  };
}
