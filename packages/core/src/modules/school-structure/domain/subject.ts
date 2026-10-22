import { DomainError } from '../../../shared/domain-error.ts';

export const SUBJECT_NAME_MAX_LENGTH = 80;

export interface Subject {
  readonly id: string;
  readonly name: string;
  /** Chave usada para impedir duplicidade ignorando maiúsculas, acentos e espaços extras. */
  readonly normalizedName: string;
  readonly createdAt: Date;
}

export class InvalidSubjectNameError extends DomainError {
  readonly code = 'subject.invalid_name';
  readonly kind = 'validation';
}

export class SubjectNameAlreadyInUseError extends DomainError {
  readonly code = 'subject.name_in_use';
  readonly kind = 'conflict';

  constructor(name: string) {
    super(`Já existe uma disciplina chamada "${name}".`);
  }
}

export function cleanSubjectName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function normalizeSubjectName(name: string): string {
  return cleanSubjectName(name)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
}

export function createSubject(input: { id: string; name: string; createdAt: Date }): Subject {
  const name = cleanSubjectName(input.name);

  if (name.length === 0) {
    throw new InvalidSubjectNameError('Informe o nome da disciplina.');
  }
  if (name.length > SUBJECT_NAME_MAX_LENGTH) {
    throw new InvalidSubjectNameError(
      `O nome da disciplina deve ter no máximo ${SUBJECT_NAME_MAX_LENGTH} caracteres.`,
    );
  }

  return {
    id: input.id,
    name,
    normalizedName: normalizeSubjectName(name),
    createdAt: input.createdAt,
  };
}
