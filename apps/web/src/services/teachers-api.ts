import { teacherListSchema, teacherSchema } from '@classorganizer/contracts';
import type { TeacherDto, UnavailableSlotDto } from '@classorganizer/contracts';
import type { InjectionKey } from 'vue';
import { apiRequest } from './api-client.ts';

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

export const teachersApiKey: InjectionKey<TeachersApi> = Symbol('TeachersApi');

const teacherPath = (id: string) => `/teachers/${encodeURIComponent(id)}`;

export const httpTeachersApi: TeachersApi = {
  async list() {
    const { items } = await apiRequest(teacherListSchema, '/teachers');
    return items;
  },
  register(input) {
    return apiRequest(teacherSchema, '/teachers', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  update(id, input) {
    return apiRequest(teacherSchema, teacherPath(id), {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  archive(id, version) {
    return apiRequest(teacherSchema, `${teacherPath(id)}/archive`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    });
  },
  restore(id, version) {
    return apiRequest(teacherSchema, `${teacherPath(id)}/restore`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    });
  },
  changeAvailability(id, input) {
    return apiRequest(teacherSchema, `${teacherPath(id)}/availability`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
};
