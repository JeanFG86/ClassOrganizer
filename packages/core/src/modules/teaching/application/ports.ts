import type { SubjectStatus, Teacher } from '../domain/teacher.ts';

export interface TeacherRepository {
  findById(id: string): Promise<Teacher | null>;
  /**
   * Grava o professor e suas habilitações de forma atômica. Deve lançar
   * `UnknownSubjectError` se alguma disciplina deixar de existir durante a gravação.
   */
  add(teacher: Teacher): Promise<void>;
  /**
   * Substitui dados e habilitações de forma atômica, somente se a versão persistida
   * ainda for `teacher.version`; devolve o professor com a nova versão. Lança
   * `StaleVersionError` se outra alteração chegou antes.
   */
  update(teacher: Teacher): Promise<Teacher>;
  listAll(): Promise<Teacher[]>;
}

/**
 * O que o módulo de ensino precisa saber sobre disciplinas (módulo school-structure).
 * Definido aqui para que o ensino não dependa dos detalhes do outro módulo.
 */
export interface SubjectLookup {
  /** Situação de cada disciplina existente dentre os ids informados; ids ausentes não existem. */
  subjectStatuses(ids: readonly string[]): Promise<Map<string, SubjectStatus>>;
}
