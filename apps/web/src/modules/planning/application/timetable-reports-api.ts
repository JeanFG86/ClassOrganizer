import type { TimetableReportDto, TimetableReportQuery } from '@classorganizer/contracts';

export interface TimetableReportsApi {
  report(planningId: string, query: TimetableReportQuery): Promise<TimetableReportDto>;
}
export interface TimetableWorkbooksApi {
  download(planningId: string, revisionId: string, version: number): Promise<Blob>;
}
