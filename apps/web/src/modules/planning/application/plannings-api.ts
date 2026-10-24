import type { z } from 'zod';
import type {
  changePlanningSchema,
  PlanningDto,
  PlanningDetailDto,
  RevisionComparisonDto,
} from '@classorganizer/contracts';

export interface PlanningsApi {
  preserveRevision(
    id: string,
    revisionId: string,
    version: number,
  ): Promise<{ id: string; version: number; revisionId: string }>;
  plannings(): Promise<PlanningDto[]>;
  planning(id: string): Promise<PlanningDetailDto>;
  createPlanning(input: {
    name: string;
    year: number;
    sourceId?: string;
    sourceVersion?: number;
  }): Promise<PlanningDto>;
  changePlanning(id: string, input: z.infer<typeof changePlanningSchema>): Promise<PlanningDto>;
  renameRevision(
    id: string,
    revisionId: string,
    input: { version: number; name: string },
  ): Promise<{ id: string; version: number }>;
  restoreRevision(
    id: string,
    revisionId: string,
    version: number,
  ): Promise<{ id: string; version: number; revisionId: string }>;
  compareRevisions(
    id: string,
    fromRevisionId: string,
    toRevisionId: string,
  ): Promise<RevisionComparisonDto>;
}
