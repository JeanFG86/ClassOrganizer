import { z } from 'zod';
import { versionSchema } from './common.ts';

/** Aulas por semana; o servidor valida o intervalo permitido (1 a 40). */
const weeklyLessonsSchema = z.number();

export const createAssignmentRequestSchema = z.object({
  classGroupId: z.string(),
  subjectId: z.string(),
  teacherId: z.string(),
  weeklyLessons: weeklyLessonsSchema,
});

export type CreateAssignmentRequest = z.infer<typeof createAssignmentRequestSchema>;

/** Turma e disciplina definem a atribuição; mudam apenas professor e carga. */
export const updateAssignmentRequestSchema = z.object({
  teacherId: z.string(),
  weeklyLessons: weeklyLessonsSchema,
  version: versionSchema,
});

export type UpdateAssignmentRequest = z.infer<typeof updateAssignmentRequestSchema>;

/** `DELETE /assignments/:id?version=N`: a versão vai na query string. */
export const removeAssignmentQuerySchema = z.object({
  version: z.coerce.number().pipe(versionSchema),
});

export const assignmentSchema = z.object({
  id: z.string(),
  classGroupId: z.string(),
  subjectId: z.string(),
  teacherId: z.string(),
  weeklyLessons: z.number().int(),
  createdAt: z.iso.datetime(),
  version: versionSchema,
});

export type AssignmentDto = z.infer<typeof assignmentSchema>;

export const assignmentListSchema = z.object({
  items: z.array(assignmentSchema),
});

export type AssignmentListDto = z.infer<typeof assignmentListSchema>;
