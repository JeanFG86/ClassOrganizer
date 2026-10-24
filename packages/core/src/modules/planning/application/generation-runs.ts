import type { Clock, Digest, IdGenerator, SeedGenerator } from '../../../shared/ports.ts';
import { NotFoundError } from '../../../shared/domain-error.ts';
import { READ_ROLES, WRITE_ROLES, requireRole, type Actor } from '../../access/domain/access.ts';
import { gridProposal, type TranslatedCatalog } from '../domain/catalog-translation.ts';
import { diagnoseGrid, isGridComplete } from '../domain/diagnosis.ts';
import {
  canonicalJson,
  compareGrids,
  isRunActive,
  type GenerationRun,
} from '../domain/generation-run.ts';
import type { Placement } from '../domain/grid.ts';
import { PlanningError } from '../domain/planning.ts';
import { makeGridAccess } from './grid-access.ts';
import type { GenerationRunRepository, GridRepository, PlanningRepository } from './ports.ts';

/** Limites da busca definidos pela configuração; a semente muda a cada solicitação. */
export interface GenerationSettings {
  readonly timeLimitMs: number;
  readonly nodeLimit: number;
  readonly memoryLimitMb: number;
}
const HISTORY_LIMIT = 20;

function notFound(): never {
  throw new NotFoundError('generation.not_found', 'Geração não encontrada.');
}
function totalWindows(diagnosis: ReturnType<typeof diagnoseGrid>): number {
  return diagnosis.teachers.reduce((sum, t) => sum + t.windows, 0);
}

