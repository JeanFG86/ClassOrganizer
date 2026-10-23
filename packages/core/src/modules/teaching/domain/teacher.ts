import type { EntityStatus } from '../../../shared/archiving.ts';
import { DomainError, NotFoundError } from '../../../shared/domain-error.ts';
import { cleanName } from '../../../shared/names.ts';

export const TEACHER_NAME_MAX_LENGTH = 120;

export interface Teacher {
  readonly id: string;
  readonly name: string;
  /** Disciplinas que o professor está habilitado a lecionar, sem repetições. */
  readonly subjectIds: readonly string[];
  readonly createdAt: Date;
  readonly archivedAt: Date | null;
  /** Versão para controle otimista de concorrência; começa em 1. */
  readonly version: number;
}

export class InvalidTeacherNameError extends DomainError {
  readonly code = 'teacher.invalid_name';
  readonly kind = 'validation';
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

/**
 * Cria o professor. Nomes repetidos são permitidos (duas pessoas podem ter o mesmo
 * nome); a regra pode mudar após o levantamento da E0.
 */
export function createTeacher(input: {
  id: string;
  name: string;
  subjectIds: readonly string[];
  createdAt: Date;
}): Teacher {
  return {
    id: input.id,
    ...validData(input),
    createdAt: input.createdAt,
    archivedAt: null,
    version: 1,
  };
}

export function changeTeacher(
  teacher: Teacher,
  input: { name: string; subjectIds: readonly string[] },
): Teacher {
  return { ...teacher, ...validData(input) };
}

export function archiveTeacher(teacher: Teacher, at: Date): Teacher {
  return teacher.archivedAt ? teacher : { ...teacher, archivedAt: at };
}

export function restoreTeacher(teacher: Teacher): Teacher {
  return { ...teacher, archivedAt: null };
}
