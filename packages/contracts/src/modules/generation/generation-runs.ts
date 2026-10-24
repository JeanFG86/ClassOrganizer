import { z } from 'zod';
import {
  generationOptionsSchema,
  preferenceCriterionSchema,
  preferenceMetricsSchema,
} from './generation.ts';
import { gridDiagnosisSchema, placementSchema } from '../planning/timetable-grid.ts';

const count = z.number().int().nonnegative();
const issue = z.object({ code: z.string(), message: z.string(), entityIds: z.array(z.string()) });
export const GENERATION_RUN_STATUSES = [
  'queued',
  'running',
  'feasible',
  'infeasible',
  'inconclusive',
  'cancelled',
  'invalid_model',
  'failed',
] as const;
export const generationRunSchema = z.object({
  id: z.uuid(),
  revisionId: z.uuid(),
  status: z.enum(GENERATION_RUN_STATUSES),
  requestedAt: z.iso.datetime(),
  requestedBy: z.string(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  attempts: count,
  cancelRequested: z.boolean(),
  options: generationOptionsSchema.extend({ preferences: z.array(preferenceCriterionSchema) }),
  reason: z.string().nullable(),
  diagnostics: z.array(issue),
  warnings: z.array(issue),
  metrics: z
    .object({
      elapsedMs: count,
      visitedNodes: count,
      backtracks: count,
      restarts: count,
      preferences: preferenceMetricsSchema.nullable(),
    })
    .nullable(),
  appliedAt: z.iso.datetime().nullable(),
  appliedBy: z.string().nullable(),
  /** A revisão deixou de ser o rascunho atual ou as fixações e regras mudaram. */
  stale: z.boolean(),
});
export const generationListSchema = z.object({
  revisionId: z.uuid(),
  editable: z.boolean(),
  active: generationRunSchema.nullable(),
  runs: z.array(generationRunSchema),
});
export const generationDetailSchema = z.object({
  run: generationRunSchema,
  applicable: z.boolean(),
  comparison: z
    .object({
      kept: count,
      added: count,
      removed: count,
      placements: z.array(placementSchema),
      diagnosis: gridDiagnosisSchema,
      /** Janelas e repetições da grade atual e da proposta, medidas da mesma forma. */
      preferences: z.object({
        current: preferenceMetricsSchema.omit({ changes: true }),
        proposal: preferenceMetricsSchema.omit({ changes: true }),
      }),
    })
    .nullable(),
});
/** Solicitar e aplicar informam a versão do planejamento e a revisão vistas na tela. */
export const generationCommandSchema = z.object({
  version: z.number().int().positive(),
  revisionId: z.uuid(),
});
/** A solicitação informa os critérios ativos, em ordem de prioridade (ADR 0015). */
export const generationRequestCommandSchema = generationCommandSchema.extend({
  preferences: z
    .array(preferenceCriterionSchema)
    .max(3)
    .refine((list) => new Set(list).size === list.length, 'Não repita critérios.'),
});
export const generationParamsSchema = z.object({ id: z.uuid(), runId: z.uuid() });
export type GenerationRunDto = z.infer<typeof generationRunSchema>;
export type GenerationListDto = z.infer<typeof generationListSchema>;
export type GenerationRequestCommand = z.infer<typeof generationRequestCommandSchema>;
export type PreferenceCriterionDto = z.infer<typeof preferenceCriterionSchema>;
export type GenerationDetailDto = z.infer<typeof generationDetailSchema>;
