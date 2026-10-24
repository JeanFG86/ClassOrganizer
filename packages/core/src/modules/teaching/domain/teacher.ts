import type { EntityStatus } from '../../../shared/archiving.ts';
import { DomainError, NotFoundError } from '../../../shared/domain-error.ts';
import { cleanName } from '../../../shared/names.ts';
import { isWeekday, type Weekday } from '../../../shared/weekdays.ts';

export const TEACHER_NAME_MAX_LENGTH = 120;
/** Limite aceito para a carga máxima informada, em aulas por semana. */
export const MAX_WEEKLY_LESSONS_LIMIT = 60;
/** Limite aceito para a hora-atividade informada, em aulas por semana. */
export const MAX_PLANNING_PERIODS = 40;

/** Horário (dia da semana + aula de um turno) em que o professor não pode dar aula. */
export interface UnavailableSlot {
  readonly weekday: Weekday;
  readonly periodId: string;
}

export interface Teacher {
  readonly id: string;
  readonly name: string;
  /** Disciplinas que o professor está habilitado a lecionar, sem repetições. */
  readonly subjectIds: readonly string[];
  /** Máximo de aulas atribuídas por semana; `null` quando não há limite informado. */
  readonly maxWeeklyLessons: number | null;
  /**
   * Hora-atividade: quantas aulas por semana ficam reservadas para planejamento, sem
   * turma. Entram na grade do professor, não na das turmas.
   */
  readonly planningPeriods: number;
  /** Horários indisponíveis, ordenados por dia; nos demais o professor está disponível. */
  readonly unavailable: readonly UnavailableSlot[];
  readonly createdAt: Date;
  readonly archivedAt: Date | null;
  /** Versão para controle otimista de concorrência; começa em 1. */
  readonly version: number;
}

export class InvalidTeacherNameError extends DomainError {
  readonly code = 'teacher.invalid_name';
  readonly kind = 'validation';
}

export class InvalidWorkloadError extends DomainError {
  readonly code = 'teacher.invalid_workload';
  readonly kind = 'validation';
}

export class InvalidAvailabilityError extends DomainError {
  readonly code = 'teacher.invalid_availability';
  readonly kind = 'validation';

  constructor() {
    super('Um dos horários marcados não existe mais. Recarregue a página e tente novamente.');
  }
}

export class UnknownSubjectError extends DomainError {
  readonly code = 'teacher.unknown_subject';
  readonly kind = 'validation';

  constructor() {
    super('Uma ou mais disciplinas selecionadas não existem mais. Atualize a página.');
  }
}

export class ArchivedSubjectError extends DomainError {
  readonly code = 'teacher.archived_subject';
  readonly kind = 'validation';

  constructor() {
    super('Não é possível habilitar o professor em uma disciplina arquivada.');
  }
}

export class TeacherNotFoundError extends NotFoundError {
  constructor() {
    super('teacher.not_found', 'Professor não encontrado.');
  }
}

export class QualificationInUseError extends DomainError {
  readonly code = 'teacher.qualification_in_use';
  readonly kind = 'conflict';

  constructor() {
    super(
      'Não é possível remover a habilitação: o professor tem aulas atribuídas nessa disciplina. ' +
        'Transfira ou remova as atribuições antes.',
    );
  }
}

export class TeacherHasAssignmentsError extends DomainError {
  readonly code = 'teacher.has_assignments';
  readonly kind = 'conflict';

  constructor() {
    super(
      'Não é possível arquivar: o professor tem aulas atribuídas. ' +
        'Transfira ou remova as atribuições antes.',
    );
  }
}

export type SubjectStatus = EntityStatus;

/**
 * Regras das habilitações: toda disciplina precisa existir; uma disciplina arquivada só
 * pode permanecer se o professor já era habilitado nela (não pode ser acrescentada).
 */
export function assertQualificationsAllowed(
  requested: readonly string[],
  previous: readonly string[],
  statuses: ReadonlyMap<string, SubjectStatus>,
): void {
  for (const subjectId of requested) {
    const status = statuses.get(subjectId);
    if (status === undefined) {
      throw new UnknownSubjectError();
    }
    if (status === 'archived' && !previous.includes(subjectId)) {
      throw new ArchivedSubjectError();
    }
  }
}

function validData(input: { name: string; subjectIds: readonly string[] }) {
  const name = cleanName(input.name);

  if (name.length === 0) {
    throw new InvalidTeacherNameError('Informe o nome do professor.');
  }
  if (name.length > TEACHER_NAME_MAX_LENGTH) {
    throw new InvalidTeacherNameError(
      `O nome do professor deve ter no máximo ${TEACHER_NAME_MAX_LENGTH} caracteres.`,
    );
  }
  return { name, subjectIds: [...new Set(input.subjectIds)] };
}

