import type { InjectionKey } from 'vue';
import type { AssignmentsApi } from '../application/assignments-api.ts';
export const assignmentsApiKey: InjectionKey<AssignmentsApi> = Symbol('AssignmentsApi');
