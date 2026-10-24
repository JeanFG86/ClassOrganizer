import { z } from 'zod';
import { subjectSchema } from '../school-structure/subjects.ts';
import { teacherSchema } from '../teaching/teachers.ts';
import { classGroupSchema } from '../school-structure/class-groups.ts';
import { assignmentSchema } from '../teaching/assignments.ts';
import { shiftSchema } from '../school-structure/shifts.ts';
import { resourceSchema } from '../school-structure/resources.ts';
import { gridRulesSchema } from './grid-rules.ts';

export const planningSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  year: z.number().int(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
  copiedFromId: z.uuid().nullable(),
});

export const catalogSnapshotSchema = z.object({
  formatVersion: z.literal(1),
  catalogVersion: z.number().int().positive(),
  capturedAt: z.iso.datetime(),
  subjects: z.array(subjectSchema.passthrough()),
  teachers: z.array(teacherSchema.passthrough()),
  classGroups: z.array(classGroupSchema.passthrough()),
  shifts: z.array(
    shiftSchema
      .extend({
        periods: z.array(
          z.object({ id: z.string(), startMinute: z.number().int(), endMinute: z.number().int() }),
        ),
      })
      .passthrough(),
  ),
  assignments: z.array(assignmentSchema.passthrough()),
  /** Ausente nas fotografias anteriores aos recursos especiais (ADR 0016). */
  resources: z.array(resourceSchema.passthrough()).default([]),
});

export const revisionSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  restoredFromId: z.uuid().nullable(),
  planningId: z.uuid(),
  number: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  createdBy: z.uuid(),
  snapshot: catalogSnapshotSchema,
  gridRules: gridRulesSchema,
  rulesReviewed: z.boolean(),
  availabilityReviewed: z.boolean(),
  sealedAt: z.iso.datetime().nullable(),
});

export const planningDetailSchema = planningSchema.extend({ revisions: z.array(revisionSchema) });

export const planningsSchema = z.array(planningSchema);

export const createPlanningSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    year: z.number().int().min(2000).max(2200),
    sourceId: z.uuid().optional(),
    sourceVersion: z.number().int().positive().optional(),
  })
  .refine((value) => (value.sourceId === undefined) === (value.sourceVersion === undefined), {
    message: 'Informe o planejamento de origem e sua versão juntos.',
  });

export const changePlanningSchema = z.object({
  version: z.number().int().positive(),
  operation: z.enum(['draft', 'review', 'seal', 'archive', 'restore']),
  revisionId: z.uuid().optional(),
  rulesReviewed: z.boolean().optional(),
  availabilityReviewed: z.boolean().optional(),
});

export type PlanningDto = z.infer<typeof planningSchema>;

export type PlanningDetailDto = z.infer<typeof planningDetailSchema>;

export type RevisionDto = z.infer<typeof revisionSchema>;

export const renameRevisionSchema = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().max(100),
});
export const restoreRevisionSchema = z.object({ version: z.number().int().positive() });
export const compareRevisionsSchema = z.object({
  fromRevisionId: z.uuid(),
  toRevisionId: z.uuid(),
});
export const revisionResultSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
});
export const revisionRestoreResultSchema = revisionResultSchema.extend({ revisionId: z.uuid() });
const comparisonRevisionSchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  name: z.string().nullable(),
});
const comparisonPlacementSchema = z.object({
  label: z.string(),
  time: z.string(),
  pinned: z.boolean(),
});
export const revisionComparisonSchema = z.object({
  version: z.number().int().positive(),
  from: comparisonRevisionSchema,
  to: comparisonRevisionSchema,
  kept: z.number().int().nonnegative(),
  removed: z.array(comparisonPlacementSchema),
  added: z.array(comparisonPlacementSchema),
  rulesChanged: z.boolean(),
  catalogChanges: z.array(
    z.object({
      category: z.string(),
      label: z.string(),
      kind: z.enum(['added', 'removed', 'changed']),
    }),
  ),
});
export type RevisionComparisonDto = z.infer<typeof revisionComparisonSchema>;
