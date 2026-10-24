import { z } from 'zod';
import { versionSchema } from '../../shared/common.ts';

/** Horário do dia no formato "HH:MM" (24 horas). */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM.');

/** "07:30" → 450 (minutos desde a meia-noite). */
export function minutesFromTime(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** 450 → "07:30". */
export function timeFromMinutes(minute: number): string {
  const hours = String(Math.floor(minute / 60)).padStart(2, '0');
  return `${hours}:${String(minute % 60).padStart(2, '0')}`;
}

export const periodSchema = z.object({
  id: z.string(),
  start: timeOfDaySchema,
  end: timeOfDaySchema,
});

export type PeriodDto = z.infer<typeof periodSchema>;

export const shiftSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Aulas do dia, ordenadas pelo início; os intervalos são as lacunas entre elas. */
  periods: z.array(periodSchema),
  createdAt: z.iso.datetime(),
  /** Preenchido quando o turno está arquivado. */
  archivedAt: z.iso.datetime().nullable(),
  version: versionSchema,
});

export type ShiftDto = z.infer<typeof shiftSchema>;

/** Inclui os arquivados; o cliente decide como exibi-los. */
export const shiftListSchema = z.object({
  items: z.array(shiftSchema),
});

export type ShiftListDto = z.infer<typeof shiftListSchema>;

const periodInputSchema = z.object({
  /** Ausente para uma aula nova; presente para manter a aula (e as turmas que a usam). */
  id: z.uuid().optional(),
  start: timeOfDaySchema,
  end: timeOfDaySchema,
});

export type PeriodInputDto = z.infer<typeof periodInputSchema>;

export const registerShiftRequestSchema = z.object({
  name: z.string(),
  periods: z.array(periodInputSchema.omit({ id: true })),
});

export type RegisterShiftRequest = z.infer<typeof registerShiftRequestSchema>;

export const updateShiftRequestSchema = z.object({
  name: z.string(),
  periods: z.array(periodInputSchema),
  version: versionSchema,
});

export type UpdateShiftRequest = z.infer<typeof updateShiftRequestSchema>;
