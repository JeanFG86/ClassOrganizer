import { z } from 'zod';
export const XLSX_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const timetableWorkbookQuerySchema = z.object({
  revisionId: z.uuid(),
  version: z.coerce.number().int().positive(),
});

export const timetableReportQuerySchema = z.object({
  revisionId: z.uuid(),
  perspective: z.enum(['class', 'teacher']),
  entityId: z.uuid().optional(),
});
const item = z.object({ title: z.string(), details: z.array(z.string()), pinned: z.boolean() });
const row = z.object({
  periodId: z.string(),
  number: z.number().int().positive(),
  startMinute: z.number().int(),
  endMinute: z.number().int(),
  cells: z
    .array(
      z.object({
        weekday: z.number().int().min(1).max(5),
        unavailable: z.boolean(),
        items: z.array(item),
      }),
    )
    .length(5),
});
export const timetableReportSchema = z.object({
  planning: z.object({
    id: z.uuid(),
    name: z.string(),
    year: z.number().int(),
    version: z.number().int().positive(),
    archived: z.boolean(),
  }),
  revision: z.object({
    id: z.uuid(),
    number: z.number().int().positive(),
    name: z.string().nullable(),
    sealedAt: z.iso.datetime().nullable(),
    capturedAt: z.iso.datetime(),
    catalogVersion: z.number().int().positive(),
    historical: z.boolean(),
  }),
  generatedAt: z.iso.datetime(),
  perspective: z.enum(['class', 'teacher']),
  notices: z.array(z.string()),
  revisions: z.array(
    z.object({ id: z.uuid(), number: z.number().int().positive(), name: z.string().nullable() }),
  ),
  targets: z.array(z.object({ id: z.string(), name: z.string() })),
  sheets: z.array(
    z.object({
      targetId: z.string(),
      targetName: z.string(),
      shiftName: z.string(),
      rows: z.array(row),
    }),
  ),
});
export type TimetableReportDto = z.infer<typeof timetableReportSchema>;
export type TimetableReportQuery = z.infer<typeof timetableReportQuerySchema>;
