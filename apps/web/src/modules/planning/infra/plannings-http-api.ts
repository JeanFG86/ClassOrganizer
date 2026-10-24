import type { PlanningsApi } from '../application/plannings-api.ts';

import {
  planningsSchema,
  planningDetailSchema,
  planningSchema,
  revisionResultSchema,
  revisionRestoreResultSchema,
  revisionComparisonSchema,
} from '@classorganizer/contracts';
import type { z } from 'zod';
import type { changePlanningSchema } from '@classorganizer/contracts';

import { type HttpClient } from '../../../shared/application/ports/http-client.ts';
export function createPlanningsApi(client: HttpClient): PlanningsApi {
  const apiRequest = client.request.bind(client);
  return {
    preserveRevision: (id, revisionId, version) =>
      apiRequest(
        revisionRestoreResultSchema,
        '/plannings/' +
          encodeURIComponent(id) +
          '/revisions/' +
          encodeURIComponent(revisionId) +
          '/preserve',
        { method: 'POST', body: JSON.stringify({ version }) },
      ),
    renameRevision: (id, revisionId, input) =>
      apiRequest(
        revisionResultSchema,
        '/plannings/' +
          encodeURIComponent(id) +
          '/revisions/' +
          encodeURIComponent(revisionId) +
          '/name',
        { method: 'PUT', body: JSON.stringify(input) },
      ),
    restoreRevision: (id, revisionId, version) =>
      apiRequest(
        revisionRestoreResultSchema,
        '/plannings/' +
          encodeURIComponent(id) +
          '/revisions/' +
          encodeURIComponent(revisionId) +
          '/restore',
        { method: 'POST', body: JSON.stringify({ version }) },
      ),
    compareRevisions: (id, fromRevisionId, toRevisionId) =>
      apiRequest(
        revisionComparisonSchema,
        '/plannings/' +
          encodeURIComponent(id) +
          '/revisions/comparison?' +
          new URLSearchParams({ fromRevisionId, toRevisionId }),
      ),
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
