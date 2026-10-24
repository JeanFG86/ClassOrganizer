import { z } from 'zod';
import { subjectSchema } from '../school-structure/subjects.ts';
import { teacherSchema } from '../teaching/teachers.ts';
import { classGroupSchema } from '../school-structure/class-groups.ts';
import { assignmentSchema } from '../teaching/assignments.ts';
import { shiftSchema } from '../school-structure/shifts.ts';
import { resourceSchema } from '../school-structure/resources.ts';
import { gridRulesSchema } from './grid-rules.ts';

/** Itens do checklist de conferência, na ordem da revisão (ADR 0022). */
export const REVIEW_ITEMS = [
  'structure',
  'teachers',
  'assignments',
  'availability',
  'rules',
] as const;
export const reviewItemSchema = z.enum(REVIEW_ITEMS);
export type ReviewItemDto = z.infer<typeof reviewItemSchema>;

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
  sourceRevisionId: z.uuid().nullable(),
  planningId: z.uuid(),
  number: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  createdBy: z.uuid(),
  snapshot: catalogSnapshotSchema,
  gridRules: gridRulesSchema,
  reviewedItems: z.array(reviewItemSchema),
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
    /** `source`: fotografia da origem; `current`: cadastros atuais (ADR 0022). */
    base: z.enum(['source', 'current']).optional(),
    keepGrid: z.boolean().optional(),
  })
  .refine((value) => (value.sourceId === undefined) === (value.sourceVersion === undefined), {
    message: 'Informe o planejamento de origem e sua versão juntos.',
  })
  .refine(
    (value) =>
      value.sourceId !== undefined || (value.base === undefined && value.keepGrid === undefined),
    { message: 'A base e a grade da origem só se aplicam a uma cópia.' },
  );

export const changePlanningSchema = z.object({
  version: z.number().int().positive(),
  operation: z.enum(['draft', 'review', 'seal', 'archive', 'restore']),
  revisionId: z.uuid().optional(),
  reviewedItems: z.array(reviewItemSchema).max(REVIEW_ITEMS.length).optional(),
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

export const revisionChecklistSchema = z.object({
  version: z.number().int().positive(),
  revisionId: z.uuid(),
  reference: z.object({ id: z.uuid(), label: z.string() }).nullable(),
  complete: z.boolean(),
  items: z.array(
    z.object({
      item: reviewItemSchema,
      title: z.string(),
      description: z.string(),
      reviewed: z.boolean(),
      attention: z.array(z.string()),
      changes: z.array(
        z.object({
          kind: z.enum(['added', 'removed', 'changed']),
          label: z.string(),
          fields: z.array(z.string()),
        }),
      ),
    }),
  ),
});
export type RevisionChecklistDto = z.infer<typeof revisionChecklistSchema>;
