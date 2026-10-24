import type { Clock, Digest, IdGenerator, SeedGenerator } from '../../../../shared/ports.ts';
import { NotFoundError } from '../../../../shared/domain-error.ts';
import { READ_ROLES, WRITE_ROLES, requireRole, type Actor } from '../../../access/domain/index.ts';
import {
  gridProposal,
  isKnownSlot,
  type TranslatedCatalog,
} from '../../domain/catalog-translation.ts';
import { diagnoseGrid, isGridComplete } from '../../domain/diagnosis.ts';
import {
  canonicalJson,
  compareGrids,
  isRunActive,
  type GenerationRun,
} from '../../domain/generation-run.ts';
import type { Placement } from '../../domain/grid.ts';
import { PlanningError } from '../../domain/planning.ts';
import {
  PREFERENCE_CRITERIA,
  type PreferenceCriterion,
  type TimetablePreferences,
} from '../../../timetable/domain/index.ts';
import { measurePreferences } from '../../../timetable/domain/index.ts';
import { makeGridAccess } from '../grid-access.ts';
import type {
  GenerationRunRepository,
  GridRepository,
  PlanningRepository,
} from '../ports/index.ts';

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
/** Janelas e repetições de uma grade, medidas como na proposta. */
function preferenceMetricsOf(translated: TranslatedCatalog, placements: readonly Placement[]) {
  const { snapshot, proposal } = gridProposal(translated, placements);
  const { teacherWindows, dailySpread } = measurePreferences(snapshot, proposal);
  return { teacherWindows, dailySpread };
}
function preferenceOrder(order: readonly string[]): PreferenceCriterion[] {
  const known = new Set<string>(PREFERENCE_CRITERIA);
  if (new Set(order).size !== order.length || order.some((c) => !known.has(c)))
    throw new PlanningError(
      'generation.preferences_invalid',
      'Escolha critérios de preferência conhecidos, sem repetir nenhum.',
      'validation',
    );
  return order as PreferenceCriterion[];
}

export type GenerationRunsDependencies = {
  plannings: PlanningRepository;
  grids: GridRepository;
  runs: GenerationRunRepository;
  clock: Clock;
  ids: IdGenerator;
  digest: Digest;
  seeds: SeedGenerator;
  settings: GenerationSettings;
};
function generationRunsContext(deps: GenerationRunsDependencies) {
  const { runs, clock, ids, digest, seeds, settings } = deps;
  const access = makeGridAccess(deps);
  function inputOf(translated: TranslatedCatalog, placements: readonly Placement[]) {
    const { snapshot } = gridProposal(translated, placements);
    return { snapshot, digest: digest.of(canonicalJson(snapshot)) };
  }
  async function owned(planningId: string, runId: string) {
    const run = await runs.find(runId);
    return run && run.planningId === planningId ? run : notFound();
  }
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
  async function currentDraft(planningId: string) {
    const loaded = await access.load(planningId);
    return loaded.editable
      ? { revisionId: loaded.revision.id, ...inputOf(loaded.translated, loaded.placements) }
      : null;
  }
  return {
    deps,
    runs,
    clock,
    ids,
    digest,
    seeds,
    settings,
    access,
    inputOf,
    owned,
    summary,
    currentDraft,
  };
}
export class ListGenerationRuns {
  readonly #deps: GenerationRunsDependencies;
  constructor(deps: GenerationRunsDependencies) {
    this.#deps = deps;
  }
  async execute(actor: Actor, input: { id: string; revisionId?: string | undefined }) {
    const { runs, access, summary, currentDraft } = generationRunsContext(this.#deps);

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
  }
}
export class GetGenerationRun {
  readonly #deps: GenerationRunsDependencies;
  constructor(deps: GenerationRunsDependencies) {
    this.#deps = deps;
  }
  async execute(actor: Actor, input: { id: string; runId: string }) {
    const { access, owned, summary, currentDraft } = generationRunsContext(this.#deps);

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
        preferences: {
          current: preferenceMetricsOf(loaded.translated, loaded.placements),
          proposal: preferenceMetricsOf(loaded.translated, proposal),
        },
      },
    };
  }
}
export class RequestGeneration {
  readonly #deps: GenerationRunsDependencies;
  constructor(deps: GenerationRunsDependencies) {
    this.#deps = deps;
  }
  async execute(
    actor: Actor,
    input: {
      id: string;
      version: number;
      revisionId: string;
      preferences: readonly string[];
    },
  ) {
    const { runs, clock, ids, seeds, settings, access, inputOf, owned, summary } =
      generationRunsContext(this.#deps);

    requireRole(actor, WRITE_ROLES);

    const order = preferenceOrder(input.preferences);

    const loaded = await access.loadDraft(input);

    if (await runs.active(input.id))
      throw new PlanningError(
        'generation.active',
        'Já há uma geração em andamento neste planejamento. Aguarde o resultado ou cancele.',
      );

    const { snapshot, digest: inputDigest } = inputOf(loaded.translated, loaded.placements);

    const free = loaded.placements.filter((p) => !p.pinned && isKnownSlot(loaded.translated, p));

    const preferences: TimetablePreferences = {
      order,
      reference: {
        lessons: free
          .filter((p) => p.kind === 'lesson')
          .map((p) => ({ assignmentId: p.entityId, weekday: p.weekday, periodId: p.periodId })),
        planning: free
          .filter((p) => p.kind === 'planning')
          .map((p) => ({ teacherId: p.entityId, weekday: p.weekday, periodId: p.periodId })),
      },
    };

    const run = {
      id: ids.next(),
      planningId: input.id,
      revisionId: loaded.revision.id,
      requestedBy: actor.id,
      requestedAt: clock.now(),
      status: 'queued' as const,
      options: { ...settings, seed: seeds.next(), preferences: order },
      inputDigest,
      attempts: 0,
      cancelRequestedAt: null,
      appliedAt: null,
    };

    await runs.add(run, { ...snapshot, preferences });

    return summary(await owned(input.id, run.id), {
      revisionId: run.revisionId,
      digest: inputDigest,
    });
  }
}
export class CancelGeneration {
  readonly #deps: GenerationRunsDependencies;
  constructor(deps: GenerationRunsDependencies) {
    this.#deps = deps;
  }
  async execute(actor: Actor, input: { id: string; runId: string }) {
    const { runs, clock, owned, summary, currentDraft } = generationRunsContext(this.#deps);

    requireRole(actor, WRITE_ROLES);

    const run = await owned(input.id, input.runId);

    if (!isRunActive(run.status))
      throw new PlanningError('generation.finished', 'Esta geração já terminou.');

    await runs.cancel(run.id, clock.now());

    return summary(await owned(input.id, run.id), await currentDraft(input.id));
  }
}
export class ApplyGeneration {
  readonly #deps: GenerationRunsDependencies;
  constructor(deps: GenerationRunsDependencies) {
    this.#deps = deps;
  }
  async execute(
    actor: Actor,
    input: { id: string; version: number; revisionId: string; runId: string },
  ) {
    const { runs, clock, access, inputOf, owned } = generationRunsContext(this.#deps);

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
  }
}
