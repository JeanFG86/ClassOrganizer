import type { InjectionKey } from 'vue';
import type { SubjectsApi } from '../application/subjects-api.ts';
export const subjectsApiKey: InjectionKey<SubjectsApi> = Symbol('SubjectsApi');
