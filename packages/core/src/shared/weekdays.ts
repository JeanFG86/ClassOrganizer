/** Dias letivos da semana: 1 = segunda … 5 = sexta (ADR 0007). */
export const WEEKDAYS = [1, 2, 3, 4, 5] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export function isWeekday(value: number): value is Weekday {
  return (WEEKDAYS as readonly number[]).includes(value);
}
