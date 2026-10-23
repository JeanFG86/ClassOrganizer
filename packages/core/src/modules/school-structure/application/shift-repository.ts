import type { Shift } from '../domain/shift.ts';

export interface ShiftRepository {
  findById(id: string): Promise<Shift | null>;
  findByNormalizedName(normalizedName: string): Promise<Shift | null>;
  /** Deve lançar `ShiftNameAlreadyInUseError` em caso de nome duplicado concorrente. */
  add(shift: Shift): Promise<void>;
  /**
   * Grava turno e aulas condicionado à versão; lança `StaleVersionError` se outra alteração
   * chegou antes e `PeriodInUseError` se uma aula removida ainda estiver marcada numa turma.
   */
  update(shift: Shift): Promise<Shift>;
  listAll(): Promise<Shift[]>;
}
