import type { InjectionKey } from 'vue';
import type { TimetableReportsApi } from '../application/timetable-reports-api.ts';

export const timetableReportsApiKey: InjectionKey<TimetableReportsApi> =
  Symbol('timetableReportsApi');
