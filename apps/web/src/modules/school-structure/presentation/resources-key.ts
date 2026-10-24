import type { InjectionKey } from 'vue';
import type { ResourcesApi } from '../application/resources-api.ts';
export const resourcesApiKey: InjectionKey<ResourcesApi> = Symbol('ResourcesApi');
