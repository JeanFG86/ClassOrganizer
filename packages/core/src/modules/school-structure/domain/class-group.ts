import { DomainError, NotFoundError } from '../../../shared/domain-error.ts';
import { cleanName, normalizeName } from '../../../shared/names.ts';
import type { Shift } from './shift.ts';

export const CLASS_GROUP_NAME_MAX_LENGTH = 40;

/** Turma (ex.: "6º ano A"), com o turno e as aulas do turno em que ela tem aula. */
export interface ClassGroup {
  readonly id: string;
  readonly name: string;
  /** Chave usada para impedir duplicidade ignorando maiúsculas, acentos e espaços extras. */
  readonly normalizedName: string;
  /** Turno da turma; `null` enquanto não foi definido. */
  readonly shiftId: string | null;
  /**
   * Aulas do turno que a turma usa, na ordem do turno. Turmas do mesmo turno podem usar
   * quantidades diferentes de aulas (ex.: 5 no fundamental e 6 no médio). Vazio sem turno.
   */
  readonly periodIds: readonly string[];
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

export class InvalidClassScheduleError extends DomainError {
  readonly code = 'class_group.invalid_schedule';
  readonly kind = 'validation';
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

function createClassGroupState(input: { id: string; name: string; createdAt: Date }): ClassGroup {
  return {
    id: input.id,
    ...validName(input.name),
    shiftId: null,
    periodIds: [],
    createdAt: input.createdAt,
    archivedAt: null,
    version: 1,
  };
}

function renameClassGroupState(classGroup: ClassGroup, name: string): ClassGroup {
  return { ...classGroup, ...validName(name) };
}

/** Define o turno da turma e as aulas desse turno que ela usa (`shift` nulo tira do turno). */
function scheduleClassGroupState(
  classGroup: ClassGroup,
  shift: Shift | null,
  periodIds: readonly string[],
): ClassGroup {
  if (shift === null) {
    return { ...classGroup, shiftId: null, periodIds: [] };
  }
  if (shift.archivedAt) {
    throw new InvalidClassScheduleError(`O turno "${shift.name}" está arquivado.`);
  }
  const chosen = new Set(periodIds);
  if (chosen.size === 0) {
    throw new InvalidClassScheduleError('Escolha pelo menos uma aula do turno para a turma.');
  }
  const ofShift = new Set(shift.periods.map((p) => p.id));
  if ([...chosen].some((id) => !ofShift.has(id))) {
    throw new InvalidClassScheduleError(
      'Uma das aulas escolhidas não pertence ao turno. Recarregue a página e tente novamente.',
    );
  }
  return {
    ...classGroup,
    shiftId: shift.id,
    periodIds: shift.periods.filter((p) => chosen.has(p.id)).map((p) => p.id),
  };
}

/** Transições de negócio; fotografias são cópias independentes do estado. */
export class ClassGroupEntity {
  readonly #state: ClassGroup;
  private constructor(state: ClassGroup) {
    this.#state = structuredClone(state);
  }
  static reconstitute(state: ClassGroup): ClassGroupEntity {
    return new ClassGroupEntity(state);
  }
  snapshot(): ClassGroup {
    return structuredClone(this.#state);
  }
  static create(input: { id: string; name: string; createdAt: Date }): ClassGroupEntity {
    return new ClassGroupEntity(createClassGroupState(input));
  }
  rename(name: string): ClassGroupEntity {
    return new ClassGroupEntity(renameClassGroupState(this.#state, name));
  }
  schedule(shift: Shift | null, periodIds: readonly string[]): ClassGroupEntity {
    return new ClassGroupEntity(scheduleClassGroupState(this.#state, shift, periodIds));
  }
  archive(at: Date): ClassGroupEntity {
    return this.#state.archivedAt ? this : new ClassGroupEntity({ ...this.#state, archivedAt: at });
  }
  restore(): ClassGroupEntity {
    return new ClassGroupEntity({ ...this.#state, archivedAt: null });
  }
}

export function createClassGroup(input: { id: string; name: string; createdAt: Date }): ClassGroup {
  return ClassGroupEntity.create(input).snapshot();
}

export function renameClassGroup(classGroup: ClassGroup, name: string): ClassGroup {
  return ClassGroupEntity.reconstitute(classGroup).rename(name).snapshot();
}

export function scheduleClassGroup(
  classGroup: ClassGroup,
  shift: Shift | null,
  periodIds: readonly string[],
): ClassGroup {
  return ClassGroupEntity.reconstitute(classGroup).schedule(shift, periodIds).snapshot();
}
