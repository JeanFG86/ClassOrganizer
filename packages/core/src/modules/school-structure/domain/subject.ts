import { DomainError, NotFoundError } from '../../../shared/domain-error.ts';
import { cleanName, normalizeName } from '../../../shared/names.ts';

export const SUBJECT_NAME_MAX_LENGTH = 80;

export interface Subject {
  readonly id: string;
  readonly name: string;
  /** Chave usada para impedir duplicidade ignorando maiúsculas, acentos e espaços extras. */
  readonly normalizedName: string;
  readonly createdAt: Date;
  /** Arquivada: some das listas e opções, mas continua referenciada pelo histórico. */
  readonly archivedAt: Date | null;
  /** Versão para controle otimista de concorrência; começa em 1. */
  readonly version: number;
}

export class InvalidSubjectNameError extends DomainError {
  readonly code = 'subject.invalid_name';
  readonly kind = 'validation';
}

export class SubjectNameAlreadyInUseError extends DomainError {
  readonly code = 'subject.name_in_use';
  readonly kind = 'conflict';

  constructor(existing: Pick<Subject, 'name' | 'archivedAt'>) {
    super(
      existing.archivedAt
        ? `Já existe uma disciplina arquivada chamada "${existing.name}". Restaure-a na lista de arquivadas.`
        : `Já existe uma disciplina chamada "${existing.name}".`,
    );
  }
}

export class SubjectNotFoundError extends NotFoundError {
  constructor() {
    super('subject.not_found', 'Disciplina não encontrada.');
  }
}

export const normalizeSubjectName = normalizeName;

function validName(raw: string): Pick<Subject, 'name' | 'normalizedName'> {
  const name = cleanName(raw);

  if (name.length === 0) {
    throw new InvalidSubjectNameError('Informe o nome da disciplina.');
  }
  if (name.length > SUBJECT_NAME_MAX_LENGTH) {
    throw new InvalidSubjectNameError(
      `O nome da disciplina deve ter no máximo ${SUBJECT_NAME_MAX_LENGTH} caracteres.`,
    );
  }
  return { name, normalizedName: normalizeName(name) };
}

export function createSubject(input: { id: string; name: string; createdAt: Date }): Subject {
  return {
    id: input.id,
    ...validName(input.name),
    createdAt: input.createdAt,
    archivedAt: null,
    version: 1,
  };
}

export function renameSubject(subject: Subject, name: string): Subject {
  return { ...subject, ...validName(name) };
}

export function archiveSubject(subject: Subject, at: Date): Subject {
  return subject.archivedAt ? subject : { ...subject, archivedAt: at };
}

export function restoreSubject(subject: Subject): Subject {
  return { ...subject, archivedAt: null };
}
