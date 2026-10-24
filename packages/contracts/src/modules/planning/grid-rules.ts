import { z } from 'zod';

const dailyRule = {
  maxPerDay: z.union([z.literal(1), z.literal(2)]),
  consecutive: z.boolean(),
};
export const gridRulesSchema = z.object({
  formatVersion: z.literal(1),
  planningPeriods: z.enum(['any_shift', 'teaching_shifts']),
  daily: z.object(dailyRule),
  dailyExceptions: z
    .array(z.object({ classGroupId: z.uuid(), subjectId: z.uuid(), ...dailyRule }))
    .max(2000),
});
