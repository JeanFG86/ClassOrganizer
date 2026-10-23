export { DomainError, NotFoundError, type DomainErrorKind } from './shared/domain-error.ts';
export type { Clock, IdGenerator } from './shared/ports.ts';
export { StaleVersionError, type VersionedRef } from './shared/versioning.ts';
export { statusOf, type EntityStatus } from './shared/archiving.ts';

export {
  CLASS_GROUP_NAME_MAX_LENGTH,
  ClassGroupNameAlreadyInUseError,
  ClassGroupNotFoundError,
  InvalidClassGroupNameError,
  InvalidClassScheduleError,
  createClassGroup,
  scheduleClassGroup,
  type ClassGroup,
} from './modules/school-structure/domain/class-group.ts';
export {
  makeArchiveClassGroup,
  makeChangeClassGroupSchedule,
  makeListClassGroups,
  makeRegisterClassGroup,
  makeRestoreClassGroup,
  makeUpdateClassGroup,
  type ArchiveClassGroup,
  type ChangeClassGroupSchedule,
  type ClassGroupRepository,
  type ListClassGroups,
  type RegisterClassGroup,
  type RestoreClassGroup,
  type UpdateClassGroup,
} from './modules/school-structure/application/class-groups.ts';

export {
  InvalidPeriodsError,
  InvalidShiftNameError,
  MAX_PERIODS_PER_SHIFT,
  PeriodInUseError,
  SHIFT_NAME_MAX_LENGTH,
  ShiftInUseError,
  ShiftNameAlreadyInUseError,
  ShiftNotFoundError,
  createShift,
  type Period,
  type PeriodInput,
  type Shift,
} from './modules/school-structure/domain/shift.ts';
export type { ShiftRepository } from './modules/school-structure/application/shift-repository.ts';
export {
  makeArchiveShift,
  makeListShifts,
  makeRegisterShift,
  makeRestoreShift,
  makeUpdateShift,
  type ArchiveShift,
  type ListShifts,
  type RegisterShift,
  type RestoreShift,
  type UpdateShift,
} from './modules/school-structure/application/shifts.ts';

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
  QualificationInUseError,
  TEACHER_NAME_MAX_LENGTH,
  TeacherHasAssignmentsError,
  TeacherNotFoundError,
  UnknownSubjectError,
  createTeacher,
  type SubjectStatus,
  type Teacher,
} from './modules/teaching/domain/teacher.ts';
export type {
  AssignmentRepository,
  ClassGroupStatusLookup,
  SubjectLookup,
  TeacherRepository,
} from './modules/teaching/application/ports.ts';
export {
  AssignmentAlreadyExistsError,
  AssignmentNotFoundError,
  InvalidAssignmentReferenceError,
  InvalidWeeklyLessonsError,
  MAX_WEEKLY_LESSONS,
  TeacherNotQualifiedError,
  createAssignment,
  type TeachingAssignment,
} from './modules/teaching/domain/assignment.ts';
export {
  makeAssignTeaching,
  makeChangeAssignment,
  makeListAssignments,
  makeRemoveAssignment,
  type AssignTeaching,
  type ChangeAssignment,
  type ListAssignments,
  type RemoveAssignment,
} from './modules/teaching/application/assignments.ts';
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
