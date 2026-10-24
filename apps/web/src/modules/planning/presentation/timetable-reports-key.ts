import type { InjectionKey } from 'vue';
import type {
  TimetableReportsApi,
  TimetableWorkbooksApi,
} from '../application/timetable-reports-api.ts';

export const timetableReportsApiKey: InjectionKey<TimetableReportsApi> =
  Symbol('timetableReportsApi');
export const timetableWorkbooksApiKey: InjectionKey<TimetableWorkbooksApi> =
  Symbol('timetableWorkbooksApi');
