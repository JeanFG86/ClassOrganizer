export { DomainError, type DomainErrorKind } from './shared/domain-error.ts';
export type { Clock, IdGenerator } from './shared/ports.ts';

export {
  InvalidSubjectNameError,
  SUBJECT_NAME_MAX_LENGTH,
  SubjectNameAlreadyInUseError,
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
  InvalidTeacherNameError,
  TEACHER_NAME_MAX_LENGTH,
  UnknownSubjectError,
  createTeacher,
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
