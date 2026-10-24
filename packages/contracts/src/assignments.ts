import { z } from 'zod';
import { versionSchema } from './common.ts';

const participantSchema = z.object({ teacherId: z.string(), subjectId: z.string() });
/** O domínio valida carga, presença de participantes e professor repetido. */
const assignmentInput = {
  participants: z.array(participantSchema),
  weeklyLessons: z.number(),
  /** Recursos especiais do bloco; ausente mantém os atuais ao editar (ADR 0016). */
  resourceIds: z.array(z.string()).optional(),
};

export const createAssignmentRequestSchema = z.object({
  classGroupId: z.string(),
  ...assignmentInput,
});
export type CreateAssignmentRequest = z.infer<typeof createAssignmentRequestSchema>;

export const updateAssignmentRequestSchema = z.object({
  ...assignmentInput,
  version: versionSchema,
});
export type UpdateAssignmentRequest = z.infer<typeof updateAssignmentRequestSchema>;

export const removeAssignmentQuerySchema = z.object({
  version: z.coerce.number().pipe(versionSchema),
});

export const assignmentSchema = z.object({
  id: z.string(),
  classGroupId: z.string(),
  participants: z.array(participantSchema).min(1),
  weeklyLessons: z.number().int(),
  /** Ausente nas fotografias anteriores aos recursos especiais. */
  resourceIds: z.array(z.string()).default([]),
  createdAt: z.iso.datetime(),
  version: versionSchema,
});
export type AssignmentDto = z.infer<typeof assignmentSchema>;
export const assignmentListSchema = z.object({ items: z.array(assignmentSchema) });
export type AssignmentListDto = z.infer<typeof assignmentListSchema>;
