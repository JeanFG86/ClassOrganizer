import type { InjectionKey } from 'vue';
import type { TeachersApi } from '../application/teachers-api.ts';
export const teachersApiKey: InjectionKey<TeachersApi> = Symbol('TeachersApi');
