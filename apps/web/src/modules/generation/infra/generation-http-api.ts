import type { GenerationApi } from '../application/generation-api.ts';

import {
  type PreferenceCriterionDto,
  generationDetailSchema,
  generationListSchema,
  generationRunSchema,
  gridResultSchema,
} from '@classorganizer/contracts';
import { type HttpClient } from '../../../shared/application/ports/http-client.ts';
import type { GridRef } from '../../planning/application/grid-api.ts';

export function createGenerationApi(client: HttpClient): GenerationApi {
  const apiRequest = client.request.bind(client);
  const path = (planningId: string) =>
    '/plannings/' + encodeURIComponent(planningId) + '/generations';
  const run = (planningId: string, runId: string) =>
    path(planningId) + '/' + encodeURIComponent(runId);
  const command = (ref: GridRef) =>
    JSON.stringify({ version: ref.version, revisionId: ref.revisionId });
  return {
    list: (planningId: string) => apiRequest(generationListSchema, path(planningId)),
    detail: (planningId: string, runId: string) =>
      apiRequest(generationDetailSchema, run(planningId, runId)),
    request: (ref: GridRef, preferences: readonly PreferenceCriterionDto[]) =>
      apiRequest(generationRunSchema, path(ref.planningId), {
        method: 'POST',
        body: JSON.stringify({ version: ref.version, revisionId: ref.revisionId, preferences }),
      }),
    cancel: (planningId: string, runId: string) =>
      apiRequest(generationRunSchema, run(planningId, runId) + '/cancel', { method: 'POST' }),
    apply: (ref: GridRef, runId: string) =>
      apiRequest(gridResultSchema, run(ref.planningId, runId) + '/apply', {
        method: 'POST',
        body: command(ref),
      }),
  };
}
