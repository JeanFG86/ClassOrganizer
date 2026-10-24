import type { InjectionKey } from 'vue';
import {
  gridEvaluationSchema,
  gridResultSchema,
  gridViewSchema,
  type GridOperationDto,
  type GridRulesDto,
} from '@classorganizer/contracts';
import { apiRequest } from './api-client.ts';

/** Referência ao rascunho atual: toda escrita informa a versão do planejamento e a revisão. */
export interface GridRef {
  planningId: string;
  version: number;
  revisionId: string;
}

export function createGridApi() {
  const path = (planningId: string) => '/plannings/' + encodeURIComponent(planningId) + '/grid';
  const command = (ref: GridRef, operation: GridOperationDto) =>
    JSON.stringify({ version: ref.version, revisionId: ref.revisionId, operation });
  return {
    view: (planningId: string, revisionId?: string) =>
      apiRequest(
        gridViewSchema,
        path(planningId) + (revisionId ? '?revisionId=' + encodeURIComponent(revisionId) : ''),
      ),
    preview: (ref: GridRef, operation: GridOperationDto) =>
      apiRequest(gridEvaluationSchema, path(ref.planningId) + '/preview', {
        method: 'POST',
        body: command(ref, operation),
      }),
    apply: (ref: GridRef, operation: GridOperationDto) =>
      apiRequest(gridResultSchema, path(ref.planningId) + '/operations', {
        method: 'POST',
        body: command(ref, operation),
      }),
    undo: (ref: GridRef) =>
      apiRequest(gridResultSchema, path(ref.planningId) + '/undo', {
        method: 'POST',
        body: JSON.stringify({ version: ref.version, revisionId: ref.revisionId }),
      }),
    changeRules: (ref: GridRef, rules: GridRulesDto) =>
      apiRequest(gridResultSchema, path(ref.planningId) + '/rules', {
        method: 'PUT',
        body: JSON.stringify({ version: ref.version, revisionId: ref.revisionId, rules }),
      }),
  };
}
export type GridApi = ReturnType<typeof createGridApi>;
export const gridApiKey: InjectionKey<GridApi> = Symbol('gridApi');
export const httpGridApi = createGridApi();
