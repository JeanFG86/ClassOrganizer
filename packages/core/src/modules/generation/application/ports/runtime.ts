import type { GenerationOptions, GenerationResult } from './engine.ts';
import type { TimetableSnapshot } from '../../../timetable/domain/model.ts';

export interface GenerationExecutor {
  execute(
    snapshot: TimetableSnapshot,
    options: GenerationOptions,
    signal?: AbortSignal,
  ): Promise<GenerationResult>;
}
export interface GenerationLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}
