import { beforeEach, describe, expect, it } from 'vitest';

import { createPlanningTestOperations } from '../../../testing/use-case-operations.ts';
import {
  ArchivePlanning,
  CreatePlanning,
  ListPlannings,
  RestorePlanning,
  ReviewPlanningRevision,
} from './usecases/plannings.ts';
import type { CatalogSnapshot } from '../domain/planning.ts';
import type { Actor } from '../../access/domain/index.ts';
import {
  completeGrid,
  makeCatalogFixture,
  makeInMemoryPlanningStore,
} from '../../../testing/planning-fixture.ts';
const actor: Actor = { id: 'editor-a', username: 'editor-test', role: 'editor' };
const empty: CatalogSnapshot = {
  formatVersion: 1,
  catalogVersion: 1,
  capturedAt: '2026-01-01T00:00:00.000Z',
  subjects: [],
  teachers: [],
  classGroups: [],
  shifts: [],
  assignments: [],
};
describe('planejamentos e revisões', () => {
  let catalog: CatalogSnapshot;
  let store: ReturnType<typeof makeInMemoryPlanningStore>;
  let useCases: ReturnType<typeof createPlanningTestOperations>;
  let sequence: number;
  beforeEach(() => {
    catalog = empty;
    sequence = 0;
    store = makeInMemoryPlanningStore(() => catalog);
    useCases = createPlanningTestOperations({
      repository: store.repository,
      grids: store.grids,
      clock: { now: () => new Date(empty.capturedAt) },
      ids: { next: () => 'id-' + ++sequence },
    });
  });
  async function create() {
    const result = await useCases.create(actor, { name: 'Plano fictício', year: 2027 });
    const revision = store.revisions.at(-1);
    if (!revision) throw new Error('Revisão ausente.');
    return { result, revision };
  }
  async function review(id: string, version: number, revisionId: string) {
    await useCases.change(actor, {
      id,
      version,
      revisionId,
      operation: 'review',
      reviewedItems: ['structure', 'teachers', 'assignments', 'availability', 'rules'],
    });
  }
  it('cria um rascunho com conferências pendentes e regras padrão', async () => {
    const { result, revision } = await create();
    expect(result.version).toBe(1);
    expect(revision).toMatchObject({
      reviewedItems: [],
      sealedAt: null,
      snapshot: empty,
      gridRules: { planningPeriods: 'any_shift', daily: { maxPerDay: 2, consecutive: true } },
    });
  });
  it('cópia preserva dados e exige novas conferências', async () => {
    const { result, revision } = await create();
    await review(result.id, 1, revision.id);
    const copy = await useCases.create(actor, {
      name: 'Cópia fictícia',
      year: 2028,
      sourceId: result.id,
      sourceVersion: 2,
    });
    expect(copy.copiedFromId).toBe(result.id);
    expect(store.revisions.at(-1)).toMatchObject({
      reviewedItems: [],
      snapshot: empty,
    });
  });
  it('não conclui sem conferência e não altera revisão concluída', async () => {
    const { result, revision } = await create();
    const ref = { id: result.id, version: 1, revisionId: revision.id };
    await expect(useCases.change(actor, { ...ref, operation: 'seal' })).rejects.toMatchObject({
      code: 'planning.review_required',
    });
    await review(result.id, 1, revision.id);
    await useCases.change(actor, { ...ref, version: 2, operation: 'seal' });
    await expect(
      useCases.change(actor, { ...ref, version: 3, operation: 'review' }),
    ).rejects.toMatchObject({ code: 'planning.sealed' });
    await useCases.change(actor, { ...ref, version: 3, operation: 'draft' });
    expect(store.revisions.at(-1)).toMatchObject({
      number: 2,
      reviewedItems: [],
    });
  });
  it('conclusão exige grade completa e sem problemas', async () => {
    catalog = makeCatalogFixture();
    const { result, revision } = await create();
    await review(result.id, 1, revision.id);
    const seal = { id: result.id, version: 2, revisionId: revision.id, operation: 'seal' as const };
    await expect(useCases.change(actor, seal)).rejects.toMatchObject({
      code: 'planning.grid_incomplete',
      message: expect.stringContaining('Há 4 pendências'),
    });
    store.placements.set(revision.id, completeGrid());
    await useCases.change(actor, seal);
    expect(store.revisions.at(-1)?.sealedAt).not.toBeNull();
  });
  it('novo rascunho e cópia levam grade e regras, descartando o que deixou de existir', async () => {
    catalog = makeCatalogFixture();
    const { result, revision } = await create();
    store.placements.set(revision.id, completeGrid());
    store.revisions[0] = {
      ...revision,
      gridRules: { ...revision.gridRules, planningPeriods: 'teaching_shifts' },
    };
    await review(result.id, 1, revision.id);
    await useCases.change(actor, {
      id: result.id,
      version: 2,
      revisionId: revision.id,
      operation: 'seal',
    });
    // O bloco a2 deixa de existir nos cadastros atuais.
    catalog = { ...makeCatalogFixture(), catalogVersion: 4 };
    catalog.assignments = catalog.assignments.filter((a) => (a as { id: string }).id !== 'a2');
    await useCases.change(actor, {
      id: result.id,
      version: 3,
      revisionId: revision.id,
      operation: 'draft',
    });
    const next = store.revisions.at(-1);
    if (!next) throw new Error('Rascunho ausente.');
    expect(next.gridRules.planningPeriods).toBe('teaching_shifts');
    expect(store.placements.get(next.id)).toHaveLength(5);
    expect(store.history.filter((c) => c.revisionId === next.id)).toEqual([
      expect.objectContaining({
        kind: 'import',
        sequence: 1,
        summary: expect.stringContaining('5 alocações mantidas, 1 descartada'),
      }),
    ]);
    await useCases.create(actor, {
      name: 'Cópia fictícia',
      year: 2028,
      sourceId: result.id,
      sourceVersion: 4,
    });
    const copied = store.revisions.at(-1);
    expect(copied && store.placements.get(copied.id)).toHaveLength(5);
  });
  it('prepara o ano seguinte com os cadastros atuais e a grade da origem, ou sem a grade', async () => {
    catalog = makeCatalogFixture();
    const { result, revision } = await create();
    store.placements.set(revision.id, completeGrid());
    await review(result.id, 1, revision.id);
    catalog = { ...makeCatalogFixture(), catalogVersion: 7 };
    catalog.assignments = catalog.assignments.filter((a) => (a as { id: string }).id !== 'a2');

    await useCases.create(actor, {
      name: 'Plano do ano seguinte',
      year: 2028,
      sourceId: result.id,
      sourceVersion: 2,
      base: 'current',
    });
    const next = store.revisions.at(-1);
    expect(next).toMatchObject({
      snapshot: { catalogVersion: 7 },
      sourceRevisionId: revision.id,
      reviewedItems: [],
    });
    expect(next && store.placements.get(next.id)).toHaveLength(5);

    await useCases.create(actor, {
      name: 'Plano sem grade',
      year: 2028,
      sourceId: result.id,
      sourceVersion: 2,
      keepGrid: false,
    });
    const empty = store.revisions.at(-1);
    expect(empty).toMatchObject({ snapshot: { catalogVersion: 3 }, sourceRevisionId: revision.id });
    expect(empty && store.placements.get(empty.id)).toBeUndefined();
  });
  it('salva a conferência por item e só conclui com todos os itens conferidos', async () => {
    catalog = makeCatalogFixture();
    const { result, revision } = await create();
    store.placements.set(revision.id, completeGrid());
    const ref = { id: result.id, revisionId: revision.id };
    await useCases.change(actor, {
      ...ref,
      version: 1,
      operation: 'review',
      reviewedItems: ['rules', 'structure'],
    });
    expect(store.revisions.at(-1)?.reviewedItems).toEqual(['structure', 'rules']);
    await expect(
      useCases.change(actor, { ...ref, version: 2, operation: 'seal' }),
    ).rejects.toMatchObject({ code: 'planning.review_required' });
    await expect(
      useCases.change(actor, { ...ref, version: 2, operation: 'review', reviewedItems: ['x'] }),
    ).rejects.toMatchObject({ code: 'planning.review_invalid' });
    await review(result.id, 2, revision.id);
    await useCases.change(actor, { ...ref, version: 3, operation: 'seal' });
    expect(store.revisions.at(-1)?.sealedAt).not.toBeNull();
  });
  it('rejeita versão antiga, revisão de outro planejamento e escrita por consulta', async () => {
    const { result, revision } = await create();
    await expect(
      useCases.change(actor, {
        id: result.id,
        version: 9,
        operation: 'review',
        revisionId: revision.id,
      }),
    ).rejects.toMatchObject({ code: 'concurrency.stale' });
    await expect(
      useCases.change(actor, {
        id: result.id,
        version: 1,
        operation: 'review',
        revisionId: 'other',
      }),
    ).rejects.toMatchObject({ code: 'planning.revision_invalid' });
    await expect(
      useCases.create({ ...actor, role: 'viewer' }, { name: 'Teste', year: 2027 }),
    ).rejects.toMatchObject({ code: 'access.forbidden' });
  });
  it('somente administrador arquiva, preservando revisões', async () => {
    const { result, revision } = await create();
    await expect(
      useCases.change(actor, { id: result.id, version: 1, operation: 'archive' }),
    ).rejects.toMatchObject({ code: 'access.forbidden' });
    await useCases.change(
      { ...actor, role: 'admin' },
      { id: result.id, version: 1, operation: 'archive' },
    );
    await expect(
      useCases.change(actor, {
        id: result.id,
        version: 2,
        revisionId: revision.id,
        operation: 'review',
      }),
    ).rejects.toMatchObject({ code: 'planning.archived' });
    expect(store.revisions).toHaveLength(1);
  });
});

