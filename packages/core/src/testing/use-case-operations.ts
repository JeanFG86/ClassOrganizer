import { bindUseCase } from '../shared/use-case.ts';
import {
  ListAccounts,
  CreateAccount,
  ChangeAccount,
  ChangePassword,
  type ManageAccountsDependencies,
} from '../modules/access/index.ts';
export function createAccountTestOperations(deps: ManageAccountsDependencies) {
  return {
    list: bindUseCase(new ListAccounts(deps)),
    create: bindUseCase(new CreateAccount(deps)),
    change: bindUseCase(new ChangeAccount(deps)),
    changePassword: bindUseCase(new ChangePassword(deps)),
  };
}
import {
  ListPlannings,
  GetPlanning,
  CreatePlanning,
  ChangePlanning,
  type PlanningsDependencies,
  ViewTimetableGrid,
  PreviewTimetableGrid,
  ApplyTimetableGrid,
  UndoTimetableGrid,
  ChangeGridRules,
  type TimetableGridDependencies,
  ListGenerationRuns,
  GetGenerationRun,
  RequestGeneration,
  CancelGeneration,
  ApplyGeneration,
  type GenerationRunsDependencies,
} from '../modules/planning/index.ts';
export function createPlanningTestOperations(deps: PlanningsDependencies) {
  return {
    list: bindUseCase(new ListPlannings(deps)),
    detail: bindUseCase(new GetPlanning(deps)),
    create: bindUseCase(new CreatePlanning(deps)),
    change: bindUseCase(new ChangePlanning(deps)),
  };
}
export function createGridTestOperations(deps: TimetableGridDependencies) {
  return {
    view: bindUseCase(new ViewTimetableGrid(deps)),
    preview: bindUseCase(new PreviewTimetableGrid(deps)),
    apply: bindUseCase(new ApplyTimetableGrid(deps)),
    undo: bindUseCase(new UndoTimetableGrid(deps)),
    changeRules: bindUseCase(new ChangeGridRules(deps)),
  };
}
export function createGenerationTestOperations(deps: GenerationRunsDependencies) {
  return {
    list: bindUseCase(new ListGenerationRuns(deps)),
    detail: bindUseCase(new GetGenerationRun(deps)),
    request: bindUseCase(new RequestGeneration(deps)),
    cancel: bindUseCase(new CancelGeneration(deps)),
    apply: bindUseCase(new ApplyGeneration(deps)),
  };
}
