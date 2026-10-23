import { teacherListSchema, teacherSchema } from '@classorganizer/contracts';
import type { TeacherDto } from '@classorganizer/contracts';
import type { InjectionKey } from 'vue';
import { apiRequest } from './api-client.ts';

export interface TeachersApi {
  list(): Promise<TeacherDto[]>;
  register(input: { name: string; subjectIds: string[] }): Promise<TeacherDto>;
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
};
