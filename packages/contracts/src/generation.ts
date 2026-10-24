import { z } from 'zod';

const id = z.string().min(1).max(200);
const day = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
const periodPlacement = { weekday: day, periodId: id };
const lesson = z.object({ assignmentId: id, ...periodPlacement });
const planning = z.object({ teacherId: id, ...periodPlacement });
const named = z.object({ id, name: z.string().min(1).max(200) });
export const timetableSnapshotSchema = z.object({
  modelVersion: z.literal(1),
  sourceRevision: z.string().min(1).max(200),
  lessonMinutes: z.number().int().nullable(),
  weekdays: z.array(day),
  periods: z.array(
    z.object({ id, shiftId: id, startMinute: z.number().int(), endMinute: z.number().int() }),
  ),
  subjects: z.array(named),
  classGroups: z.array(named.extend({ periodIds: z.array(id) })),
  teachers: z.array(
    named.extend({
      subjectIds: z.array(id),
      unavailable: z.array(z.object(periodPlacement)),
      planningPeriods: z.number().int(),
      planningPeriodIds: z.array(id),
      maxWeeklyLessons: z.number().int().nullable(),
    }),
  ),
  assignments: z.array(
    z.object({
      id,
      classGroupId: id,
      participants: z.array(z.object({ teacherId: id, subjectId: id })),
      weeklyLessons: z.number().int(),
      resourceIds: z.array(id),
    }),
  ),
  resources: z.array(named),
  subjectRules: z.array(
    z.object({
      classGroupId: id,
      subjectId: id,
      maxPerDay: z.union([z.literal(1), z.literal(2)]),
      consecutive: z.boolean(),
    }),
  ),
  fixedLessons: z.array(lesson),
  fixedPlanning: z.array(planning),
});
export const generationOptionsSchema = z.object({
  timeLimitMs: z.number().int().min(1).max(300000),
  nodeLimit: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  seed: z.number().int().min(0).max(4294967295),
  memoryLimitMb: z.number().int().min(16).max(1024),
});
export const generationRequestSchema = z.object({
  snapshot: timetableSnapshotSchema,
  options: generationOptionsSchema,
});
export type GenerationRequestDto = z.infer<typeof generationRequestSchema>;
export const timetableProposalSchema = z.object({
  lessons: z.array(lesson),
  planning: z.array(planning),
});
const issue = z.object({ code: z.string(), message: z.string(), entityIds: z.array(z.string()) });
export const generationResultSchema = z
  .object({
    status: z.enum([
      'feasible',
      'infeasible',
      'inconclusive',
      'cancelled',
      'invalid_model',
      'failed',
    ]),
    reason: z.string(),
    proposal: timetableProposalSchema.nullable(),
    diagnostics: z.array(issue),
    sourceRevision: z.string(),
    teacherIdleMinutes: z.number().nonnegative().nullable(),
    warnings: z.array(issue),
    elapsedMs: z.number().nonnegative(),
    visitedNodes: z.number().int().nonnegative(),
    backtracks: z.number().int().nonnegative(),
    restarts: z.number().int().nonnegative(),
  })
  .refine(
    (r) => (r.status === 'feasible') === (r.proposal !== null),
    'Somente um resultado viável pode conter uma grade completa.',
  );
export type GenerationResultDto = z.infer<typeof generationResultSchema>;
