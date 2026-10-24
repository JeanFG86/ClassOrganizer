import type { ClassGroup } from '../../domain/class-group.ts';

export interface ClassGroupRepository {
  findById(id: string): Promise<ClassGroup | null>;
  findByNormalizedName(normalizedName: string): Promise<ClassGroup | null>;
  /** Turmas (ativas e arquivadas) ligadas ao turno. */
  findByShift(shiftId: string): Promise<ClassGroup[]>;
  /** Deve lançar `ClassGroupNameAlreadyInUseError` em caso de nome duplicado concorrente. */
  add(classGroup: ClassGroup): Promise<void>;
  /**
   * Grava nome, situação, turno e aulas condicionado à versão; lança `StaleVersionError`
   * se outra alteração chegou antes.
   */
  update(classGroup: ClassGroup): Promise<ClassGroup>;
  listAll(): Promise<ClassGroup[]>;
}
