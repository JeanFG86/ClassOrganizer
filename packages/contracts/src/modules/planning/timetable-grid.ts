import { z } from 'zod';
import { planningSchema } from './plannings.ts';
import { timetableSnapshotSchema } from '../generation/generation.ts';

const weekday = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
const version = z.number().int().positive();
export const gridSlotSchema = z.object({
  kind: z.enum(['lesson', 'planning']),
  entityId: z.uuid(),
  weekday,
  periodId: z.uuid(),
});
export const placementSchema = gridSlotSchema.extend({ pinned: z.boolean() });
export const gridOperationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('place'), slot: gridSlotSchema }),
  z.object({ type: z.literal('remove'), slot: gridSlotSchema }),
  z.object({ type: z.literal('move'), slot: gridSlotSchema, weekday, periodId: z.uuid() }),
  z.object({ type: z.literal('swap'), first: gridSlotSchema, second: gridSlotSchema }),
  z.object({ type: z.literal('pin'), slot: gridSlotSchema, pinned: z.boolean() }),
]);
const dailyRule = {
  maxPerDay: z.union([z.literal(1), z.literal(2)]),
  consecutive: z.boolean(),
};
export const gridRulesSchema = z.object({
  formatVersion: z.literal(1),
  planningPeriods: z.enum(['any_shift', 'teaching_shifts']),
  daily: z.object(dailyRule),
  dailyExceptions: z
    .array(z.object({ classGroupId: z.uuid(), subjectId: z.uuid(), ...dailyRule }))
    .max(2000),
});
export const gridCommandSchema = z.object({
  version,
  revisionId: z.uuid(),
  operation: gridOperationSchema,
});
export const gridUndoSchema = z.object({ version, revisionId: z.uuid() });
export const gridRulesChangeSchema = z.object({
  version,
  revisionId: z.uuid(),
  rules: gridRulesSchema,
});
export const gridQuerySchema = z.object({ revisionId: z.uuid().optional() });
const issue = z.object({ code: z.string(), message: z.string(), entityIds: z.array(z.string()) });
export const gridDiagnosisSchema = z.object({
  model: z.array(issue),
  problems: z.array(issue),
  pending: z.array(issue),
  alerts: z.array(issue),
  teachers: z.array(
    z.object({
      teacherId: z.string(),
      lessons: z.number().int(),
      requiredLessons: z.number().int(),
      planning: z.number().int(),
      requiredPlanning: z.number().int(),
      maxWeeklyLessons: z.number().int().nullable(),
      windows: z.number().int(),
    }),
  ),
  classGroups: z.array(
    z.object({
      classGroupId: z.string(),
      lessons: z.number().int(),
      requiredLessons: z.number().int(),
    }),
  ),
});
export const gridViewSchema = z.object({
  planning: planningSchema,
  revision: z.object({
    id: z.uuid(),
    number: z.number().int().positive(),
    sealedAt: z.iso.datetime().nullable(),
    rulesReviewed: z.boolean(),
    availabilityReviewed: z.boolean(),
  }),
  revisions: z.array(
    z.object({
      id: z.uuid(),
      number: z.number().int().positive(),
      sealedAt: z.iso.datetime().nullable(),
    }),
  ),
  editable: z.boolean(),
  rules: gridRulesSchema,
  timetable: timetableSnapshotSchema,
  shifts: z.array(z.object({ id: z.string(), name: z.string(), periodIds: z.array(z.string()) })),
  placements: z.array(placementSchema),
  diagnosis: gridDiagnosisSchema,
  history: z.array(
    z.object({
      id: z.uuid(),
      sequence: z.number().int().positive(),
      kind: z.enum(['operation', 'undo', 'import', 'generation']),
      summary: z.string(),
      actorUsername: z.string(),
      occurredAt: z.iso.datetime(),
      reverted: z.boolean(),
    }),
  ),
  undo: z.object({ changeId: z.uuid(), summary: z.string() }).nullable(),
});
export const gridEvaluationSchema = z.object({
  accepted: z.boolean(),
  summary: z.string(),
  introduced: z.array(issue),
  resolved: z.array(issue),
  diagnosis: gridDiagnosisSchema,
});
export const gridResultSchema = z.object({
  id: z.uuid(),
  version,
  summary: z.string().optional(),
});
export type GridSlotDto = z.infer<typeof gridSlotSchema>;
export type PlacementDto = z.infer<typeof placementSchema>;
export type GridOperationDto = z.infer<typeof gridOperationSchema>;
export type GridRulesDto = z.infer<typeof gridRulesSchema>;
export type GridViewDto = z.infer<typeof gridViewSchema>;
export type GridEvaluationDto = z.infer<typeof gridEvaluationSchema>;
export type GridIssueDto = z.infer<typeof issue>;