export function makeGenerationRuns(deps: {
  plannings: PlanningRepository;
  grids: GridRepository;
  runs: GenerationRunRepository;
  clock: Clock;
  ids: IdGenerator;
  digest: Digest;
  seeds: SeedGenerator;
  settings: GenerationSettings;
}) {
  const { runs, clock, ids, digest, seeds, settings } = deps;
  const access = makeGridAccess(deps);
  /** Resumo da entrada do motor para a grade e as regras atuais da revisão. */
  function inputOf(translated: TranslatedCatalog, placements: readonly Placement[]) {
    const { snapshot } = gridProposal(translated, placements);
    return { snapshot, digest: digest.of(canonicalJson(snapshot)) };
  }
  async function owned(planningId: string, runId: string) {
    const run = await runs.find(runId);
    return run && run.planningId === planningId ? run : notFound();
  }
  /** Desatualizada: a revisão deixou de ser o rascunho atual ou a entrada mudou. */
  function summary(run: GenerationRun, current: { revisionId: string; digest: string } | null) {
    const { outcome } = run;
    return {
      id: run.id,
      revisionId: run.revisionId,
      status: run.status,
      requestedAt: run.requestedAt,
      requestedBy: run.requestedByUsername,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      attempts: run.attempts,
      cancelRequested: run.cancelRequestedAt !== null,
      options: run.options,
      reason: outcome?.reason ?? null,
      diagnostics: outcome?.diagnostics ?? [],
      warnings: outcome?.warnings ?? [],
      metrics: outcome?.metrics ?? null,
      appliedAt: run.appliedAt,
      appliedBy: run.appliedByUsername,
      stale:
        current === null ||
        current.revisionId !== run.revisionId ||
        current.digest !== run.inputDigest,
    };
  }
  /** Rascunho editável atual, para comparar e aplicar propostas. */
  async function currentDraft(planningId: string) {
    const loaded = await access.load(planningId);
    return loaded.editable
      ? { revisionId: loaded.revision.id, ...inputOf(loaded.translated, loaded.placements) }
      : null;
  }

  return {
    /** Execuções de uma revisão (a atual, se nenhuma for indicada) e a execução ativa. */
    async list(actor: Actor, input: { id: string; revisionId?: string | undefined }) {
      requireRole(actor, READ_ROLES);
      const loaded = await access.load(input.id, input.revisionId);
      const current = await currentDraft(input.id);
      const active = await runs.active(input.id);
      return {
        revisionId: loaded.revision.id,
        editable: loaded.editable,
        active: active ? summary(active, current) : null,
        runs: (await runs.list(loaded.revision.id, HISTORY_LIMIT)).map((r) => summary(r, current)),
      };
    },
    /** Uma execução e, quando há proposta, sua comparação com a grade atual da revisão. */
    async detail(actor: Actor, input: { id: string; runId: string }) {
      requireRole(actor, READ_ROLES);
      const run = await owned(input.id, input.runId);
      const current = await currentDraft(input.id);
      const base = summary(run, current);
      const proposal = run.outcome?.placements;
      if (!proposal) return { run: base, applicable: false, comparison: null };
      const loaded = await access.load(input.id, run.revisionId);
      const { delta, kept } = compareGrids(loaded.placements, proposal);
      const diagnosis = diagnoseGrid(loaded.translated, proposal);
      return {
        run: base,
        applicable:
          !base.stale && run.appliedAt === null && run.status === 'feasible' && loaded.editable,
        comparison: {
          kept,
          added: delta.added.length,
          removed: delta.removed.length,
          placements: proposal,
          diagnosis,
          currentWindows: totalWindows(diagnoseGrid(loaded.translated, loaded.placements)),
          proposalWindows: totalWindows(diagnosis),
        },
      };
    },
    /** Registra a solicitação; o cálculo acontece no worker, fora da requisição. */
    async request(actor: Actor, input: { id: string; version: number; revisionId: string }) {
      requireRole(actor, WRITE_ROLES);
      const loaded = await access.loadDraft(input);
      if (await runs.active(input.id))
        throw new PlanningError(
          'generation.active',
          'Já há uma geração em andamento neste planejamento. Aguarde o resultado ou cancele.',
        );
      const { snapshot, digest: inputDigest } = inputOf(loaded.translated, loaded.placements);
      const run = {
        id: ids.next(),
        planningId: input.id,
        revisionId: loaded.revision.id,
        requestedBy: actor.id,
        requestedAt: clock.now(),
        status: 'queued' as const,
        options: { ...settings, seed: seeds.next() },
        inputDigest,
        attempts: 0,
        cancelRequestedAt: null,
        appliedAt: null,
      };
      await runs.add(run, snapshot);
      return summary(await owned(input.id, run.id), {
        revisionId: run.revisionId,
        digest: inputDigest,
      });
    },
    async cancel(actor: Actor, input: { id: string; runId: string }) {
      requireRole(actor, WRITE_ROLES);
      const run = await owned(input.id, input.runId);
      if (!isRunActive(run.status))
        throw new PlanningError('generation.finished', 'Esta geração já terminou.');
      await runs.cancel(run.id, clock.now());
      return summary(await owned(input.id, run.id), await currentDraft(input.id));
    },
    /**
     * Substitui a grade do rascunho pela proposta, de uma vez e uma única vez. A proposta é
     * conferida de novo contra a grade fixada e as regras atuais.
     */
    async apply(
      actor: Actor,
      input: { id: string; version: number; revisionId: string; runId: string },
    ) {
      requireRole(actor, WRITE_ROLES);
      const loaded = await access.loadDraft(input);
      const run = await owned(input.id, input.runId);
      if (run.revisionId !== loaded.revision.id)
        throw new PlanningError(
          'generation.stale',
          'Esta proposta foi feita para outra revisão. Gere novamente no rascunho atual.',
        );
      if (run.appliedAt)
        throw new PlanningError('generation.applied', 'Esta proposta já foi aplicada.');
      const proposal = run.outcome?.placements;
      if (run.status !== 'feasible' || !proposal)
        throw new PlanningError(
          'generation.not_applicable',
          'Somente uma geração que encontrou uma grade completa pode ser aplicada.',
        );
      if (inputOf(loaded.translated, loaded.placements).digest !== run.inputDigest)
        throw new PlanningError(
          'generation.stale',
          'As aulas fixadas ou as regras mudaram desde a solicitação. Gere novamente.',
        );
      const diagnosis = diagnoseGrid(loaded.translated, proposal);
      if (!isGridComplete(diagnosis)) {
        const [first] = [...diagnosis.model, ...diagnosis.problems, ...diagnosis.pending];
        throw new PlanningError(
          'generation.invalid',
          'A proposta não passou na conferência da grade e não foi aplicada. ' +
            (first?.message ?? ''),
        );
      }
      if (!(await runs.markApplied(run.id, actor.id, clock.now())))
        throw new PlanningError('generation.applied', 'Esta proposta já foi aplicada.');
      const { delta, kept } = compareGrids(loaded.placements, proposal);
      return access.commit(actor, loaded.planning, loaded.revision.id, {
        kind: 'generation',
        summary:
          'Aplicou a geração automática: ' +
          kept +
          (kept === 1 ? ' alocação mantida, ' : ' alocações mantidas, ') +
          delta.added.length +
          (delta.added.length === 1 ? ' nova e ' : ' novas e ') +
          delta.removed.length +
          (delta.removed.length === 1 ? ' retirada.' : ' retiradas.'),
        delta,
        revertsId: null,
      });
    },
  };
}
export type GenerationRuns = ReturnType<typeof makeGenerationRuns>;
