import { timetableReportSchema } from '@classorganizer/contracts';
import type { HttpClient } from '../../../shared/application/ports/http-client.ts';
import type { TimetableReportsApi } from '../application/timetable-reports-api.ts';

export function createTimetableReportsApi(client: HttpClient): TimetableReportsApi {
  return {
    report(planningId, query) {
      const params = new URLSearchParams({
        revisionId: query.revisionId,
        perspective: query.perspective,
      });
      if (query.entityId) params.set('entityId', query.entityId);
      return client.request(
        timetableReportSchema,
        '/plannings/' + encodeURIComponent(planningId) + '/report?' + params,
      );
    },
  };
}
