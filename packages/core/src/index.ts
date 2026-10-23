export { DomainError, NotFoundError, type DomainErrorKind } from './shared/domain-error.ts';
export type { Clock, IdGenerator } from './shared/ports.ts';
export { StaleVersionError, type VersionedRef } from './shared/versioning.ts';

export {
  InvalidSubjectNameError,
  SUBJECT_NAME_MAX_LENGTH,
  SubjectNameAlreadyInUseError,
  SubjectNotFoundError,
  createSubject,
  normalizeSubjectName,
  type Subject,
} from './modules/school-structure/domain/subject.ts';
export type { SubjectRepository } from './modules/school-structure/application/subject-repository.ts';
export {
  makeRegisterSubject,
  type RegisterSubject,
} from './modules/school-structure/application/register-subject.ts';
export {
  makeListSubjects,
  type ListSubjects,
} from './modules/school-structure/application/list-subjects.ts';
export {
  makeArchiveSubject,
  makeRestoreSubject,
  makeUpdateSubject,
  type ArchiveSubject,
  type RestoreSubject,
  type UpdateSubject,
} from './modules/school-structure/application/change-subject.ts';

export {
  ArchivedSubjectError,
  InvalidTeacherNameError,
  TEACHER_NAME_MAX_LENGTH,
  TeacherNotFoundError,
  UnknownSubjectError,
  createTeacher,
  type SubjectStatus,
  type Teacher,
} from './modules/teaching/domain/teacher.ts';
export type { SubjectLookup, TeacherRepository } from './modules/teaching/application/ports.ts';
export {
  makeRegisterTeacher,
  type RegisterTeacher,
} from './modules/teaching/application/register-teacher.ts';
export {
  makeListTeachers,
  type ListTeachers,
} from './modules/teaching/application/list-teachers.ts';
export {
  makeArchiveTeacher,
  makeRestoreTeacher,
  makeUpdateTeacher,
  type ArchiveTeacher,
  type RestoreTeacher,
  type UpdateTeacher,
} from './modules/teaching/application/change-teacher.ts';
