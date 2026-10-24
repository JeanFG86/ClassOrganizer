import type { InjectionKey } from 'vue';
import {
  generationDetailSchema,
  generationListSchema,
  generationRunSchema,
  gridResultSchema,
} from '@classorganizer/contracts';
import { apiRequest } from './api-client.ts';
import type { GridRef } from './grid-api.ts';

export function createGenerationApi() {
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
    request: (ref: GridRef) =>
      apiRequest(generationRunSchema, path(ref.planningId), { method: 'POST', body: command(ref) }),
    cancel: (planningId: string, runId: string) =>
      apiRequest(generationRunSchema, run(planningId, runId) + '/cancel', { method: 'POST' }),
    apply: (ref: GridRef, runId: string) =>
      apiRequest(gridResultSchema, run(ref.planningId, runId) + '/apply', {
        method: 'POST',
        body: command(ref),
      }),
  };
}
export type GenerationApi = ReturnType<typeof createGenerationApi>;
export const generationApiKey: InjectionKey<GenerationApi> = Symbol('generationApi');
export const httpGenerationApi = createGenerationApi();
