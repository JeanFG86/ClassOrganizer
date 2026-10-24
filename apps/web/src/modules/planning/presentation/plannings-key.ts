import type { InjectionKey } from 'vue';
import type { PlanningsApi } from '../application/plannings-api.ts';
export const planningsApiKey: InjectionKey<PlanningsApi> = Symbol('PlanningsApi');
