import { subjectListSchema, subjectSchema } from '@classorganizer/contracts';
import type { SubjectDto } from '@classorganizer/contracts';
import type { InjectionKey } from 'vue';
import { apiRequest } from './api-client.ts';

export interface SubjectsApi {
  /** Inclui as arquivadas (`archivedAt` preenchido). */
  list(): Promise<SubjectDto[]>;
  register(name: string): Promise<SubjectDto>;
  update(id: string, input: { name: string; version: number }): Promise<SubjectDto>;
  archive(id: string, version: number): Promise<SubjectDto>;
  restore(id: string, version: number): Promise<SubjectDto>;
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
  update(id, input) {
    return apiRequest(subjectSchema, `/subjects/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  archive(id, version) {
    return apiRequest(subjectSchema, `/subjects/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    });
  },
  restore(id, version) {
    return apiRequest(subjectSchema, `/subjects/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    });
  },
};
