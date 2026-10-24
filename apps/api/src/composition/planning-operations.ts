import {
  bindUseCase,
  ListPlannings,
  GetPlanning,
  CreatePlanning,
  ChangePlanning,
  type PlanningsDependencies,
} from '@classorganizer/core';
export function composePlannings(deps: PlanningsDependencies) {
  return {
    list: bindUseCase(new ListPlannings(deps)),
    detail: bindUseCase(new GetPlanning(deps)),
    create: bindUseCase(new CreatePlanning(deps)),
    change: bindUseCase(new ChangePlanning(deps)),
  };
}
