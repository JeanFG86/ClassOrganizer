import type { InjectionKey } from 'vue';
import type { GridApi } from '../application/grid-api.ts';
export const gridApiKey: InjectionKey<GridApi> = Symbol('gridApi');
