import type { InjectionKey } from 'vue';
import type { ShiftsApi } from '../application/shifts-api.ts';
export const shiftsApiKey: InjectionKey<ShiftsApi> = Symbol('ShiftsApi');