/** Carga máxima e hora-atividade informadas pela secretaria. */
export interface WorkloadInput {
  readonly maxWeeklyLessons?: number | null | undefined;
  readonly planningPeriods?: number | undefined;
}

function validWorkload(
  input: WorkloadInput,
  current: Pick<Teacher, 'maxWeeklyLessons' | 'planningPeriods'>,
): Pick<Teacher, 'maxWeeklyLessons' | 'planningPeriods'> {
  const maxWeeklyLessons =
    input.maxWeeklyLessons === undefined ? current.maxWeeklyLessons : input.maxWeeklyLessons;
  const planningPeriods = input.planningPeriods ?? current.planningPeriods;

  if (
    maxWeeklyLessons !== null &&
    (!Number.isInteger(maxWeeklyLessons) ||
      maxWeeklyLessons < 1 ||
      maxWeeklyLessons > MAX_WEEKLY_LESSONS_LIMIT)
  ) {
    throw new InvalidWorkloadError(
      `A carga máxima deve ser um número inteiro de 1 a ${MAX_WEEKLY_LESSONS_LIMIT} aulas por semana.`,
    );
  }
  if (
    !Number.isInteger(planningPeriods) ||
    planningPeriods < 0 ||
    planningPeriods > MAX_PLANNING_PERIODS
  ) {
    throw new InvalidWorkloadError(
      `A hora-atividade deve ser um número inteiro de 0 a ${MAX_PLANNING_PERIODS} por semana.`,
    );
  }
  return { maxWeeklyLessons, planningPeriods };
}

/**
 * Cria o professor. Nomes repetidos são permitidos (duas pessoas podem ter o mesmo
 * nome); a regra pode mudar após o levantamento da E0.
 */
function createTeacherState(
  input: {
    id: string;
    name: string;
    subjectIds: readonly string[];
    createdAt: Date;
  } & WorkloadInput,
): Teacher {
  return {
    id: input.id,
    ...validData(input),
    ...validWorkload(input, { maxWeeklyLessons: null, planningPeriods: 0 }),
    unavailable: [],
    createdAt: input.createdAt,
    archivedAt: null,
    version: 1,
  };
}

/** Campos de carga omitidos mantêm o valor atual. */
function changeTeacherState(
  teacher: Teacher,
  input: { name: string; subjectIds: readonly string[] } & WorkloadInput,
): Teacher {
  return { ...teacher, ...validData(input), ...validWorkload(input, teacher) };
}

/**
 * Substitui os horários indisponíveis. Cada aula precisa existir (`knownPeriodIds`);
 * repetições são ignoradas.
 */
function setUnavailabilityState(
  teacher: Teacher,
  slots: readonly { weekday: number; periodId: string }[],
  knownPeriodIds: ReadonlySet<string>,
): Teacher {
  const unique = new Map<string, UnavailableSlot>();
  for (const { weekday, periodId } of slots) {
    if (!isWeekday(weekday) || !knownPeriodIds.has(periodId)) {
      throw new InvalidAvailabilityError();
    }
    unique.set(`${weekday}|${periodId}`, { weekday, periodId });
  }
  const unavailable = [...unique.values()].toSorted(
    (a, b) => a.weekday - b.weekday || (a.periodId < b.periodId ? -1 : 1),
  );
  return { ...teacher, unavailable };
}

function archiveTeacherState(teacher: Teacher, at: Date): Teacher {
  return teacher.archivedAt ? teacher : { ...teacher, archivedAt: at };
}

function restoreTeacherState(teacher: Teacher): Teacher {
  return { ...teacher, archivedAt: null };
}

/** Transições de negócio; fotografias são cópias independentes do estado. */
export class TeacherEntity {
  readonly #state: Teacher;
  private constructor(state: Teacher) {
    this.#state = structuredClone(state);
  }
  static reconstitute(state: Teacher): TeacherEntity {
    return new TeacherEntity(state);
  }
  snapshot(): Teacher {
    return structuredClone(this.#state);
  }
  static create(
    input: {
      id: string;
      name: string;
      subjectIds: readonly string[];
      createdAt: Date;
    } & WorkloadInput,
  ): TeacherEntity {
    return new TeacherEntity(createTeacherState(input));
  }
  change(input: { name: string; subjectIds: readonly string[] } & WorkloadInput): TeacherEntity {
    return new TeacherEntity(changeTeacherState(this.#state, input));
  }
  setUnavailability(
    slots: readonly { weekday: number; periodId: string }[],
    knownPeriodIds: ReadonlySet<string>,
  ): TeacherEntity {
    return new TeacherEntity(setUnavailabilityState(this.#state, slots, knownPeriodIds));
  }
  archive(at: Date): TeacherEntity {
    return new TeacherEntity(archiveTeacherState(this.#state, at));
  }
  restore(): TeacherEntity {
    return new TeacherEntity(restoreTeacherState(this.#state));
  }
}
