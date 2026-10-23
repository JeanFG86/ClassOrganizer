import { DomainError, NotFoundError } from '../../../shared/domain-error.ts';
import { cleanName, compareNames, normalizeName } from '../../../shared/names.ts';
import type { IdGenerator } from '../../../shared/ports.ts';
import { formatTimeOfDay, isMinuteOfDay } from '../../../shared/time-of-day.ts';

export const SHIFT_NAME_MAX_LENGTH = 40;
export const MAX_PERIODS_PER_SHIFT = 12;

/** Aula do turno: um horário do dia, em minutos desde a meia-noite. */
export interface Period {
  readonly id: string;
  readonly startMinute: number;
  readonly endMinute: number;
}

/**
 * Turno (ex.: "Manhã") com a sequência de aulas do dia, ordenada pelo início.
 * Os intervalos são as lacunas entre uma aula e a seguinte.
 */
export interface Shift {
  readonly id: string;
  readonly name: string;
  /** Chave usada para impedir duplicidade ignorando maiúsculas, acentos e espaços extras. */
  readonly normalizedName: string;
  readonly periods: readonly Period[];
  readonly createdAt: Date;
  readonly archivedAt: Date | null;
  readonly version: number;
}

/** Aula informada pela secretaria; sem `id` quando é uma aula nova. */
export interface PeriodInput {
  readonly id?: string | undefined;
  readonly startMinute: number;
  readonly endMinute: number;
}

export class InvalidShiftNameError extends DomainError {
  readonly code = 'shift.invalid_name';
  readonly kind = 'validation';
}

export class ShiftNameAlreadyInUseError extends DomainError {
  readonly code = 'shift.name_in_use';
  readonly kind = 'conflict';

  constructor(existing: Pick<Shift, 'name' | 'archivedAt'>) {
    super(
      existing.archivedAt
        ? `Já existe um turno arquivado chamado "${existing.name}". Restaure-o na lista de arquivados.`
        : `Já existe um turno chamado "${existing.name}".`,
    );
  }
}

export class InvalidPeriodsError extends DomainError {
  readonly code = 'shift.invalid_periods';
  readonly kind = 'validation';
}

export class ShiftNotFoundError extends NotFoundError {
  constructor() {
    super('shift.not_found', 'Turno não encontrado.');
  }
}

function classGroupList(names: readonly string[]): string {
  return names.toSorted(compareNames).join(', ');
}

/** Uma aula removida do turno ainda está marcada em alguma turma. */
export class PeriodInUseError extends DomainError {
  readonly code = 'shift.period_in_use';
  readonly kind = 'conflict';

  constructor(classGroupNames: readonly string[] = []) {
    super(
      classGroupNames.length > 0
        ? `A aula removida está marcada nas turmas ${classGroupList(classGroupNames)}. ` +
            'Desmarque-a nessas turmas antes de removê-la.'
        : 'A aula removida está marcada em alguma turma. Desmarque-a nas turmas antes de removê-la.',
    );
  }
}

/** O turno ainda tem turmas ativas. */
export class ShiftInUseError extends DomainError {
  readonly code = 'shift.in_use';
  readonly kind = 'conflict';

  constructor(classGroupNames: readonly string[]) {
    super(
      `O turno tem as turmas ${classGroupList(classGroupNames)}. ` +
        'Tire essas turmas do turno antes de arquivá-lo.',
    );
  }
}

export function periodRange(period: Pick<Period, 'startMinute' | 'endMinute'>): string {
  return `${formatTimeOfDay(period.startMinute)}–${formatTimeOfDay(period.endMinute)}`;
}

function validName(raw: string): Pick<Shift, 'name' | 'normalizedName'> {
  const name = cleanName(raw);
  if (name.length === 0) {
    throw new InvalidShiftNameError('Informe o nome do turno.');
  }
  if (name.length > SHIFT_NAME_MAX_LENGTH) {
    throw new InvalidShiftNameError(
      `O nome do turno deve ter no máximo ${SHIFT_NAME_MAX_LENGTH} caracteres.`,
    );
  }
  return { name, normalizedName: normalizeName(name) };
}

function validPeriods(
  inputs: readonly PeriodInput[],
  idFor: (input: PeriodInput) => string,
): Period[] {
  if (inputs.length === 0) {
    throw new InvalidPeriodsError('Informe pelo menos uma aula do turno.');
  }
  if (inputs.length > MAX_PERIODS_PER_SHIFT) {
    throw new InvalidPeriodsError(`Um turno pode ter no máximo ${MAX_PERIODS_PER_SHIFT} aulas.`);
  }

  const periods = inputs
    .map((input) => {
      if (!isMinuteOfDay(input.startMinute) || !isMinuteOfDay(input.endMinute)) {
        throw new InvalidPeriodsError('Informe o início e o fim de todas as aulas.');
      }
      if (input.endMinute <= input.startMinute) {
        throw new InvalidPeriodsError(
          `A aula que começa às ${formatTimeOfDay(input.startMinute)} precisa terminar depois ` +
            `de começar (fim informado: ${formatTimeOfDay(input.endMinute)}).`,
        );
      }
      return { id: idFor(input), startMinute: input.startMinute, endMinute: input.endMinute };
    })
    .toSorted((a, b) => a.startMinute - b.startMinute);

  let previous: Period | undefined;
  for (const [index, period] of periods.entries()) {
    if (previous && period.startMinute < previous.endMinute) {
      throw new InvalidPeriodsError(
        `A ${index + 1}ª aula (${periodRange(period)}) começa antes do fim da ` +
          `${index}ª (${periodRange(previous)}).`,
      );
    }
    previous = period;
  }
  return periods;
}

export function createShift(
  input: { id: string; name: string; periods: readonly PeriodInput[]; createdAt: Date },
  ids: IdGenerator,
): Shift {
  return {
    id: input.id,
    ...validName(input.name),
    periods: validPeriods(input.periods, () => ids.next()),
    createdAt: input.createdAt,
    archivedAt: null,
    version: 1,
  };
}

/**
 * Renomeia e redefine as aulas. Aulas informadas com `id` mantêm a identidade (e as
 * turmas que as usam); aulas sem `id` são novas; as ausentes são removidas.
 */
export function changeShift(
  shift: Shift,
  input: { name: string; periods: readonly PeriodInput[] },
  ids: IdGenerator,
): Shift {
  const known = new Set(shift.periods.map((p) => p.id));
  const seen = new Set<string>();
  const periods = validPeriods(input.periods, (period) => {
    if (period.id === undefined) {
      return ids.next();
    }
    if (!known.has(period.id) || seen.has(period.id)) {
      throw new InvalidPeriodsError(
        'A lista de aulas está desatualizada. Recarregue a página e tente novamente.',
      );
    }
    seen.add(period.id);
    return period.id;
  });
  return { ...shift, ...validName(input.name), periods };
}

/** Aulas que existiam em `before` e não existem em `after`. */
export function removedPeriodIds(before: Shift, after: Shift): Set<string> {
  const kept = new Set(after.periods.map((p) => p.id));
  return new Set(before.periods.filter((p) => !kept.has(p.id)).map((p) => p.id));
}
