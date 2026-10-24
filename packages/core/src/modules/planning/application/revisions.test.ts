import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeCatalogFixture,
  makeInMemoryPlanningStore,
  completeGrid,
} from '../../../testing/planning-fixture.ts';
import { CreatePlanning } from './usecases/plannings.ts';
import {
  ComparePlanningRevisions,
  RenamePlanningRevision,
  RestorePlanningRevision,
  PreservePlanningRevision,
} from './usecases/revisions.ts';
import { PlanningRevisionEntity } from '../domain/planning.ts';
import type { Actor } from '../../access/domain/index.ts';

const actor: Actor = { id: 'editor-a', username: 'editor-test', role: 'editor' };
const viewer: Actor = { ...actor, role: 'viewer' };
const clock = { now: () => new Date('2026-01-01T00:00:00Z') };
describe('versões de planejamento', () => {
  let store: ReturnType<typeof makeInMemoryPlanningStore>;
  let deps: ConstructorParameters<typeof RestorePlanningRevision>[0];
  beforeEach(() => {
    store = makeInMemoryPlanningStore();
    let sequence = 0;
    deps = {
      repository: store.repository,
      grids: store.grids,
      clock,
      ids: { next: () => 'version-' + ++sequence },
    };
  });
  async function create() {
    const planning = await new CreatePlanning(deps).execute(actor, {
      name: 'Plano inventado',
      year: 2027,
    });
    const first = store.revisions.at(-1);
    if (!first) throw new Error('Revisão ausente.');
    store.placements.set(first.id, completeGrid());
    return { planning, first };
  }
  async function history() {
    const { planning, first } = await create();
    const sealed = PlanningRevisionEntity.reconstitute(first)
      .review(true, true)
      .seal(clock.now())
      .snapshot();
    store.revisions[0] = sealed;
    const second = PlanningRevisionEntity.open({
      id: 'next',
      planningId: planning.id,
      number: 2,
      snapshot: { ...makeCatalogFixture(), catalogVersion: 9, subjects: [] },
      gridRules: { ...first.gridRules, planningPeriods: 'teaching_shifts' },
      createdAt: clock.now(),
      createdBy: actor.id,
    }).snapshot();
    await store.repository.save(planning, second);
    return { planning: { ...planning, version: 2 }, first: sealed, second };
  }
  it('nomeia uma revisão concluída sem mudar dados, conferências ou grade', async () => {
    const { planning, first } = await history();
    const result = await new RenamePlanningRevision(deps).execute(actor, {
      id: planning.id,
      version: 2,
      revisionId: first.id,
      name: '  Grade aprovada  ',
    });
    expect(result.version).toBe(3);
    expect(store.revisions[0]).toEqual({ ...first, name: 'Grade aprovada' });
    expect(store.placements.get(first.id)).toEqual(completeGrid());
    await new RenamePlanningRevision(deps).execute(actor, {
      id: planning.id,
      version: 3,
      revisionId: first.id,
      name: '  ',
    });
    expect(store.revisions[0]?.name).toBeNull();
  });
  it('preserva uma versão intermediária sem aprovar a grade e recusa preservar uma revisão histórica', async () => {
    const { planning, first } = await create();
    const result = await new PreservePlanningRevision(deps).execute(actor, {
      id: planning.id,
      version: 1,
      revisionId: first.id,
    });
    expect(result.version).toBe(2);
    expect(store.revisions[0]).toEqual(first);
    expect(store.revisions[1]).toMatchObject({
      number: 2,
      snapshot: first.snapshot,
      restoredFromId: null,
      sealedAt: null,
      rulesReviewed: false,
    });
    expect(store.placements.get(result.revisionId)).toEqual(completeGrid());
    await expect(
      new PreservePlanningRevision(deps).execute(actor, {
        id: planning.id,
        version: 2,
        revisionId: first.id,
      }),
    ).rejects.toMatchObject({ code: 'planning.revision_invalid' });
  });
  it('restaura exatamente a fotografia, regras e fixações sem consultar a base atual ou sobrescrever o rascunho', async () => {
    const { planning, first, second } = await history();
    const before = structuredClone(store.revisions);
    const result = await new RestorePlanningRevision({
      ...deps,
      repository: {
        ...deps.repository,
        capture: async () => {
          throw new Error('Não pode consultar os cadastros atuais.');
        },
      },
    }).execute(actor, { id: planning.id, version: planning.version, revisionId: first.id });
    expect(result.version).toBe(3);
    expect(store.revisions.slice(0, 2)).toEqual(before);
    expect(store.revisions.at(-1)).toMatchObject({
      number: 3,
      restoredFromId: first.id,
      name: null,
      snapshot: first.snapshot,
      gridRules: first.gridRules,
      rulesReviewed: false,
      availabilityReviewed: false,
      sealedAt: null,
    });
    expect(store.placements.get(result.revisionId)).toEqual(completeGrid());
    expect(store.placements.get(second.id)).toBeUndefined();
    expect(store.history.at(-1)).toMatchObject({
      kind: 'import',
      revisionId: result.revisionId,
      actorId: actor.id,
      sequence: 1,
    });
    const restored = store.revisions.at(-1);
    if (restored) restored.snapshot.subjects.length = 0;
    expect(first.snapshot.subjects).toHaveLength(2);
  });
  it('compara horário, fixação, cadastros e regras nas duas direções, sem escrever', async () => {
    const { planning, first, second } = await history();
    const before = completeGrid();
    const placement = before[0];
    if (!placement) throw new Error('Alocação ausente.');
    // Uma alteração de fixação ocupa o mesmo horário, mas entra na comparação.
    store.placements.set(second.id, [{ ...placement, pinned: !placement.pinned }]);
    const compare = new ComparePlanningRevisions(deps);
    const result = await compare.execute(viewer, {
      id: planning.id,
      fromRevisionId: first.id,
      toRevisionId: second.id,
    });
    expect(result).toMatchObject({ version: 2, kept: 0, rulesChanged: true });
    expect(result.removed).toHaveLength(before.length);
    expect(result.added).toHaveLength(1);
    expect(result.catalogChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'Disciplina', kind: 'removed' }),
      ]),
    );
    const reverse = await compare.execute(viewer, {
      id: planning.id,
      fromRevisionId: second.id,
      toRevisionId: first.id,
    });
    expect(reverse.added).toEqual(result.removed);
    expect(reverse.removed).toEqual(result.added);
    expect(store.plannings[0]?.version).toBe(2);
    expect(store.history).toEqual([]);
  });
  it('comparar uma revisão com ela mesma não produz alterações', async () => {
    const { planning, first } = await create();
    expect(
      await new ComparePlanningRevisions(deps).execute(actor, {
        id: planning.id,
        fromRevisionId: first.id,
        toRevisionId: first.id,
      }),
    ).toMatchObject({
      kept: completeGrid().length,
      removed: [],
      added: [],
      catalogChanges: [],
      rulesChanged: false,
    });
  });
  it('recusa comparação se a grade mudar durante a leitura', async () => {
    const { planning, first } = await create();
    let reads = 0;
    const repository = {
      ...deps.repository,
      find: async () => ({ ...planning, version: ++reads }),
    };
    await expect(
      new ComparePlanningRevisions({ ...deps, repository }).execute(actor, {
        id: planning.id,
        fromRevisionId: first.id,
        toRevisionId: first.id,
      }),
    ).rejects.toMatchObject({ code: 'concurrency.stale' });
  });
  it('recusa versão antiga, leitura sem sessão e escrita por consulta', async () => {
    const { planning, first } = await create();
    const input = { id: planning.id, revisionId: first.id, version: 9, name: 'Nome' };
    await expect(new RenamePlanningRevision(deps).execute(actor, input)).rejects.toMatchObject({
      code: 'concurrency.stale',
    });
    await expect(
      new RestorePlanningRevision(deps).execute(viewer, { ...input, version: 1 }),
    ).rejects.toMatchObject({ code: 'access.forbidden' });
    await expect(new RenamePlanningRevision(deps).execute(viewer, input)).rejects.toMatchObject({
      code: 'access.forbidden',
    });
    await expect(
      new ComparePlanningRevisions(deps).execute(null as unknown as Actor, {
        id: planning.id,
        fromRevisionId: first.id,
        toRevisionId: first.id,
      }),
    ).rejects.toMatchObject({ code: 'access.session_required' });
  });
  it('recusa revisão de outro planejamento, revisão atual e planejamento arquivado', async () => {
    const { planning, first } = await create();
    const other = await new CreatePlanning(deps).execute(actor, {
      name: 'Outro plano inventado',
      year: 2028,
    });
    const input = { id: planning.id, version: 1, revisionId: first.id };
    await expect(new RestorePlanningRevision(deps).execute(actor, input)).rejects.toMatchObject({
      code: 'planning.restore_current',
    });
    await expect(
      new RestorePlanningRevision(deps).execute(actor, { ...input, id: other.id }),
    ).rejects.toMatchObject({ code: 'planning.revision_not_found' });
    await expect(
      new ComparePlanningRevisions(deps).execute(actor, {
        id: other.id,
        fromRevisionId: first.id,
        toRevisionId: first.id,
      }),
    ).rejects.toMatchObject({ code: 'planning.revision_not_found' });
    await store.repository.save({ ...planning, archivedAt: clock.now() });
    await expect(
      new RestorePlanningRevision(deps).execute(actor, { ...input, version: 2 }),
    ).rejects.toMatchObject({ code: 'planning.archived' });
    await expect(
      new RenamePlanningRevision(deps).execute(actor, { ...input, version: 2, name: 'Nome' }),
    ).rejects.toMatchObject({ code: 'planning.archived' });
  });
  it('nome longo é recusado também fora do HTTP', async () => {
    const { planning, first } = await create();
    await expect(
      new RenamePlanningRevision(deps).execute(actor, {
        id: planning.id,
        version: 1,
        revisionId: first.id,
        name: 'x'.repeat(101),
      }),
    ).rejects.toMatchObject({ code: 'planning.revision_name_invalid', kind: 'validation' });
    expect(store.plannings[0]?.version).toBe(1);
  });
});
