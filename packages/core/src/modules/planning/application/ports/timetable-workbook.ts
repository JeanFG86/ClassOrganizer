import type { TimetableExport } from '../../domain/timetable-export.ts';

export interface TimetableWorkbookWriter {
  write(data: TimetableExport): Promise<Uint8Array>;
}
