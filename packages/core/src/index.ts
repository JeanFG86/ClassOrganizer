export { DomainError, NotFoundError, type DomainErrorKind } from './shared/domain-error.ts';
export type { Clock, Digest, IdGenerator, SeedGenerator } from './shared/ports.ts';
export { StaleVersionError, type VersionedRef } from './shared/versioning.ts';
export { WEEKDAYS, isWeekday, type Weekday } from './shared/weekdays.ts';
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
  InvalidResourceNameError,
  RESOURCE_NAME_MAX_LENGTH,
  ResourceNameAlreadyInUseError,
  ResourceNotFoundError,
  createResource,
  type Resource,
} from './modules/school-structure/domain/resource.ts';
export * from './modules/school-structure/application/resources.ts';

export {
  ArchivedSubjectError,
  InvalidAvailabilityError,
  InvalidTeacherNameError,
  InvalidWorkloadError,
  MAX_PLANNING_PERIODS,
  MAX_WEEKLY_LESSONS_LIMIT,
  QualificationInUseError,
  TEACHER_NAME_MAX_LENGTH,
  TeacherHasAssignmentsError,
  TeacherNotFoundError,
  UnknownSubjectError,
  createTeacher,
  setUnavailability,
  type SubjectStatus,
  type Teacher,
  type UnavailableSlot,
  type WorkloadInput,
} from './modules/teaching/domain/teacher.ts';
export type {
  AssignmentRepository,
  ClassGroupStatusLookup,
  PeriodLookup,
  ResourceLookup,
  SubjectLookup,
  TeacherRepository,
} from './modules/teaching/application/ports.ts';
export {
  InvalidAssignmentParticipantsError,
  type AssignmentParticipant,
  AssignmentNotFoundError,
  InvalidAssignmentReferenceError,
  InvalidAssignmentResourcesError,
  InvalidWeeklyLessonsError,
  MAX_ASSIGNMENT_RESOURCES,
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
  makeChangeTeacherAvailability,
  makeRestoreTeacher,
  makeUpdateTeacher,
  type ArchiveTeacher,
  type ChangeTeacherAvailability,
  type RestoreTeacher,
  type UpdateTeacher,
} from './modules/teaching/application/change-teacher.ts';

export type {
  TimetablePeriod,
  LessonPlacement,
  PlanningPlacement,
  TimetableProposal,
  TimetableAssignment,
  TimetableTeacher,
  DailySubjectRule,
  TimetableSnapshot,
  TimetableIssue,
} from './modules/timetable/domain/model.ts';
export { PREFERENCE_CRITERIA } from './modules/timetable/domain/model.ts';
export type {
  PreferenceCriterion,
  TimetablePreferences,
} from './modules/timetable/domain/model.ts';
export {
  measurePreferences,
  type PreferenceMetrics,
} from './modules/timetable/domain/preferences.ts';
export { validateTimetableModel } from './modules/timetable/domain/validate-model.ts';
export {
  validateTimetableProposal,
  measureTeacherIdleMinutes,
} from './modules/timetable/domain/validate-proposal.ts';
export type {
  GenerationOptions,
  SearchStatus,
  EngineSearchResult,
  TimetableEngine,
  GenerationResult,
} from './modules/generation/application/engine.ts';
export {
  makeGenerateTimetable,
  type GenerateTimetable,
} from './modules/generation/application/generate-timetable.ts';

export * from './modules/access/domain/access.ts';
export * from './modules/access/application/authorize.ts';
export * from './modules/planning/domain/planning.ts';
export { makePlannings } from './modules/planning/application/plannings.ts';
export * from './modules/access/application/accounts.ts';
export * from './modules/planning/domain/grid.ts';
export * from './modules/planning/domain/catalog-translation.ts';
export * from './modules/planning/domain/diagnosis.ts';
export * from './modules/planning/domain/grid-summary.ts';
export * from './modules/planning/application/ports.ts';
export * from './modules/planning/application/timetable-grid.ts';
export * from './modules/planning/domain/generation-run.ts';
export * from './modules/planning/application/generation-runs.ts';
export * from './modules/generation/application/generation-queue.ts';
