import { DEFAULT_GRID_RULES, type Placement } from '@classorganizer/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDatabase } from '../../testing/postgres-container.ts';
import type { TestDatabase } from '../../testing/postgres-container.ts';
import { PrismaGridRepository } from './prisma-grid-repository.ts';
import { PrismaPlanningRepository } from './prisma-planning-repository.ts';

const at = new Date('2026-02-01T12:00:00.000Z');
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLANNING = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REVISION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BLOCK = '10000000-0000-4000-8000-000000000001';
const PERIOD = '20000000-0000-4000-8000-000000000001';
const CHANGE = '30000000-0000-4000-8000-000000000001';
const lesson: Placement = {
  kind: 'lesson',
  entityId: BLOCK,
  weekday: 1,
  periodId: PERIOD,
  pinned: false,
};
const snapshot = {
  formatVersion: 1,
  catalogVersion: 1,
  capturedAt: at.toISOString(),
  subjects: [],
  teachers: [],
  classGroups: [],
  shifts: [],
  assignments: [],
};

describe('grade da revisão (PostgreSQL)', () => {
  let testDb: TestDatabase;
  let grids: PrismaGridRepository;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    grids = new PrismaGridRepository(testDb.db);
  });
  afterAll(async () => {
    await testDb?.stop();
  });
  beforeEach(async () => {
    await testDb.truncateAll();
    await testDb.db.appUser.create({
      data: { id: USER, username: 'editor-test', role: 'editor', passwordHash: 'x', createdAt: at },
    });
    await testDb.db.planning.create({
      data: { id: PLANNING, name: 'Plano fictício', year: 2027, createdAt: at },
    });
    await testDb.db.planningRevision.create({
      data: {
        id: REVISION,
        planningId: PLANNING,
        number: 1,
        createdAt: at,
        createdBy: USER,
        snapshot,
      },
    });
  });
  const seal = () =>
    testDb.db.planningRevision.update({
      where: { id: REVISION },
      data: {
        reviewedItems: ['structure', 'teachers', 'assignments', 'availability', 'rules'],
        sealedAt: at,
      },
    });
  const change = (overrides: Record<string, unknown> = {}) => ({
    id: CHANGE,
    revisionId: REVISION,
    sequence: 1,
    actorId: USER,
    occurredAt: at,
    kind: 'operation' as const,
    summary: 'Inseriu uma aula.',
    delta: { removed: [], added: [lesson] },
    revertsId: null,
    ...overrides,
  });

  it('revisões existentes recebem as regras padrão e as regras são relidas', async () => {
    const [revision] = await new PrismaPlanningRepository(testDb.db).revisions(PLANNING);
    expect(revision?.gridRules).toEqual(DEFAULT_GRID_RULES);
  });

  it('aplica deltas, impede alocação repetida e confere a fixação ao remover', async () => {
    await grids.apply(REVISION, { removed: [], added: [lesson] });
    expect(await grids.placements(REVISION)).toEqual([lesson]);
    await expect(grids.apply(REVISION, { removed: [], added: [lesson] })).rejects.toMatchObject({
      code: 'grid.duplicate',
    });
    await expect(
      grids.apply(REVISION, { removed: [{ ...lesson, pinned: true }], added: [] }),
    ).rejects.toMatchObject({ code: 'grid.slot_missing' });
    await grids.apply(REVISION, { removed: [lesson], added: [{ ...lesson, pinned: true }] });
    expect(await grids.placements(REVISION)).toEqual([{ ...lesson, pinned: true }]);
  });

  it('registra o histórico com autor e delta', async () => {
    await grids.record(change());
    expect(await grids.history(REVISION)).toEqual([
      expect.objectContaining({
        sequence: 1,
        actorUsername: 'editor-test',
        delta: { removed: [], added: [lesson] },
      }),
    ]);
  });

  it('o banco impede alterar a grade de uma revisão concluída, mesmo fora do caso de uso', async () => {
    await grids.apply(REVISION, { removed: [], added: [lesson] });
    await seal();
    await expect(
      testDb.db.timetablePlacement.create({
        data: { ...lesson, weekday: 2, revisionId: REVISION },
      }),
    ).rejects.toThrow(/imutável/);
    await expect(
      testDb.db.timetablePlacement.deleteMany({ where: { revisionId: REVISION } }),
    ).rejects.toThrow(/imutável/);
    await expect(
      testDb.db.timetablePlacement.updateMany({
        where: { revisionId: REVISION },
        data: { pinned: true },
      }),
    ).rejects.toThrow(/imutável/);
    await expect(grids.record(change())).rejects.toThrow(/imutável/);
  });

  it('o histórico é somente de acréscimo e desfazer aponta para a mesma revisão', async () => {
    await grids.record(change());
    await expect(
      testDb.db.timetableChange.update({
        where: { id: CHANGE },
        data: { summary: 'Outro texto.' },
      }),
    ).rejects.toThrow(/somente de acréscimo/);
    await expect(testDb.db.timetableChange.delete({ where: { id: CHANGE } })).rejects.toThrow(
      /somente de acréscimo/,
    );
    const undo = '30000000-0000-4000-8000-000000000002';
    await expect(
      grids.record(change({ id: undo, sequence: 2, kind: 'undo', revertsId: undo })),
    ).rejects.toThrow(/mesma revisão/);
    await expect(grids.record(change({ id: undo, sequence: 2, kind: 'undo' }))).rejects.toThrow();
    await grids.record(change({ id: undo, sequence: 2, kind: 'undo', revertsId: CHANGE }));
    await expect(
      grids.record(change({ id: undo.replace('2', '3'), sequence: 2 })),
    ).rejects.toThrow();
  });

  it('CHECKs recusam dia, tipo e regras inválidos', async () => {
    await expect(
      testDb.db.timetablePlacement.create({
        data: { ...lesson, weekday: 6, revisionId: REVISION },
      }),
    ).rejects.toThrow();
    await expect(
      testDb.db.timetablePlacement.create({
        data: { ...lesson, kind: 'outro', revisionId: REVISION },
      }),
    ).rejects.toThrow();
    await expect(
      testDb.db.planningRevision.update({
        where: { id: REVISION },
        data: { gridRules: { formatVersion: 2 } },
      }),
    ).rejects.toThrow();
  });
});
