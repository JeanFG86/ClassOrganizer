import type { GridRef, GridApi } from '../application/grid-api.ts';

import {
  gridEvaluationSchema,
  gridResultSchema,
  gridViewSchema,
  type GridOperationDto,
  type GridRulesDto,
} from '@classorganizer/contracts';
import { type HttpClient } from '../../../shared/application/ports/http-client.ts';

/** Referência ao rascunho atual: toda escrita informa a versão do planejamento e a revisão. */

export function createGridApi(client: HttpClient): GridApi {
  const apiRequest = client.request.bind(client);
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
