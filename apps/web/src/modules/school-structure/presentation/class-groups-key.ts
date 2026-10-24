import type { InjectionKey } from 'vue';
import type { ClassGroupsApi } from '../application/class-groups-api.ts';
export const classGroupsApiKey: InjectionKey<ClassGroupsApi> = Symbol('ClassGroupsApi');
