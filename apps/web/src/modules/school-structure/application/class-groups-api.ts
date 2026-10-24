import type { ChangeClassGroupScheduleRequest, ClassGroupDto } from '@classorganizer/contracts';

import { type CatalogApi } from '../../../shared/application/catalog-api.ts';

export interface ClassGroupsApi extends CatalogApi<ClassGroupDto> {
  /** Define o turno da turma e as aulas desse turno que ela usa. */
  changeSchedule(id: string, input: ChangeClassGroupScheduleRequest): Promise<ClassGroupDto>;
}
