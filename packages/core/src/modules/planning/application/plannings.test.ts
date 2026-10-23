import { beforeEach, describe, expect, it } from 'vitest';
import { makePlannings, type PlanningRepository } from './plannings.ts';
import type { CatalogSnapshot, Planning, PlanningRevision } from '../domain/planning.ts';
import type { Actor } from '../../access/domain/access.ts';
const actor: Actor = { id: 'editor-a', username: 'editor-test', role: 'editor' };
const snapshot: CatalogSnapshot = {
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
  let items: Planning[];
  let revisions: PlanningRevision[];
  let useCases: ReturnType<typeof makePlannings>;
  let sequence: number;
  beforeEach(() => {
    items = [];
    revisions = [];
    sequence = 0;
    const repository: PlanningRepository = {
      list: async () => structuredClone(items),
      find: async (id) => structuredClone(items.find((p) => p.id === id) ?? null),
      revisions: async (id) => structuredClone(revisions.filter((r) => r.planningId === id)),
      add: async (planning, revision) => {
        items.push(structuredClone(planning));
        revisions.push(structuredClone(revision));
      },
      save: async (planning, revision) => {
        const index = items.findIndex((p) => p.id === planning.id);
        items[index] = { ...planning, version: planning.version + 1 };
        if (revision) {
          const index = revisions.findIndex((r) => r.id === revision.id);
          if (index < 0) revisions.push(structuredClone(revision));
          else revisions[index] = structuredClone(revision);
        }
      },
      capture: async () => structuredClone(snapshot),
    };
    useCases = makePlannings({
      repository,
      clock: { now: () => new Date(snapshot.capturedAt) },
      ids: { next: () => 'id-' + ++sequence },
    });
  });
  async function create() {
    const result = await useCases.create(actor, { name: 'Plano fictício', year: 2027 });
    const revision = revisions.at(-1);
    if (!revision) throw new Error('Revisão ausente.');
    return { result, revision };
  }
  it('cria um rascunho com conferências pendentes', async () => {
    const { result, revision } = await create();
    expect(result.version).toBe(1);
    expect(revision).toMatchObject({
      rulesReviewed: false,
      availabilityReviewed: false,
      sealedAt: null,
      snapshot,
    });
  });
  it('cópia preserva dados e exige novas conferências', async () => {
    const { result, revision } = await create();
    await useCases.change(actor, {
      id: result.id,
      version: 1,
      revisionId: revision.id,
      operation: 'review',
      rulesReviewed: true,
      availabilityReviewed: true,
    });
    const copy = await useCases.create(actor, {
      name: 'Cópia fictícia',
      year: 2028,
      sourceId: result.id,
      sourceVersion: 2,
    });
    expect(copy.copiedFromId).toBe(result.id);
    expect(revisions.at(-1)).toMatchObject({
      rulesReviewed: false,
      availabilityReviewed: false,
      snapshot,
    });
  });
  it('não conclui sem conferência e não altera revisão concluída', async () => {
    const { result, revision } = await create();
    const ref = { id: result.id, version: 1, revisionId: revision.id };
    await expect(useCases.change(actor, { ...ref, operation: 'seal' })).rejects.toMatchObject({
      code: 'planning.review_required',
    });
    await useCases.change(actor, {
      ...ref,
      operation: 'review',
      rulesReviewed: true,
      availabilityReviewed: true,
    });
    await useCases.change(actor, { ...ref, version: 2, operation: 'seal' });
    await expect(
      useCases.change(actor, { ...ref, version: 3, operation: 'review' }),
    ).rejects.toMatchObject({ code: 'planning.sealed' });
    await useCases.change(actor, { ...ref, version: 3, operation: 'draft' });
    expect(revisions.at(-1)).toMatchObject({
      number: 2,
      rulesReviewed: false,
      availabilityReviewed: false,
    });
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
    expect(revisions).toHaveLength(1);
  });
});
