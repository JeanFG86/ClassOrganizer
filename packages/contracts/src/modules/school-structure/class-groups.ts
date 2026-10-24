import { z } from 'zod';
import { versionSchema } from '../../shared/common.ts';

export const registerClassGroupRequestSchema = z.object({
  name: z.string(),
});

export type RegisterClassGroupRequest = z.infer<typeof registerClassGroupRequestSchema>;

export const updateClassGroupRequestSchema = z.object({
  name: z.string(),
  version: versionSchema,
});

export type UpdateClassGroupRequest = z.infer<typeof updateClassGroupRequestSchema>;

/** Turno da turma (`null` tira a turma do turno) e as aulas desse turno que ela usa. */
export const changeClassGroupScheduleRequestSchema = z.object({
  shiftId: z.uuid().nullable(),
  periodIds: z.array(z.uuid()),
  version: versionSchema,
});

export type ChangeClassGroupScheduleRequest = z.infer<typeof changeClassGroupScheduleRequestSchema>;

export const classGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Turno da turma; `null` enquanto não foi definido. */
  shiftId: z.string().nullable(),
  /** Aulas do turno que a turma usa, na ordem do turno. */
  periodIds: z.array(z.string()),
  createdAt: z.iso.datetime(),
  /** Preenchido quando a turma está arquivada. */
  archivedAt: z.iso.datetime().nullable(),
  version: versionSchema,
});

export type ClassGroupDto = z.infer<typeof classGroupSchema>;

/** Inclui as arquivadas; o cliente decide como exibi-las. */
export const classGroupListSchema = z.object({
  items: z.array(classGroupSchema),
});

export type ClassGroupListDto = z.infer<typeof classGroupListSchema>;
