import {
  bindUseCase,
  ListGenerationRuns,
  GetGenerationRun,
  RequestGeneration,
  CancelGeneration,
  ApplyGeneration,
  type GenerationRunsDependencies,
} from '@classorganizer/core';
export function composeGenerationRuns(deps: GenerationRunsDependencies) {
  return {
    list: bindUseCase(new ListGenerationRuns(deps)),
    detail: bindUseCase(new GetGenerationRun(deps)),
    request: bindUseCase(new RequestGeneration(deps)),
    cancel: bindUseCase(new CancelGeneration(deps)),
    apply: bindUseCase(new ApplyGeneration(deps)),
  };
}
