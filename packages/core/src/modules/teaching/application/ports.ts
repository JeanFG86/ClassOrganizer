import type { Teacher } from '../domain/teacher.ts';

export interface TeacherRepository {
  /**
   * Grava o professor e suas habilitações de forma atômica. Deve lançar
   * `UnknownSubjectError` se alguma disciplina deixar de existir durante a gravação.
   */
  add(teacher: Teacher): Promise<void>;
  listAll(): Promise<Teacher[]>;
}

/**
 * O que o módulo de ensino precisa saber sobre disciplinas (módulo school-structure).
 * Definido aqui para que o ensino não dependa dos detalhes do outro módulo.
 */
export interface SubjectLookup {
  /** Devolve, dentre os ids informados, os que correspondem a disciplinas existentes. */
  existingSubjectIds(ids: readonly string[]): Promise<Set<string>>;
}
