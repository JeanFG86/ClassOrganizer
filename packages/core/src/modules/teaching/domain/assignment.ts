import { DomainError, NotFoundError } from '../../../shared/domain-error.ts';

export const MAX_WEEKLY_LESSONS = 40;

/**
 * Atribuição de ensino: o professor responsável por uma disciplina numa turma e a
 * carga semanal exigida, em unidades de aula (plano, seções 1.2 e 4.1).
 */
export interface TeachingAssignment {
  readonly id: string;
  readonly classGroupId: string;
  readonly subjectId: string;
  readonly teacherId: string;
  readonly weeklyLessons: number;
  readonly createdAt: Date;
  readonly version: number;
}

export class InvalidWeeklyLessonsError extends DomainError {
  readonly code = 'assignment.invalid_weekly_lessons';
  readonly kind = 'validation';

  constructor() {
    super(`Informe um número inteiro de aulas por semana entre 1 e ${MAX_WEEKLY_LESSONS}.`);
  }
}

export class InvalidAssignmentReferenceError extends DomainError {
  readonly code = 'assignment.invalid_reference';
  readonly kind = 'validation';
}

export class TeacherNotQualifiedError extends DomainError {
  readonly code = 'assignment.teacher_not_qualified';
  readonly kind = 'validation';

  constructor() {
    super('O professor escolhido não está habilitado nesta disciplina.');
  }
}

export class AssignmentAlreadyExistsError extends DomainError {
  readonly code = 'assignment.already_exists';
  readonly kind = 'conflict';

  constructor() {
    super('Esta disciplina já tem professor atribuído nesta turma. Edite a atribuição existente.');
  }
}

export class AssignmentNotFoundError extends NotFoundError {
  constructor() {
    super('assignment.not_found', 'Atribuição não encontrada.');
  }
}

function validWeeklyLessons(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_WEEKLY_LESSONS) {
    throw new InvalidWeeklyLessonsError();
  }
  return value;
}

export function createAssignment(input: {
  id: string;
  classGroupId: string;
  subjectId: string;
  teacherId: string;
  weeklyLessons: number;
  createdAt: Date;
}): TeachingAssignment {
  return { ...input, weeklyLessons: validWeeklyLessons(input.weeklyLessons), version: 1 };
}

/** Turma e disciplina definem a atribuição; mudam apenas o professor e a carga. */
export function changeAssignment(
  assignment: TeachingAssignment,
  input: { teacherId: string; weeklyLessons: number },
): TeachingAssignment {
  return {
    ...assignment,
    teacherId: input.teacherId,
    weeklyLessons: validWeeklyLessons(input.weeklyLessons),
  };
}
