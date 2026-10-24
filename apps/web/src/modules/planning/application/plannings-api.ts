import type { z } from 'zod';
import type {
  changePlanningSchema,
  PlanningDto,
  PlanningDetailDto,
  RevisionChecklistDto,
  RevisionComparisonDto,
} from '@classorganizer/contracts';

/** Pedido de criação; a base e a grade só se aplicam a uma cópia (ADR 0022). */
export interface CreatePlanningInput {
  name: string;
  year: number;
  sourceId?: string;
  sourceVersion?: number;
  base?: 'source' | 'current';
  keepGrid?: boolean;
}

export interface PlanningsApi {
  preserveRevision(
    id: string,
    revisionId: string,
    version: number,
  ): Promise<{ id: string; version: number; revisionId: string }>;
  plannings(): Promise<PlanningDto[]>;
  planning(id: string): Promise<PlanningDetailDto>;
  createPlanning(input: CreatePlanningInput): Promise<PlanningDto>;
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
  revisionChecklist(id: string, revisionId: string): Promise<RevisionChecklistDto>;
  compareRevisions(
    id: string,
    fromRevisionId: string,
    toRevisionId: string,
  ): Promise<RevisionComparisonDto>;
}
