import { z } from 'zod';
import { versionSchema } from '../../shared/common.ts';

/** 1 = segunda … 5 = sexta. */
export const weekdaySchema = z.number().int().min(1).max(5);

export const registerTeacherRequestSchema = z.object({
  name: z.string(),
  subjectIds: z.array(z.string()).max(100),
  /** Máximo de aulas atribuídas por semana; `null` sem limite. Omitido: sem limite (cadastro) ou inalterado (edição). */
  maxWeeklyLessons: z.number().nullable().optional(),
  /** Hora-atividade por semana. Omitido: 0 (cadastro) ou inalterado (edição). */
  planningPeriods: z.number().optional(),
});

export type RegisterTeacherRequest = z.infer<typeof registerTeacherRequestSchema>;

export const updateTeacherRequestSchema = registerTeacherRequestSchema.extend({
  version: versionSchema,
});

export type UpdateTeacherRequest = z.infer<typeof updateTeacherRequestSchema>;

export const unavailableSlotSchema = z.object({
  weekday: weekdaySchema,
  periodId: z.string(),
});

export type UnavailableSlotDto = z.infer<typeof unavailableSlotSchema>;

/** Substitui todos os horários em que o professor não pode dar aula. */
export const changeTeacherAvailabilityRequestSchema = z.object({
  unavailable: z.array(unavailableSlotSchema.extend({ periodId: z.uuid() })).max(500),
  version: versionSchema,
});

export type ChangeTeacherAvailabilityRequest = z.infer<
  typeof changeTeacherAvailabilityRequestSchema
>;

export const teacherSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Ids das disciplinas habilitadas; os nomes vêm de `GET /subjects`. */
  subjectIds: z.array(z.string()),
  maxWeeklyLessons: z.number().nullable(),
  planningPeriods: z.number(),
  /** Horários indisponíveis; nos demais o professor está disponível. */
  unavailable: z.array(unavailableSlotSchema),
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
