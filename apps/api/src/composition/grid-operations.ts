import {
  bindUseCase,
  ViewTimetableGrid,
  PreviewTimetableGrid,
  ApplyTimetableGrid,
  UndoTimetableGrid,
  ChangeGridRules,
  type TimetableGridDependencies,
} from '@classorganizer/core';
export function composeTimetableGrid(deps: TimetableGridDependencies) {
  return {
    view: bindUseCase(new ViewTimetableGrid(deps)),
    preview: bindUseCase(new PreviewTimetableGrid(deps)),
    apply: bindUseCase(new ApplyTimetableGrid(deps)),
    undo: bindUseCase(new UndoTimetableGrid(deps)),
    changeRules: bindUseCase(new ChangeGridRules(deps)),
  };
}
