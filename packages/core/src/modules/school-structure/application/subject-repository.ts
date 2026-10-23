import type { Subject } from '../domain/subject.ts';

export interface SubjectRepository {
  existsWithNormalizedName(normalizedName: string): Promise<boolean>;
  /** Deve lançar `SubjectNameAlreadyInUseError` se uma gravação concorrente usar o mesmo nome. */
  add(subject: Subject): Promise<void>;
  listAll(): Promise<Subject[]>;
}
