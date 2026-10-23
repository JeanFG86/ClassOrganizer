import { DomainError } from '../../../shared/domain-error.ts';
import { cleanName } from '../../../shared/names.ts';

export const TEACHER_NAME_MAX_LENGTH = 120;

export interface Teacher {
  readonly id: string;
  readonly name: string;
  /** Disciplinas que o professor está habilitado a lecionar, sem repetições. */
  readonly subjectIds: readonly string[];
  readonly createdAt: Date;
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
  const name = cleanName(input.name);

  if (name.length === 0) {
    throw new InvalidTeacherNameError('Informe o nome do professor.');
  }
  if (name.length > TEACHER_NAME_MAX_LENGTH) {
    throw new InvalidTeacherNameError(
      `O nome do professor deve ter no máximo ${TEACHER_NAME_MAX_LENGTH} caracteres.`,
    );
  }

  return {
    id: input.id,
    name,
    subjectIds: [...new Set(input.subjectIds)],
    createdAt: input.createdAt,
  };
}
