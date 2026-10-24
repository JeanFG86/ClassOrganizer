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

export class SubjectName {
  readonly value: string;
  readonly normalized: string;

  constructor(raw: string) {
    const valid = validName(raw);
    this.value = valid.name;
    this.normalized = valid.normalizedName;
  }
}

/** Comportamento da disciplina; o estado serializável preserva as fotografias históricas. */
export class SubjectEntity {
  readonly #state: Subject;

  private constructor(state: Subject) {
    this.#state = { ...state };
  }

  static create(input: { id: string; name: string; createdAt: Date }): SubjectEntity {
    const name = new SubjectName(input.name);
    return new SubjectEntity({
      id: input.id,
      name: name.value,
      normalizedName: name.normalized,
      createdAt: input.createdAt,
      archivedAt: null,
      version: 1,
    });
  }

  static reconstitute(state: Subject): SubjectEntity {
    return new SubjectEntity(state);
  }

  rename(raw: string): SubjectEntity {
    const name = new SubjectName(raw);
    return new SubjectEntity({ ...this.#state, name: name.value, normalizedName: name.normalized });
  }

  archive(at: Date): SubjectEntity {
    return this.#state.archivedAt ? this : new SubjectEntity({ ...this.#state, archivedAt: at });
  }

  restore(): SubjectEntity {
    return new SubjectEntity({ ...this.#state, archivedAt: null });
  }

  snapshot(): Subject {
    return { ...this.#state };
  }
}

export function createSubject(input: { id: string; name: string; createdAt: Date }): Subject {
  return SubjectEntity.create(input).snapshot();
}

export function renameSubject(subject: Subject, name: string): Subject {
  return SubjectEntity.reconstitute(subject).rename(name).snapshot();
}

export function archiveSubject(subject: Subject, at: Date): Subject {
  return SubjectEntity.reconstitute(subject).archive(at).snapshot();
}

export function restoreSubject(subject: Subject): Subject {
  return SubjectEntity.reconstitute(subject).restore().snapshot();
}
