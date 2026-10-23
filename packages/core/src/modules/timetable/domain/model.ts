import type { AssignmentParticipant } from '../../teaching/domain/assignment.ts';
import type { UnavailableSlot } from '../../teaching/domain/teacher.ts';
import type { Weekday } from '../../../shared/weekdays.ts';

export interface TimetablePeriod {
  readonly id: string;
  readonly shiftId: string;
  readonly startMinute: number;
  readonly endMinute: number;
}
export interface LessonPlacement {
  readonly assignmentId: string;
  readonly weekday: Weekday;
  readonly periodId: string;
}
export interface PlanningPlacement {
  readonly teacherId: string;
  readonly weekday: Weekday;
  readonly periodId: string;
}
export interface TimetableProposal {
  readonly lessons: readonly LessonPlacement[];
  readonly planning: readonly PlanningPlacement[];
}
export interface TimetableAssignment {
  readonly id: string;
  readonly classGroupId: string;
  readonly participants: readonly AssignmentParticipant[];
  readonly weeklyLessons: number;
  readonly resourceIds: readonly string[];
}
export interface TimetableTeacher {
  readonly id: string;
  readonly name: string;
  readonly subjectIds: readonly string[];
  readonly unavailable: readonly UnavailableSlot[];
  readonly planningPeriods: number;
  /** Política explícita da execução: não se presume onde cumprir hora-atividade. */
  readonly planningPeriodIds: readonly string[];
  readonly maxWeeklyLessons: number | null;
}
export interface DailySubjectRule {
  readonly classGroupId: string;
  readonly subjectId: string;
  readonly maxPerDay: 1 | 2;
  /** Duas aulas precisam se tocar no horário real, sem atravessar intervalo. */
  readonly consecutive: boolean;
}
/** Snapshot autocontido. Nenhuma consulta a cadastros ocorre durante a busca. */
export interface TimetableSnapshot {
  readonly modelVersion: 1;
  readonly sourceRevision: string;
  readonly lessonMinutes: number;
  readonly weekdays: readonly Weekday[];
  readonly periods: readonly TimetablePeriod[];
  readonly subjects: readonly { readonly id: string; readonly name: string }[];
  readonly classGroups: readonly {
    readonly id: string;
    readonly name: string;
    readonly periodIds: readonly string[];
  }[];
  readonly teachers: readonly TimetableTeacher[];
  readonly assignments: readonly TimetableAssignment[];
  readonly resources: readonly { readonly id: string; readonly name: string }[];
  readonly subjectRules: readonly DailySubjectRule[];
  readonly fixedLessons: readonly LessonPlacement[];
  readonly fixedPlanning: readonly PlanningPlacement[];
}
export interface TimetableIssue {
  readonly code: string;
  readonly message: string;
  readonly entityIds: readonly string[];
}
