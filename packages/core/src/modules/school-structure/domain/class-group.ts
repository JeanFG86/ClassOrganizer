import { DomainError, NotFoundError } from '../../../shared/domain-error.ts';
import { cleanName, normalizeName } from '../../../shared/names.ts';

export const CLASS_GROUP_NAME_MAX_LENGTH = 40;

/** Turma (ex.: "6º ano A"). Turno e períodos obrigatórios entram após a E0. */
export interface ClassGroup {
  readonly id: string;
  readonly name: string;
  /** Chave usada para impedir duplicidade ignorando maiúsculas, acentos e espaços extras. */
  readonly normalizedName: string;
  readonly createdAt: Date;
  readonly archivedAt: Date | null;
  readonly version: number;
}

export class InvalidClassGroupNameError extends DomainError {
  readonly code = 'class_group.invalid_name';
  readonly kind = 'validation';
}

export class ClassGroupNameAlreadyInUseError extends DomainError {
  readonly code = 'class_group.name_in_use';
  readonly kind = 'conflict';

  constructor(existing: Pick<ClassGroup, 'name' | 'archivedAt'>) {
    super(
      existing.archivedAt
        ? `Já existe uma turma arquivada chamada "${existing.name}". Restaure-a na lista de arquivadas.`
        : `Já existe uma turma chamada "${existing.name}".`,
    );
  }
}

export class ClassGroupNotFoundError extends NotFoundError {
  constructor() {
    super('class_group.not_found', 'Turma não encontrada.');
  }
}

function validName(raw: string): Pick<ClassGroup, 'name' | 'normalizedName'> {
  const name = cleanName(raw);

  if (name.length === 0) {
    throw new InvalidClassGroupNameError('Informe o nome da turma.');
  }
  if (name.length > CLASS_GROUP_NAME_MAX_LENGTH) {
    throw new InvalidClassGroupNameError(
      `O nome da turma deve ter no máximo ${CLASS_GROUP_NAME_MAX_LENGTH} caracteres.`,
    );
  }
  return { name, normalizedName: normalizeName(name) };
}

export function createClassGroup(input: { id: string; name: string; createdAt: Date }): ClassGroup {
  return {
    id: input.id,
    ...validName(input.name),
    createdAt: input.createdAt,
    archivedAt: null,
    version: 1,
  };
}

export function renameClassGroup(classGroup: ClassGroup, name: string): ClassGroup {
  return { ...classGroup, ...validName(name) };
}
