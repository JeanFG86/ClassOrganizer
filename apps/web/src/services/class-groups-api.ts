import { classGroupListSchema, classGroupSchema } from '@classorganizer/contracts';
import type { ChangeClassGroupScheduleRequest, ClassGroupDto } from '@classorganizer/contracts';
import type { InjectionKey } from 'vue';
import { apiRequest } from './api-client.ts';
import { httpCatalogApi, type CatalogApi } from './catalog-api.ts';

export interface ClassGroupsApi extends CatalogApi<ClassGroupDto> {
  /** Define o turno da turma e as aulas desse turno que ela usa. */
  changeSchedule(id: string, input: ChangeClassGroupScheduleRequest): Promise<ClassGroupDto>;
}

export const classGroupsApiKey: InjectionKey<ClassGroupsApi> = Symbol('ClassGroupsApi');

export const httpClassGroupsApi: ClassGroupsApi = {
  ...httpCatalogApi('/class-groups', classGroupSchema, classGroupListSchema),
  changeSchedule(id, input) {
    return apiRequest(classGroupSchema, `/class-groups/${encodeURIComponent(id)}/schedule`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
};
