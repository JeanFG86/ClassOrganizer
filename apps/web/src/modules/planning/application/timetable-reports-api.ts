import type { TimetableReportDto, TimetableReportQuery } from '@classorganizer/contracts';

export interface TimetableReportsApi {
  report(planningId: string, query: TimetableReportQuery): Promise<TimetableReportDto>;
}
