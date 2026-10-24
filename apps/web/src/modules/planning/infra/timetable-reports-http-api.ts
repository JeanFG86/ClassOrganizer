import { timetableReportSchema, XLSX_MEDIA_TYPE } from '@classorganizer/contracts';
import type {
  HttpClient,
  FileDownloadClient,
} from '../../../shared/application/ports/http-client.ts';
import type {
  TimetableReportsApi,
  TimetableWorkbooksApi,
} from '../application/timetable-reports-api.ts';

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
export function createTimetableWorkbooksApi(client: FileDownloadClient): TimetableWorkbooksApi {
  return {
    download: (id, revisionId, version) =>
      client.download(
        '/plannings/' +
          encodeURIComponent(id) +
          '/workbook?' +
          new URLSearchParams({ revisionId, version: String(version) }),
        XLSX_MEDIA_TYPE,
      ),
  };
}
