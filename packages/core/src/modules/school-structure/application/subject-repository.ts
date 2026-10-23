import type { Subject } from '../domain/subject.ts';

export interface SubjectRepository {
  findById(id: string): Promise<Subject | null>;
  findByNormalizedName(normalizedName: string): Promise<Subject | null>;
  /** Deve lançar `SubjectNameAlreadyInUseError` se uma gravação concorrente usar o mesmo nome. */
  add(subject: Subject): Promise<void>;
  /**
   * Grava somente se a versão persistida ainda for `subject.version` e devolve a disciplina
   * com a nova versão. Lança `StaleVersionError` se outra alteração chegou antes e
   * `SubjectNameAlreadyInUseError` em caso de nome duplicado.
   */
  update(subject: Subject): Promise<Subject>;
  listAll(): Promise<Subject[]>;
}
