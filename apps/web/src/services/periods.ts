import { minutesFromTime, timeFromMinutes } from '@classorganizer/contracts';
import type { PeriodDto, PeriodInputDto } from '@classorganizer/contracts';

/** Aula em edição na tela. `key` identifica a linha; `id` existe só para aulas já gravadas. */
export interface PeriodDraft {
  key: string;
  id?: string;
  start: string;
  end: string;
}

let keySequence = 0;
const nextKey = () => `period-${++keySequence}`;

export function draftsFrom(periods: readonly PeriodDto[]): PeriodDraft[] {
  return periods.map((p) => ({ key: nextKey(), id: p.id, start: p.start, end: p.end }));
}

/**
 * Próxima aula sugerida: começa quando a última termina e tem a mesma duração.
 * Sem uma última aula completa, a linha nova vem em branco.
 */
export function nextPeriodDraft(drafts: readonly PeriodDraft[]): PeriodDraft {
  const last = drafts.at(-1);
  if (!last?.start || !last.end) {
    return { key: nextKey(), start: '', end: '' };
  }
  const duration = minutesFromTime(last.end) - minutesFromTime(last.start);
  const end = minutesFromTime(last.end) + duration;
  if (duration <= 0 || end > 23 * 60 + 59) {
    return { key: nextKey(), start: last.end, end: '' };
  }
  return { key: nextKey(), start: last.end, end: timeFromMinutes(end) };
}

/** Converte as linhas para a API, ou devolve a mensagem do que falta preencher. */
export function periodInputs(drafts: readonly PeriodDraft[]): PeriodInputDto[] | string {
  if (drafts.length === 0) {
    return 'Informe pelo menos uma aula do turno.';
  }
  if (drafts.some((d) => !d.start || !d.end)) {
    return 'Informe o início e o fim de todas as aulas.';
  }
  return drafts.map((d) =>
    d.id ? { id: d.id, start: d.start, end: d.end } : { start: d.start, end: d.end },
  );
}

/** Minutos livres entre o fim de uma aula e o início da seguinte, quando há intervalo. */
export function gapMinutes(previous: { end: string }, next: { start: string }): number {
  if (!previous.end || !next.start) {
    return 0;
  }
  return Math.max(0, minutesFromTime(next.start) - minutesFromTime(previous.end));
}

export function describeGap(minutes: number): string {
  return `Intervalo de ${minutes} min`;
}

export const ordinal = (index: number) => `${index + 1}ª`;
