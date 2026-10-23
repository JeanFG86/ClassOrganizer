import { teacherListSchema, teacherSchema } from '@classorganizer/contracts';
import type { TeacherDto } from '@classorganizer/contracts';
import type { InjectionKey } from 'vue';
import { apiRequest } from './api-client.ts';

export interface TeacherInput {
  name: string;
  subjectIds: string[];
}

export interface TeachersApi {
  /** Inclui os arquivados (`archivedAt` preenchido). */
  list(): Promise<TeacherDto[]>;
  register(input: TeacherInput): Promise<TeacherDto>;
  update(id: string, input: TeacherInput & { version: number }): Promise<TeacherDto>;
  archive(id: string, version: number): Promise<TeacherDto>;
  restore(id: string, version: number): Promise<TeacherDto>;
}

export const teachersApiKey: InjectionKey<TeachersApi> = Symbol('TeachersApi');

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
    return apiRequest(teacherSchema, `/teachers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  archive(id, version) {
    return apiRequest(teacherSchema, `/teachers/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    });
  },
  restore(id, version) {
    return apiRequest(teacherSchema, `/teachers/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    });
  },
};
