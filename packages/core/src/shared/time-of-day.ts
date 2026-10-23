/** Último minuto representável de um dia (23:59), em minutos desde a meia-noite. */
export const LAST_MINUTE_OF_DAY = 23 * 60 + 59;

export function isMinuteOfDay(minute: number): boolean {
  return Number.isInteger(minute) && minute >= 0 && minute <= LAST_MINUTE_OF_DAY;
}

/** Formata minutos desde a meia-noite como "HH:MM". */
export function formatTimeOfDay(minute: number): string {
  const hours = String(Math.floor(minute / 60)).padStart(2, '0');
  const minutes = String(minute % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}
