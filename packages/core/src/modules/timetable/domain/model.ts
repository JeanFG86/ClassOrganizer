import type { AssignmentParticipant, UnavailableSlot } from '../../teaching/domain/index.ts';
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
/** Critérios de qualidade da geração (ADR 0015); nenhum deles relaxa uma regra obrigatória. */
export const PREFERENCE_CRITERIA = ['keep_current', 'teacher_windows', 'daily_spread'] as const;
export type PreferenceCriterion = (typeof PREFERENCE_CRITERIA)[number];
export interface TimetablePreferences {
  /** Critérios ativos em ordem de prioridade: cada um só desempata os anteriores. */
  readonly order: readonly PreferenceCriterion[];
  /** Grade aceita antes da geração, sem as fixações; base de `keep_current`. */
  readonly reference: TimetableProposal;
}
/** Snapshot autocontido. Nenhuma consulta a cadastros ocorre durante a busca. */
export interface TimetableSnapshot {
  readonly modelVersion: 1;
  readonly sourceRevision: string;
  /**
   * Duração única das aulas. `null` aplica a regra de equivalência da ADR 0013: cada aula
   * cadastrada conta como uma aula, qualquer que seja a duração.
   */
  readonly lessonMinutes: number | null;
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
  /** Ausente: a busca entrega a primeira grade válida, sem melhorias (E2). */
  readonly preferences?: TimetablePreferences | undefined;
}
export interface TimetableIssue {
  readonly code: string;
  readonly message: string;
  readonly entityIds: readonly string[];
}
