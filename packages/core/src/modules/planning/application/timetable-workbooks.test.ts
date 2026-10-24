import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '../../access/domain/index.ts';
import { makeInMemoryPlanningStore, completeGrid } from '../../../testing/planning-fixture.ts';
import { CreatePlanning } from './usecases/plannings.ts';
import { ExportTimetableWorkbook } from './usecases/timetable-workbooks.ts';
import type { TimetableWorkbookWriter } from './ports/index.ts';
const actor: Actor = { id: 'editor-a', username: 'editor-test', role: 'editor' };
const clock = { now: () => new Date('2026-01-01T00:00:00Z') };
describe('exportação da revisão em planilha', () => {
  let store: ReturnType<typeof makeInMemoryPlanningStore>;
  let input: { id: string; revisionId: string; version: number };
  const write = vi.fn<TimetableWorkbookWriter['write']>(async () => new Uint8Array([80, 75, 3, 4]));
  beforeEach(async () => {
    write.mockClear();
    store = makeInMemoryPlanningStore();
    let sequence = 0;
    const plan = await new CreatePlanning({
      repository: store.repository,
      grids: store.grids,
      clock,
      ids: { next: () => 'export-' + ++sequence },
    }).execute(actor, { name: 'Plano inventado', year: 2027 });
    const revision = store.revisions[0];
    if (!revision) throw new Error('Revisão ausente.');
    store.placements.set(revision.id, completeGrid());
    input = { id: plan.id, revisionId: revision.id, version: 1 };
  });
  function useCase() {
    return new ExportTimetableWorkbook({
      plannings: store.repository,
      grids: store.grids,
      clock,
      workbooks: { write },
    });
  }
  it('prepara horários e cargas sem duplicar blocos compartilhados na turma', async () => {
    const result = await useCase().execute({ ...actor, role: 'viewer' }, input);
    expect(result.fileName).toContain('-revisao-1-v1.xlsx');
    const data = write.mock.calls[0]?.[0];
    expect(data).toMatchObject({
      planning: { name: 'Plano inventado' },
      revision: { id: input.revisionId, sealedAt: null },
      capturedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(data?.schedules).toHaveLength(6);
    expect(data?.schedules.filter((s) => s.kind === 'planning')).toHaveLength(1);
    expect(data?.classGroups.find((c) => c.name === 'Turma Alfa')).toMatchObject({
      assigned: 4,
      required: 4,
      placed: 4,
    });
    expect(data?.teachers.find((t) => t.name === 'Docente Alfa')).toMatchObject({
      required: 5,
      placed: 5,
      requiredPlanning: 1,
      placedPlanning: 1,
      maxWeeklyLessons: null,
    });
    expect(data?.schedules.find((s) => s.subjects.length === 2)?.teachers).toEqual([
      'Docente Beta',
      'Docente Alfa',
    ]);
    expect(store.plannings[0]?.version).toBe(1);
    expect(store.history).toEqual([]);
  });
  it('mostra cargas cadastradas fora da modelagem em vez de descartá-las', async () => {
    store.revisions[0]?.snapshot.assignments.push({
      id: 'block-without-periods',
      classGroupId: 'c4',
      participants: [{ teacherId: 't1', subjectId: 's1' }],
      weeklyLessons: 7,
    });
    await useCase().execute(actor, input);
    const data = write.mock.calls[0]?.[0];
    expect(data?.classGroups.find((c) => c.name === 'Turma sem turno')).toMatchObject({
      assigned: 7,
      required: 0,
      placed: 0,
      configured: false,
    });
    expect(data?.teachers.find((t) => t.name === 'Docente Alfa')).toMatchObject({
      assigned: 12,
      required: 5,
    });
    expect(data?.assignments.find((a) => a.id === 'block-without-periods')).toMatchObject({
      applicable: false,
      weeklyLessons: 7,
    });
  });
  it('recusa versão antiga, revisão inexistente e perfil inválido sem gerar arquivo', async () => {
    await expect(useCase().execute(actor, { ...input, version: 99 })).rejects.toMatchObject({
      code: 'concurrency.stale',
    });
    await expect(useCase().execute(actor, { ...input, revisionId: 'other' })).rejects.toMatchObject(
      { code: 'planning.revision_not_found' },
    );
    await expect(
      useCase().execute({ ...actor, role: 'other' } as unknown as Actor, input),
    ).rejects.toMatchObject({ code: 'access.forbidden' });
    expect(write).not.toHaveBeenCalled();
  });
  it('não gera uma planilha de leitura misturada com edição concorrente', async () => {
    const find = store.repository.find;
    let reads = 0;
    store.repository.find = async (id) => {
      const plan = await find(id);
      return plan ? { ...plan, version: ++reads } : null;
    };
    await expect(useCase().execute(actor, input)).rejects.toMatchObject({
      code: 'concurrency.stale',
    });
    expect(write).not.toHaveBeenCalled();
  });
});
