import {
  ApplyGeneration,
  ApplyTimetableGrid,
  CancelGeneration,
  ChangeGridRules,
  ChangePlanning,
  CreatePlanning,
  GetGenerationRun,
  GetPlanning,
  ListGenerationRuns,
  ListPlannings,
  PreviewTimetableGrid,
  RequestGeneration,
  UndoTimetableGrid,
  ViewTimetableGrid,
  bindUseCase,
  ComparePlanningRevisions,
  RenamePlanningRevision,
  RestorePlanningRevision,
  PreservePlanningRevision,
  GetTimetableReport,
  ExportTimetableWorkbook,
  type GenerationSettings,
} from '@classorganizer/core';
import {
  PrismaGenerationRunRepository,
  PrismaGridRepository,
  PrismaPlanningRepository,
  ExcelTimetableWorkbook,
  randomSeeds,
  sha256Digest,
  systemClock,
  uuidGenerator,
  type PersistenceClient,
} from '@classorganizer/infrastructure';

/** Planejamentos, grade e geração de uma transação, sobre os mesmos repositórios. */
export function composePlanning(tx: PersistenceClient, settings: GenerationSettings) {
  const plannings = new PrismaPlanningRepository(tx);
  const grids = new PrismaGridRepository(tx);
  const runs = new PrismaGenerationRunRepository(tx);
  const clock = systemClock;
  const ids = uuidGenerator;
  const digest = sha256Digest;
  return {
    plannings: {
      workbook: bindUseCase(
        new ExportTimetableWorkbook({
          plannings,
          grids,
          clock,
          workbooks: new ExcelTimetableWorkbook(),
        }),
      ),
      report: bindUseCase(new GetTimetableReport({ plannings, grids, clock })),
      preserveRevision: bindUseCase(
        new PreservePlanningRevision({ repository: plannings, grids, clock, ids }),
      ),
      list: bindUseCase(new ListPlannings({ repository: plannings })),
      detail: bindUseCase(new GetPlanning({ repository: plannings })),
      create: bindUseCase(new CreatePlanning({ repository: plannings, grids, clock, ids })),
      change: bindUseCase(new ChangePlanning({ repository: plannings, grids, clock, ids })),
      compareRevisions: bindUseCase(new ComparePlanningRevisions({ repository: plannings, grids })),
      renameRevision: bindUseCase(new RenamePlanningRevision({ repository: plannings })),
      restoreRevision: bindUseCase(
        new RestorePlanningRevision({ repository: plannings, grids, clock, ids }),
      ),
    },
    grid: {
      view: bindUseCase(new ViewTimetableGrid({ plannings, grids })),
      preview: bindUseCase(new PreviewTimetableGrid({ plannings, grids })),
      apply: bindUseCase(new ApplyTimetableGrid({ plannings, grids, clock, ids })),
      undo: bindUseCase(new UndoTimetableGrid({ plannings, grids, clock, ids })),
      changeRules: bindUseCase(new ChangeGridRules({ plannings, grids })),
    },
    generation: {
      list: bindUseCase(new ListGenerationRuns({ plannings, grids, runs, digest })),
      detail: bindUseCase(new GetGenerationRun({ plannings, grids, runs, digest })),
      request: bindUseCase(
        new RequestGeneration({
          plannings,
          grids,
          runs,
          clock,
          ids,
          digest,
          seeds: randomSeeds,
          settings,
        }),
      ),
      cancel: bindUseCase(new CancelGeneration({ plannings, grids, runs, clock, digest })),
      apply: bindUseCase(new ApplyGeneration({ plannings, grids, runs, clock, ids, digest })),
    },
  };
}
