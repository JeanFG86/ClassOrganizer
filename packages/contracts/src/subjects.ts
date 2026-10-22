import { z } from 'zod';

export const registerSubjectRequestSchema = z.object({
  name: z.string(),
});

export type RegisterSubjectRequest = z.infer<typeof registerSubjectRequestSchema>;

export const subjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.iso.datetime(),
});

export type SubjectDto = z.infer<typeof subjectSchema>;

export const subjectListSchema = z.object({
  items: z.array(subjectSchema),
});

export type SubjectListDto = z.infer<typeof subjectListSchema>;
