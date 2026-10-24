import type { TeacherDto, UnavailableSlotDto } from '@classorganizer/contracts';

export interface TeacherInput {
  name: string;
  subjectIds: string[];
  /** `null` quando não há limite. */
  maxWeeklyLessons: number | null;
  planningPeriods: number;
}
export interface TeachersApi {
  /** Inclui os arquivados (`archivedAt` preenchido). */
  list(): Promise<TeacherDto[]>;
  register(input: TeacherInput): Promise<TeacherDto>;
  update(id: string, input: TeacherInput & { version: number }): Promise<TeacherDto>;
  archive(id: string, version: number): Promise<TeacherDto>;
  restore(id: string, version: number): Promise<TeacherDto>;
  /** Substitui todos os horários em que o professor não pode dar aula. */
  changeAvailability(
    id: string,
    input: { unavailable: UnavailableSlotDto[]; version: number },
  ): Promise<TeacherDto>;
}
