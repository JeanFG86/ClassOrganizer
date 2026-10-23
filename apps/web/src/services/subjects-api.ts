import { subjectListSchema, subjectSchema } from '@classorganizer/contracts';
import type { SubjectDto } from '@classorganizer/contracts';
import type { InjectionKey } from 'vue';
import { apiRequest } from './api-client.ts';

export interface SubjectsApi {
  list(): Promise<SubjectDto[]>;
  register(name: string): Promise<SubjectDto>;
}

export const subjectsApiKey: InjectionKey<SubjectsApi> = Symbol('SubjectsApi');

export const httpSubjectsApi: SubjectsApi = {
  async list() {
    const { items } = await apiRequest(subjectListSchema, '/subjects');
    return items;
  },
  register(name) {
    return apiRequest(subjectSchema, '/subjects', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },
};