describe('operações de planejamento com dependências mínimas', () => {
  it('cada operação recebe somente as portas que usa', async () => {
    const store = makeInMemoryPlanningStore(() => empty);
    const clock = { now: () => new Date(empty.capturedAt) };
    let sequence = 0;
    const planning = await new CreatePlanning({
      repository: store.repository,
      grids: store.grids,
      clock,
      ids: { next: () => 'id-' + ++sequence },
    }).execute(actor, { name: 'Plano fictício', year: 2027 });
    const revision = store.revisions.at(-1);
    if (!revision) throw new Error('Revisão ausente.');
    const repository = { repository: store.repository };
    const reviewed = await new ReviewPlanningRevision(repository).execute(actor, {
      id: planning.id,
      version: 1,
      revisionId: revision.id,
      reviewedItems: ['structure', 'teachers', 'assignments', 'availability', 'rules'],
    });
    expect(reviewed.version).toBe(2);
    const admin: Actor = { ...actor, role: 'admin' };
    const archived = await new ArchivePlanning({ ...repository, clock }).execute(admin, {
      id: planning.id,
      version: 2,
    });
    expect(archived).toMatchObject({ archivedAt: clock.now(), version: 3 });
    const restored = await new RestorePlanning(repository).execute(admin, {
      id: planning.id,
      version: 3,
    });
    expect(restored).toMatchObject({ archivedAt: null, version: 4 });
    expect(await new ListPlannings(repository).execute(actor)).toHaveLength(1);
  });
});
