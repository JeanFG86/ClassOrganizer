import { DomainError, NotFoundError } from '../../../shared/domain-error.ts';
import { cleanName, normalizeName } from '../../../shared/names.ts';

export const RESOURCE_NAME_MAX_LENGTH = 60;

/**
 * Recurso especial (ex.: "Quadra", "Laboratório de ciências"): um espaço ou equipamento que
 * atende um bloco de aulas por vez. É opcional; sem recursos, a grade não muda (ADR 0016).
 */
export interface Resource {
  readonly id: string;
  readonly name: string;
  /** Chave usada para impedir duplicidade ignorando maiúsculas, acentos e espaços extras. */
  readonly normalizedName: string;
  readonly createdAt: Date;
  /** Arquivado: deixa de reservar horários nas revisões novas e some das opções. */
  readonly archivedAt: Date | null;
  readonly version: number;
}

export class InvalidResourceNameError extends DomainError {
  readonly code = 'resource.invalid_name';
  readonly kind = 'validation';
}

export class ResourceNameAlreadyInUseError extends DomainError {
  readonly code = 'resource.name_in_use';
  readonly kind = 'conflict';

  constructor(existing: Pick<Resource, 'name' | 'archivedAt'>) {
    super(
      existing.archivedAt
        ? `Já existe um recurso arquivado chamado "${existing.name}". Restaure-o na lista de arquivados.`
        : `Já existe um recurso chamado "${existing.name}".`,
    );
  }
}

export class ResourceNotFoundError extends NotFoundError {
  constructor() {
    super('resource.not_found', 'Recurso não encontrado.');
  }
}

function validName(raw: string): Pick<Resource, 'name' | 'normalizedName'> {
  const name = cleanName(raw);
  if (name.length === 0) {
    throw new InvalidResourceNameError('Informe o nome do recurso.');
  }
  if (name.length > RESOURCE_NAME_MAX_LENGTH) {
    throw new InvalidResourceNameError(
      `O nome do recurso deve ter no máximo ${RESOURCE_NAME_MAX_LENGTH} caracteres.`,
    );
  }
  return { name, normalizedName: normalizeName(name) };
}

export function createResource(input: { id: string; name: string; createdAt: Date }): Resource {
  return {
    id: input.id,
    ...validName(input.name),
    createdAt: input.createdAt,
    archivedAt: null,
    version: 1,
  };
}

export function renameResource(resource: Resource, name: string): Resource {
  return { ...resource, ...validName(name) };
}
