import type { Subject } from '../../domain/subject.ts';

export interface SubjectRepository {
  findById(id: string): Promise<Subject | null>;
  findByNormalizedName(normalizedName: string): Promise<Subject | null>;
  /** Deve traduzir a violação concorrente de unicidade para `SubjectNameAlreadyInUseError`. */
  add(subject: Subject): Promise<void>;
  /** Verifica a versão persistida e devolve o estado com a nova versão. */
  update(subject: Subject): Promise<Subject>;
  listAll(): Promise<Subject[]>;
}
