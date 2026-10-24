import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeCatalogFixture,
  makeInMemoryPlanningStore,
  completeGrid,
} from '../../../testing/planning-fixture.ts';
import type { Actor } from '../../access/domain/index.ts';
import { REVIEW_PENDING_NOTICE } from '../domain/review-items.ts';
import { CreatePlanning } from './usecases/plannings.ts';
import { PreservePlanningRevision } from './usecases/revisions.ts';
import { GetTimetableReport } from './usecases/timetable-reports.ts';
const actor: Actor = { id: 'reader-a', username: 'reader-test', role: 'viewer' };
const clock = { now: () => new Date('2026-02-01T12:00:00Z') };
describe('relatórios da grade', () => {
  let store: ReturnType<typeof makeInMemoryPlanningStore>;
  let planningId: string;
  let revisionId: string;
  beforeEach(async () => {
    store = makeInMemoryPlanningStore();
    let sequence = 0;
    const result = await new CreatePlanning({
      repository: store.repository,
      grids: store.grids,
      clock,
      ids: { next: () => 'report-' + ++sequence },
    }).execute({ ...actor, role: 'editor' }, { name: 'Plano inventado', year: 2027 });
    planningId = result.id;
    const first = store.revisions[0];
    if (!first) throw new Error('Revisão ausente.');
    revisionId = first.id;
    store.placements.set(revisionId, completeGrid());
  });
  function useCase() {
    return new GetTimetableReport({ plannings: store.repository, grids: store.grids, clock });
  }
  it('resolve docência compartilhada, horários reais, recursos, fixações e turma sem configuração', async () => {
    const first = store.revisions[0];
    if (!first) throw new Error('Revisão ausente.');
    first.snapshot.resources = [{ id: 'resource-a', name: 'Espaço inventado', archivedAt: null }];
    const assignment = first.snapshot.assignments.find(
      (a) => a && typeof a === 'object' && !Array.isArray(a) && a['id'] === 'a3',
    );
    if (assignment && typeof assignment === 'object' && !Array.isArray(assignment))
      assignment['resourceIds'] = ['resource-a'];
    const result = await useCase().execute(actor, {
      id: planningId,
      revisionId,
      perspective: 'class',
    });
    expect(result.planning.name).toBe('Plano inventado');
    expect(result.revision).toMatchObject({
      id: revisionId,
      number: 1,
      catalogVersion: 3,
      sealedAt: null,
    });
    expect(result.targets.map((t) => t.id)).toEqual(['c1', 'c2', 'c4']);
    const sheet = result.sheets.find((s) => s.targetId === 'c1');
    expect(sheet?.rows[0]).toMatchObject({
      startMinute: 420,
      endMinute: 470,
      cells: [
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      ],
    });
    const items = sheet?.rows.flatMap((r) => r.cells.flatMap((c) => c.items)) ?? [];
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Disciplina Alfa + Disciplina Beta',
          details: expect.arrayContaining([
            'Docente Alfa',
            'Docente Beta',
            'Recursos: Espaço inventado',
          ]),
        }),
      ]),
    );
    expect(result.sheets.find((s) => s.targetId === 'c4')).toMatchObject({
      rows: [],
      shiftName: 'Sem horários configurados',
    });
    expect(
      result.sheets.flatMap((s) => s.rows.flatMap((r) => r.cells.flatMap((c) => c.items))),
    ).toHaveLength(5);
    expect(result.notices).toContain(REVIEW_PENDING_NOTICE);
  });
  it('cada professor aparece nos blocos compartilhados uma única vez, com HA e indisponibilidade', async () => {
    const first = store.revisions[0];
    const teacher = first?.snapshot.teachers.find(
      (row) => row && typeof row === 'object' && !Array.isArray(row) && row['id'] === 't1',
    );
    if (
      teacher &&
      typeof teacher === 'object' &&
      !Array.isArray(teacher) &&
      Array.isArray(teacher['unavailable'])
    )
      teacher['unavailable'].push({ weekday: 2, periodId: 'pb1' });
    const result = await useCase().execute(actor, {
      id: planningId,
      revisionId,
      perspective: 'teacher',
      entityId: 't1',
    });
    expect(result.sheets).toHaveLength(2);
    expect(
      result.sheets.flatMap((s) => s.rows.flatMap((r) => r.cells.flatMap((c) => c.items))),
    ).toHaveLength(6);
    expect(
      result.sheets.flatMap((s) => s.rows.flatMap((r) => r.cells.flatMap((c) => c.items))),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Hora-atividade' })]));
    expect(result.sheets[0]?.rows[0]?.cells[4]?.unavailable).toBe(true);
    // O período de outro turno termina às 09:05 e cruza a aula que começa às 09:00.
    expect(result.sheets[0]?.rows[2]?.cells[1]?.unavailable).toBe(true);
    expect(result.targets.map((t) => t.id)).not.toContain('t3');
  });
  it('usa os dados históricos e não consulta os cadastros atuais nem altera histórico ou versão', async () => {
    const source = structuredClone(store.revisions[0]);
    await new PreservePlanningRevision({
      repository: store.repository,
      grids: store.grids,
      clock,
      ids: { next: () => 'next-' + Math.random() },
    }).execute({ ...actor, role: 'editor' }, { id: planningId, version: 1, revisionId });
    const result = await useCase().execute(actor, {
      id: planningId,
      revisionId,
      perspective: 'class',
      entityId: 'c1',
    });
    expect(result.revision.historical).toBe(true);
    expect(store.revisions[0]).toEqual(source);
    expect(store.plannings[0]?.version).toBe(2);
    expect(store.history).toHaveLength(1);
    result.sheets[0]?.rows.splice(0);
    expect(store.placements.get(revisionId)).toEqual(completeGrid());
  });
  it('não usa outra revisão como fallback e recusa entidade de outra fotografia', async () => {
    for (const input of [
      { revisionId: 'other', perspective: 'class' as const },
      { revisionId, perspective: 'teacher' as const, entityId: 'c1' },
    ])
      await expect(useCase().execute(actor, { id: planningId, ...input })).rejects.toMatchObject({
        kind: 'not_found',
      });
    await expect(
      useCase().execute({ ...actor, role: 'other' } as unknown as Actor, {
        id: planningId,
        revisionId,
        perspective: 'class',
      }),
    ).rejects.toMatchObject({ code: 'access.forbidden' });
  });
  it('recusa uma leitura misturada com edição concorrente', async () => {
    let reads = 0;
    const find = store.repository.find;
    store.repository.find = async (id) => {
      const planning = await find(id);
      return planning ? { ...planning, version: ++reads } : null;
    };
    await expect(
      useCase().execute(actor, { id: planningId, revisionId, perspective: 'class' }),
    ).rejects.toMatchObject({ code: 'concurrency.stale' });
  });
  it('lida com revisão sem professores ou turmas', async () => {
    const first = store.revisions[0];
    if (!first) throw new Error('Revisão ausente.');
    first.snapshot = { ...makeCatalogFixture(), classGroups: [], teachers: [], assignments: [] };
    store.placements.set(revisionId, []);
    const result = await useCase().execute(actor, {
      id: planningId,
      revisionId,
      perspective: 'class',
    });
    expect(result.targets).toEqual([]);
    expect(result.sheets).toEqual([]);
  });
});
