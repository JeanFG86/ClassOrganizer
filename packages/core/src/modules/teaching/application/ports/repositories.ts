import type { EntityStatus } from '../../../../shared/archiving.ts';
import type { TeachingAssignment } from '../../domain/assignment.ts';
import type { SubjectStatus, Teacher } from '../../domain/teacher.ts';

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
   * `StaleVersionError` se outra alteração chegou antes e `QualificationInUseError` se
   * uma habilitação removida estiver em uso por uma atribuição.
   */
  update(teacher: Teacher): Promise<Teacher>;
  listAll(): Promise<Teacher[]>;
}

export interface AssignmentRepository {
  findById(id: string): Promise<TeachingAssignment | null>;
  /** Grava o bloco e seus participantes de forma atômica. */
  add(assignment: TeachingAssignment): Promise<void>;
  /** Grava condicionado à versão; lança `StaleVersionError` se outra alteração chegou antes. */
  update(assignment: TeachingAssignment): Promise<TeachingAssignment>;
  /** Remove condicionado à versão; lança `StaleVersionError` se outra alteração chegou antes. */
  remove(assignment: TeachingAssignment): Promise<void>;
  listAll(): Promise<TeachingAssignment[]>;
  /** Disciplinas em que o professor tem aulas atribuídas. */
  subjectIdsAssignedTo(teacherId: string): Promise<Set<string>>;
}

/**
 * O que o módulo de ensino precisa saber sobre disciplinas (módulo school-structure).
 * Definido aqui para que o ensino não dependa dos detalhes do outro módulo.
 */
export interface SubjectLookup {
  /** Situação de cada disciplina existente dentre os ids informados; ids ausentes não existem. */
  subjectStatuses(ids: readonly string[]): Promise<Map<string, SubjectStatus>>;
}

/** O que o módulo de ensino precisa saber sobre turmas (módulo school-structure). */
export interface ClassGroupStatusLookup {
  /** `undefined` quando a turma não existe. */
  classGroupStatus(id: string): Promise<EntityStatus | undefined>;
}

/** O que o módulo de ensino precisa saber sobre recursos especiais (módulo school-structure). */
export interface ResourceLookup {
  /** Situação de cada recurso existente dentre os ids informados; ids ausentes não existem. */
  resourceStatuses(ids: readonly string[]): Promise<Map<string, EntityStatus>>;
}

/** O que o módulo de ensino precisa saber sobre as aulas dos turnos (módulo school-structure). */
export interface PeriodLookup {
  /** Dentre os ids informados, os que são aulas existentes de algum turno. */
  existingPeriodIds(ids: readonly string[]): Promise<Set<string>>;
}
