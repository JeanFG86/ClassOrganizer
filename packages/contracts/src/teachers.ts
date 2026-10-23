import { z } from 'zod';
import { versionSchema } from './common.ts';

export const registerTeacherRequestSchema = z.object({
  name: z.string(),
  subjectIds: z.array(z.string()).max(100),
});

export type RegisterTeacherRequest = z.infer<typeof registerTeacherRequestSchema>;

export const updateTeacherRequestSchema = registerTeacherRequestSchema.extend({
  version: versionSchema,
});

export type UpdateTeacherRequest = z.infer<typeof updateTeacherRequestSchema>;

export const teacherSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Ids das disciplinas habilitadas; os nomes vêm de `GET /subjects`. */
  subjectIds: z.array(z.string()),
  createdAt: z.iso.datetime(),
  /** Preenchido quando o professor está arquivado. */
  archivedAt: z.iso.datetime().nullable(),
  version: versionSchema,
});

export type TeacherDto = z.infer<typeof teacherSchema>;

/** Inclui os arquivados; o cliente decide como exibi-los. */
export const teacherListSchema = z.object({
  items: z.array(teacherSchema),
});

export type TeacherListDto = z.infer<typeof teacherListSchema>;
