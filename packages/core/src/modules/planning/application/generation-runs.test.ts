import { beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../../access/domain/access.ts';
import { DEFAULT_GRID_RULES, slotKey, type Placement } from '../domain/grid.ts';
import { canonicalJson, compareGrids, proposalPlacements } from '../domain/generation-run.ts';
import {
  completeGrid,
  makeInMemoryGenerationRuns,
  makeInMemoryPlanningStore,
} from '../../../testing/planning-fixture.ts';
import { makeGenerationRuns } from './generation-runs.ts';
import { makePlannings } from './plannings.ts';
import { makeTimetableGrid } from './timetable-grid.ts';

const editor: Actor = { id: 'editor-a', username: 'editor-test', role: 'editor' };
const viewer: Actor = { ...editor, role: 'viewer' };
const settings = { timeLimitMs: 30000, nodeLimit: 2000000, memoryLimitMb: 256 };

describe('domínio da geração', () => {
  it('serializa sem depender da ordem das chaves', () => {
    expect(canonicalJson({ b: [1, { d: 1, c: null }], a: 'x', z: undefined })).toBe(
      canonicalJson({ a: 'x', b: [1, { c: null, d: 1 }] }),
    );
  });
  it('mantém as fixações da entrada ao converter a proposta', () => {
    const placements = proposalPlacements(
      {
        fixedLessons: [{ assignmentId: 'a1', weekday: 1, periodId: 'pa1' }],
        fixedPlanning: [],
      } as never,
      {
        lessons: [
          { assignmentId: 'a1', weekday: 1, periodId: 'pa1' },
          { assignmentId: 'a1', weekday: 2, periodId: 'pa1' },
        ],
        planning: [{ teacherId: 't1', weekday: 5, periodId: 'pa3' }],
      },
    );
    expect(placements.map((p) => p.pinned)).toEqual([true, false, false]);
  });
  it('compara a grade atual com a proposta', () => {
    const [first, second, third] = completeGrid();
    if (!first || !second || !third) throw new Error('fixture incompleta');
    const pinned = { ...third, pinned: true };
    const { delta, kept } = compareGrids([first, pinned], [first, second, third]);
    expect(kept).toBe(1);
    expect(delta).toEqual({ removed: [pinned], added: [second, third] });
  });
});

describe('geração automática de um rascunho', () => {
  let store: ReturnType<typeof makeInMemoryPlanningStore>;
  let generation: ReturnType<typeof makeInMemoryGenerationRuns>;
  let runs: ReturnType<typeof makeGenerationRuns>;
  let grid: ReturnType<typeof makeTimetableGrid>;
  let plannings: ReturnType<typeof makePlannings>;
  let ref: { id: string; version: number; revisionId: string };
  beforeEach(async () => {
    let sequence = 0;
    let seed = 10;
    store = makeInMemoryPlanningStore();
    generation = makeInMemoryGenerationRuns();
    const deps = {
      clock: { now: () => new Date('2026-01-01T00:00:00.000Z') },
      ids: { next: () => 'id-' + ++sequence },
    };
    plannings = makePlannings({ repository: store.repository, grids: store.grids, ...deps });
    grid = makeTimetableGrid({ plannings: store.repository, grids: store.grids, ...deps });
    runs = makeGenerationRuns({
      plannings: store.repository,
      grids: store.grids,
      runs: generation.repository,
      digest: { of: (text) => 'hash:' + text },
      seeds: { next: () => ++seed },
      settings,
      ...deps,
    });
    const planning = await plannings.create(editor, { name: 'Plano fictício', year: 2027 });
    ref = { id: planning.id, version: 1, revisionId: store.revisions[0]?.id ?? '' };
  });
  const placements = (): Placement[] => store.placements.get(ref.revisionId) ?? [];
  /** O worker devolve uma grade completa, respeitando as fixações da entrada. */
  function solve(runId: string, grid = completeGrid()) {
    const input = generation.inputs.get(runId);
    if (!input) throw new Error('entrada ausente');
    generation.finish(runId, {
      status: 'feasible',
      reason: 'solved',
      diagnostics: [],
      placements: proposalPlacements(input, {
        lessons: grid
          .filter((p) => p.kind === 'lesson')
          .map((p) => ({ assignmentId: p.entityId, weekday: p.weekday, periodId: p.periodId })),
        planning: grid
          .filter((p) => p.kind === 'planning')
          .map((p) => ({ teacherId: p.entityId, weekday: p.weekday, periodId: p.periodId })),
      }),
    });
  }

  it('registra a solicitação com limites, semente e entrada; consulta não solicita', async () => {
    await expect(runs.request(viewer, ref)).rejects.toMatchObject({ code: 'access.forbidden' });
    const run = await runs.request(editor, ref);
    expect(run).toMatchObject({
      status: 'queued',
      requestedBy: 'editor-test',
      options: { ...settings, seed: 11 },
      stale: false,
      cancelRequested: false,
    });
    const input = generation.inputs.get(run.id);
    expect(input?.sourceRevision).toBe(ref.revisionId);
    expect(input?.fixedLessons).toEqual([]);
    const list = await runs.list(viewer, { id: ref.id });
    expect(list.active?.id).toBe(run.id);
    expect(list.runs.map((r) => r.id)).toEqual([run.id]);
    expect(placements()).toEqual([]);
  });

  it('aceita uma única execução ativa e exige a versão atual', async () => {
    await runs.request(editor, ref);
    await expect(runs.request(editor, ref)).rejects.toMatchObject({ code: 'generation.active' });
    await expect(runs.request(editor, { ...ref, version: 9 })).rejects.toMatchObject({
      code: 'concurrency.stale',
    });
  });

  it('cancela na fila na hora e recusa cancelar uma execução terminada', async () => {
    const queued = await runs.request(editor, ref);
    expect(await runs.cancel(editor, { id: ref.id, runId: queued.id })).toMatchObject({
      status: 'cancelled',
    });
    await expect(runs.cancel(editor, { id: ref.id, runId: queued.id })).rejects.toMatchObject({
      code: 'generation.finished',
    });
    const running = await runs.request(editor, ref);
    generation.update(running.id, { status: 'running' });
    expect(await runs.cancel(editor, { id: ref.id, runId: running.id })).toMatchObject({
      status: 'running',
      cancelRequested: true,
    });
  });

  it('compara, aplica uma única vez e permite desfazer pelo histórico', async () => {
    const run = await runs.request(editor, ref);
    solve(run.id);
    const detail = await runs.detail(viewer, { id: ref.id, runId: run.id });
    expect(detail).toMatchObject({
      applicable: true,
      comparison: { kept: 0, added: 6, removed: 0 },
    });
    expect(detail.comparison?.diagnosis.pending).toEqual([]);
    await expect(runs.apply(viewer, { ...ref, runId: run.id })).rejects.toMatchObject({
      code: 'access.forbidden',
    });
    const result = await runs.apply(editor, { ...ref, runId: run.id });
    expect(result).toMatchObject({
      version: 2,
      summary: 'Aplicou a geração automática: 0 alocações mantidas, 6 novas e 0 retiradas.',
    });
    expect(placements().map(slotKey).toSorted()).toEqual(completeGrid().map(slotKey).toSorted());
    await expect(runs.apply(editor, { ...ref, version: 2, runId: run.id })).rejects.toMatchObject({
      code: 'generation.applied',
    });
    expect(generation.runs[0]?.appliedAt).not.toBeNull();

    const view = await grid.view(editor, { id: ref.id });
    expect(view.history).toEqual([expect.objectContaining({ kind: 'generation' })]);
    expect(view.undo?.summary).toBe(result.summary);
    await grid.undo(editor, { ...ref, version: 2 });
    expect(placements()).toEqual([]);
  });

  it('preserva as aulas fixadas e mantém o que já estava no lugar', async () => {
    const [first] = completeGrid();
    if (!first) throw new Error('fixture incompleta');
    const slot = {
      kind: first.kind,
      entityId: first.entityId,
      weekday: first.weekday,
      periodId: first.periodId,
    };
    await grid.apply(editor, { ...ref, operation: { type: 'place', slot } });
    await grid.apply(editor, {
      ...ref,
      version: 2,
      operation: { type: 'pin', slot, pinned: true },
    });
    ref = { ...ref, version: 3 };
    const run = await runs.request(editor, ref);
    expect(generation.inputs.get(run.id)?.fixedLessons).toEqual([
      { assignmentId: first.entityId, weekday: first.weekday, periodId: first.periodId },
    ]);
    solve(run.id);
    expect((await runs.detail(editor, { id: ref.id, runId: run.id })).comparison).toMatchObject({
      kept: 1,
      added: 5,
      removed: 0,
    });
    await runs.apply(editor, { ...ref, runId: run.id });
    expect(placements().filter((p) => p.pinned)).toEqual([{ ...first, pinned: true }]);
  });

  it('marca como desatualizada e recusa aplicar quando fixações ou regras mudam', async () => {
    const run = await runs.request(editor, ref);
    solve(run.id);
    const [first] = completeGrid();
    if (!first) throw new Error('fixture incompleta');
    const slot = {
      kind: first.kind,
      entityId: first.entityId,
      weekday: first.weekday,
      periodId: first.periodId,
    };
    await grid.apply(editor, { ...ref, operation: { type: 'place', slot } });
    // Uma aula não fixada a mais não muda a entrada: a proposta continua aplicável.
    expect((await runs.detail(editor, { id: ref.id, runId: run.id })).run.stale).toBe(false);
    await grid.changeRules(editor, {
      ...ref,
      version: 2,
      rules: { ...DEFAULT_GRID_RULES, planningPeriods: 'teaching_shifts' },
    });
    const detail = await runs.detail(editor, { id: ref.id, runId: run.id });
    expect(detail).toMatchObject({ applicable: false, run: { stale: true } });
    await expect(runs.apply(editor, { ...ref, version: 3, runId: run.id })).rejects.toMatchObject({
      code: 'generation.stale',
    });
  });

  it('confere a proposta de novo e não aplica uma grade inválida nem incompleta', async () => {
    const run = await runs.request(editor, ref);
    const broken = completeGrid().map((p, index) =>
      index === 1 ? { ...p, periodId: 'pa1', weekday: 1 as const } : p,
    );
    solve(run.id, broken);
    await expect(runs.apply(editor, { ...ref, runId: run.id })).rejects.toMatchObject({
      code: 'generation.invalid',
    });
    expect(placements()).toEqual([]);
    expect(generation.runs[0]?.appliedAt).toBeNull();
  });

  it('não aplica resultados sem grade completa', async () => {
    const run = await runs.request(editor, ref);
    generation.finish(run.id, {
      status: 'inconclusive',
      reason: 'time_limit',
      placements: null,
      diagnostics: [{ code: 'engine.time_limit', message: 'Prazo esgotado.', entityIds: [] }],
    });
    expect(await runs.detail(editor, { id: ref.id, runId: run.id })).toMatchObject({
      applicable: false,
      comparison: null,
      run: { status: 'inconclusive', reason: 'time_limit' },
    });
    await expect(runs.apply(editor, { ...ref, runId: run.id })).rejects.toMatchObject({
      code: 'generation.not_applicable',
    });
  });

  it('não encontra execuções de outro planejamento', async () => {
    const run = await runs.request(editor, ref);
    const other = await plannings.create(editor, { name: 'Outro plano', year: 2027 });
    await expect(runs.detail(editor, { id: other.id, runId: run.id })).rejects.toMatchObject({
      code: 'generation.not_found',
    });
  });
});
