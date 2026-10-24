import { type GridOperationDto, type GridRulesDto } from '@classorganizer/contracts';

import type { z } from 'zod';
import type { GridViewDto, GridEvaluationDto, gridResultSchema } from '@classorganizer/contracts';
export interface GridRef {
  planningId: string;
  version: number;
  revisionId: string;
}
export interface GridApi {
  view(planningId: string, revisionId?: string): Promise<GridViewDto>;
  preview(ref: GridRef, operation: GridOperationDto): Promise<GridEvaluationDto>;
  apply(ref: GridRef, operation: GridOperationDto): Promise<z.infer<typeof gridResultSchema>>;
  undo(ref: GridRef): Promise<z.infer<typeof gridResultSchema>>;
  changeRules(ref: GridRef, rules: GridRulesDto): Promise<z.infer<typeof gridResultSchema>>;
}
