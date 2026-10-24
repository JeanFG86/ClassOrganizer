import { z } from 'zod';
import { subjectSchema } from './subjects.ts';
import { teacherSchema } from './teachers.ts';
import { classGroupSchema } from './class-groups.ts';
import { assignmentSchema } from './assignments.ts';
import { shiftSchema } from './shifts.ts';
import { resourceSchema } from './resources.ts';
export const roleSchema = z.enum(['admin', 'editor', 'viewer']);
export const credentialsSchema = z.object({
  username: z.string().min(1).max(40),
  password: z.string().min(1).max(128),
});
export const userAccountSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  role: roleSchema,
  disabled: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});
export const sessionSchema = z.object({ user: userAccountSchema, expiresAt: z.iso.datetime() });
export const createUserSchema = credentialsSchema.extend({ role: roleSchema });
export const changeUserSchema = z.object({
  version: z.number().int().positive(),
  role: roleSchema,
  disabled: z.boolean(),
  password: z.string().min(15).max(128).optional(),
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  password: z.string().min(15).max(128),
});
export const usersSchema = z.array(userAccountSchema);
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
  planningId: z.uuid(),
  number: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  createdBy: z.uuid(),
  snapshot: catalogSnapshotSchema,
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
export const auditEventSchema = z.object({
  id: z.uuid(),
  actorId: z.uuid(),
  actor: z.object({ username: z.string() }),
  action: z.string(),
  entityId: z.uuid().nullable(),
  occurredAt: z.iso.datetime(),
});
export const auditsSchema = z.array(auditEventSchema);
export type Session = z.infer<typeof sessionSchema>;
export type UserAccountDto = z.infer<typeof userAccountSchema>;
export type PlanningDto = z.infer<typeof planningSchema>;
export type PlanningDetailDto = z.infer<typeof planningDetailSchema>;
export type RevisionDto = z.infer<typeof revisionSchema>;
