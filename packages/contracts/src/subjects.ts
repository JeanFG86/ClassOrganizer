import { z } from 'zod';
import { versionSchema } from './common.ts';

export const registerSubjectRequestSchema = z.object({
  name: z.string(),
});

export type RegisterSubjectRequest = z.infer<typeof registerSubjectRequestSchema>;

export const updateSubjectRequestSchema = z.object({
  name: z.string(),
  version: versionSchema,
});

export type UpdateSubjectRequest = z.infer<typeof updateSubjectRequestSchema>;

export const subjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  /** Preenchido quando a disciplina está arquivada. */
  archivedAt: z.iso.datetime().nullable(),
  version: versionSchema,
});

export type SubjectDto = z.infer<typeof subjectSchema>;

/** Inclui as arquivadas; o cliente decide como exibi-las. */
export const subjectListSchema = z.object({
  items: z.array(subjectSchema),
});

export type SubjectListDto = z.infer<typeof subjectListSchema>;
