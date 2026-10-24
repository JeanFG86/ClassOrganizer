import type {
  ClassGroupRepository,
  ResourceRepository,
  ShiftRepository,
  SubjectRepository,
} from '../../../school-structure/application/ports/index.ts';
import type {
  AssignmentRepository,
  TeacherRepository,
} from '../../../teaching/application/ports/index.ts';

/** Somente as leituras que a prévia usa de cada repositório. */
export interface CatalogImportReaders {
  subjects: Pick<SubjectRepository, 'listAll'>;
  classGroups: Pick<ClassGroupRepository, 'listAll'>;
  shifts: Pick<ShiftRepository, 'listAll'>;
  resources: Pick<ResourceRepository, 'listAll'>;
  teachers: Pick<TeacherRepository, 'listAll'>;
  assignments: Pick<AssignmentRepository, 'listAll'>;
}

/** Leituras e cadastros usados pela confirmação. */
export interface CatalogImportWriters extends CatalogImportReaders {
  subjects: Pick<SubjectRepository, 'listAll' | 'add'>;
  classGroups: Pick<ClassGroupRepository, 'listAll' | 'add' | 'update'>;
  teachers: Pick<TeacherRepository, 'listAll' | 'add'>;
  assignments: Pick<AssignmentRepository, 'listAll' | 'add'>;
}
