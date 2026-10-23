import { z } from 'zod';

export const registerTeacherRequestSchema = z.object({
  name: z.string(),
  subjectIds: z.array(z.string()).max(100),
});

export type RegisterTeacherRequest = z.infer<typeof registerTeacherRequestSchema>;

export const teacherSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Ids das disciplinas habilitadas; os nomes vêm de `GET /subjects`. */
  subjectIds: z.array(z.string()),
  createdAt: z.iso.datetime(),
});

export type TeacherDto = z.infer<typeof teacherSchema>;

export const teacherListSchema = z.object({
  items: z.array(teacherSchema),
});

export type TeacherListDto = z.infer<typeof teacherListSchema>;
