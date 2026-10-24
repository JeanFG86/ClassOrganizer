import { DomainError, NotFoundError } from '../../../shared/domain-error.ts';

export const MAX_WEEKLY_LESSONS = 40;
/** Recursos especiais que um bloco pode ocupar ao mesmo tempo (ADR 0016). */
export const MAX_ASSIGNMENT_RESOURCES = 5;

/** Cada professor participa uma vez do bloco, com a disciplina em que é habilitado. */
export interface AssignmentParticipant {
  readonly teacherId: string;
  readonly subjectId: string;
}

/** Bloco de aulas simultâneas de uma turma. A carga vale para cada participante. */
export interface TeachingAssignment {
  readonly id: string;
  readonly classGroupId: string;
  readonly participants: readonly AssignmentParticipant[];
  readonly weeklyLessons: number;
  /** Recursos especiais ocupados por todas as aulas do bloco; vazio na maioria dos blocos. */
  readonly resourceIds: readonly string[];
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

export class InvalidAssignmentParticipantsError extends DomainError {
  readonly code = 'assignment.invalid_participants';
  readonly kind = 'validation';

  constructor() {
    super('Inclua pelo menos um professor e não repita o mesmo professor no bloco.');
  }
}

export class InvalidAssignmentResourcesError extends DomainError {
  readonly code = 'assignment.invalid_resources';
  readonly kind = 'validation';

  constructor() {
    super(`Escolha até ${MAX_ASSIGNMENT_RESOURCES} recursos, sem repetir nenhum.`);
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

function validParticipants(
  participants: readonly AssignmentParticipant[],
): AssignmentParticipant[] {
  if (
    participants.length === 0 ||
    new Set(participants.map((p) => p.teacherId)).size !== participants.length
  ) {
    throw new InvalidAssignmentParticipantsError();
  }
  return participants.map((p) => ({ ...p }));
}

function validResources(resourceIds: readonly string[]): string[] {
  if (
    resourceIds.length > MAX_ASSIGNMENT_RESOURCES ||
    new Set(resourceIds).size !== resourceIds.length
  ) {
    throw new InvalidAssignmentResourcesError();
  }
  return [...resourceIds];
}

export function createAssignment(input: {
  id: string;
  classGroupId: string;
  participants: readonly AssignmentParticipant[];
  weeklyLessons: number;
  resourceIds: readonly string[];
  createdAt: Date;
}): TeachingAssignment {
  return {
    ...input,
    participants: validParticipants(input.participants),
    weeklyLessons: validWeeklyLessons(input.weeklyLessons),
    resourceIds: validResources(input.resourceIds),
    version: 1,
  };
}

/** A turma permanece; participantes, carga e recursos são alterados juntos. */
export function changeAssignment(
  assignment: TeachingAssignment,
  input: {
    participants: readonly AssignmentParticipant[];
    weeklyLessons: number;
    resourceIds: readonly string[];
  },
): TeachingAssignment {
  return {
    ...assignment,
    participants: validParticipants(input.participants),
    weeklyLessons: validWeeklyLessons(input.weeklyLessons),
    resourceIds: validResources(input.resourceIds),
  };
}
