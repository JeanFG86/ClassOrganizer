export { SubjectEntity, SubjectName, createSubject, type Subject } from './domain/subject.ts';
export { RegisterSubject } from './application/usecases/register-subject.ts';
export { ListSubjects } from './application/queries/list-subjects.ts';
export {
  UpdateSubject,
  ArchiveSubject,
  RestoreSubject,
} from './application/usecases/change-subject.ts';
export type { SubjectRepository } from './application/ports/subject-repository.ts';
