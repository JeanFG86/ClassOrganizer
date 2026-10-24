import { beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../../access/domain/index.ts';
import type { GridOperation, GridSlot, Placement } from '../domain/grid.ts';
import type { Weekday } from '../../../shared/weekdays.ts';
import { makeInMemoryPlanningStore } from '../../../testing/planning-fixture.ts';

import {
  createPlanningTestOperations,
  createGridTestOperations,
} from '../../../testing/use-case-operations.ts';

const editor: Actor = { id: 'editor-a', username: 'editor-test', role: 'editor' };
const viewer: Actor = { ...editor, role: 'viewer' };
const lesson = (entityId: string, weekday: Weekday, periodId: string): GridSlot => ({
  kind: 'lesson',
  entityId,
  weekday,
  periodId,
});
const codes = (issues: readonly { code: string }[]) => issues.map((i) => i.code);

describe('grade manual de um rascunho', () => {
  let store: ReturnType<typeof makeInMemoryPlanningStore>;
  let grid: ReturnType<typeof createGridTestOperations>;
  let plannings: ReturnType<typeof createPlanningTestOperations>;
  let ref: { id: string; version: number; revisionId: string };
  beforeEach(async () => {
    let sequence = 0;
    store = makeInMemoryPlanningStore();
    const deps = {
      clock: { now: () => new Date('2026-01-01T00:00:00.000Z') },
      ids: { next: () => 'id-' + ++sequence },
    };
    plannings = createPlanningTestOperations({
      repository: store.repository,
      grids: store.grids,
      ...deps,
    });
    grid = createGridTestOperations({ plannings: store.repository, grids: store.grids, ...deps });
    const planning = await plannings.create(editor, { name: 'Plano fictício', year: 2027 });
    const revisionId = store.revisions[0]?.id ?? '';
    ref = { id: planning.id, version: 1, revisionId };
  });
  async function apply(operation: GridOperation) {
    const result = await grid.apply(editor, { ...ref, operation });
    ref = { ...ref, version: result.version };
    return result;
  }
  const placements = (): Placement[] => store.placements.get(ref.revisionId) ?? [];

  it('mostra os cadastros aplicáveis, pendências e alertas para consulta', async () => {
    const view = await grid.view(viewer, { id: ref.id });
    expect(view.editable).toBe(true);
    expect(view.timetable.classGroups.map((c) => c.name)).toEqual(['Turma Alfa', 'Turma Beta']);
    expect(view.diagnosis.pending).toHaveLength(4);
    expect(codes(view.diagnosis.alerts)).toEqual(['load.max']);
    expect(view.undo).toBeNull();
  });

  it('prévia não grava; confirmação aplica, versiona e registra o histórico', async () => {
    const operation: GridOperation = { type: 'place', slot: lesson('a1', 1, 'pa1') };
    const preview = await grid.preview(editor, { ...ref, operation });
    expect(preview).toMatchObject({
      accepted: true,
      introduced: [],
      summary: 'Inseriu Disciplina Alfa (Turma Alfa) em segunda, 07:00 (Turno Alfa).',
    });
    expect(placements()).toEqual([]);
    expect(await apply(operation)).toMatchObject({ version: 2 });
    expect(placements()).toEqual([{ ...lesson('a1', 1, 'pa1'), pinned: false }]);
    const view = await grid.view(editor, { id: ref.id });
    expect(view.history).toEqual([
      expect.objectContaining({ sequence: 1, kind: 'operation', actorUsername: 'editor-test' }),
    ]);
    expect(view.diagnosis.classGroups.find((c) => c.classGroupId === 'c1')).toEqual({
      classGroupId: 'c1',
      lessons: 1,
      requiredLessons: 4,
    });
  });

  it('rejeita colisão de professor entre turnos sem alterar a grade', async () => {
    await apply({ type: 'place', slot: lesson('a1', 1, 'pa2') });
    const operation: GridOperation = { type: 'place', slot: lesson('a2', 1, 'pb1') };
    const preview = await grid.preview(editor, { ...ref, operation });
    expect(preview.accepted).toBe(false);
    expect(codes(preview.introduced)).toEqual(['conflict.teacher']);
    await expect(grid.apply(editor, { ...ref, operation })).rejects.toMatchObject({
      code: 'grid.rejected',
      message: expect.stringContaining('Docente Alfa tem atividades sobrepostas na segunda'),
    });
    expect(placements()).toHaveLength(1);
    expect(store.plannings[0]?.version).toBe(2);
  });

  it('confere os dois lados de uma troca e não aplica troca parcial', async () => {
    await apply({ type: 'place', slot: lesson('a1', 1, 'pa1') });
    await apply({ type: 'place', slot: lesson('a2', 2, 'pb1') });
    const before = placements();
    const swap: GridOperation = {
      type: 'swap',
      first: lesson('a1', 1, 'pa1'),
      second: lesson('a2', 2, 'pb1'),
    };
    const preview = await grid.preview(editor, { ...ref, operation: swap });
    // Cada bloco cairia numa aula que não pertence à sua turma.
    expect(codes(preview.introduced)).toEqual(['placement.class_period', 'placement.class_period']);
    await expect(grid.apply(editor, { ...ref, operation: swap })).rejects.toMatchObject({
      code: 'grid.rejected',
      message: expect.stringContaining('Há mais 1 problema.'),
    });
    expect(placements()).toEqual(before);
    await apply({ type: 'place', slot: lesson('a3', 3, 'pa2') });
    await apply({ type: 'swap', first: lesson('a1', 1, 'pa1'), second: lesson('a3', 3, 'pa2') });
    expect(placements()).toEqual(
      expect.arrayContaining([
        { ...lesson('a1', 3, 'pa2'), pinned: false },
        { ...lesson('a3', 1, 'pa1'), pinned: false },
      ]),
    );
  });

  it('respeita indisponibilidade, limite diário e consecutividade', async () => {
    const unavailable = await grid.preview(editor, {
      ...ref,
      operation: { type: 'place', slot: lesson('a1', 5, 'pa1') },
    });
    expect(codes(unavailable.introduced)).toEqual(['teacher.unavailable']);
    await apply({ type: 'place', slot: lesson('a1', 2, 'pa1') });
    const apart = await grid.preview(editor, {
      ...ref,
      operation: { type: 'place', slot: lesson('a1', 2, 'pa3') },
    });
    expect(codes(apart.introduced)).toEqual(['subject.consecutive']);
    await apply({ type: 'place', slot: lesson('a1', 2, 'pa2') });
    const third = await grid.preview(editor, {
      ...ref,
      operation: { type: 'place', slot: lesson('a3', 2, 'pa3') },
    });
    expect(codes(third.introduced)).toContain('subject.daily_limit');
  });

  it('aula fixada só se move depois de desfixada', async () => {
    await apply({ type: 'place', slot: lesson('a1', 1, 'pa1') });
    await apply({ type: 'pin', slot: lesson('a1', 1, 'pa1'), pinned: true });
    const move: GridOperation = {
      type: 'move',
      slot: lesson('a1', 1, 'pa1'),
      weekday: 2,
      periodId: 'pa1',
    };
    await expect(grid.apply(editor, { ...ref, operation: move })).rejects.toMatchObject({
      code: 'grid.pinned',
    });
    await apply({ type: 'pin', slot: lesson('a1', 1, 'pa1'), pinned: false });
    await apply(move);
    expect(placements()).toEqual([{ ...lesson('a1', 2, 'pa1'), pinned: false }]);
  });

  it('desfaz em ordem, registrando novas entradas, sem refazer', async () => {
    await apply({ type: 'place', slot: lesson('a1', 1, 'pa1') });
    await apply({ type: 'move', slot: lesson('a1', 1, 'pa1'), weekday: 3, periodId: 'pa3' });
    const undo = async () => {
      const result = await grid.undo(editor, ref);
      ref = { ...ref, version: result.version };
      return result;
    };
    expect((await undo()).summary).toMatch(/^Desfez: Moveu/);
    expect(placements()).toEqual([{ ...lesson('a1', 1, 'pa1'), pinned: false }]);
    await undo();
    expect(placements()).toEqual([]);
    await expect(grid.undo(editor, ref)).rejects.toMatchObject({ code: 'grid.undo_unavailable' });
    const view = await grid.view(editor, { id: ref.id });
    expect(view.history.map((c) => [c.kind, c.reverted])).toEqual([
      ['operation', true],
      ['operation', true],
      ['undo', false],
      ['undo', false],
    ]);
  });

  it('aceita alteração que não piora uma grade herdada com problemas', async () => {
    store.placements.set(ref.revisionId, [
      { ...lesson('a1', 1, 'pa2'), pinned: false },
      { ...lesson('a2', 1, 'pb1'), pinned: false },
    ]);
    await apply({ type: 'place', slot: lesson('a3', 4, 'pa1') });
    const worse = await grid.preview(editor, {
      ...ref,
      operation: { type: 'place', slot: lesson('a3', 1, 'pa3') },
    });
    expect(worse.accepted).toBe(false);
    const fix = await grid.preview(editor, {
      ...ref,
      operation: { type: 'move', slot: lesson('a2', 1, 'pb1'), weekday: 2, periodId: 'pb1' },
    });
    expect(fix).toMatchObject({ accepted: true, introduced: [] });
    expect(codes(fix.resolved)).toEqual(['conflict.teacher']);
  });

  it('regras novas zeram a conferência e passam a valer no diagnóstico', async () => {
    await apply({ type: 'place', slot: lesson('a1', 1, 'pa1') });
    await apply({ type: 'place', slot: lesson('a1', 1, 'pa2') });
    await plannings.change(editor, {
      ...ref,
      operation: 'review',
      rulesReviewed: true,
      availabilityReviewed: true,
    });
    ref = { ...ref, version: ref.version + 1 };
    const view = await grid.view(editor, { id: ref.id });
    await grid.changeRules(editor, {
      ...ref,
      rules: { ...view.rules, daily: { maxPerDay: 1, consecutive: false } },
    });
    const after = await grid.view(editor, { id: ref.id });
    expect(after.revision.rulesReviewed).toBe(false);
    expect(codes(after.diagnosis.problems)).toEqual(['subject.daily_limit']);
  });

  it('exige versão atual, rascunho atual e perfil de edição', async () => {
    const operation: GridOperation = { type: 'place', slot: lesson('a1', 1, 'pa1') };
    await expect(grid.apply(editor, { ...ref, version: 9, operation })).rejects.toMatchObject({
      code: 'concurrency.stale',
    });
    await expect(grid.apply(viewer, { ...ref, operation })).rejects.toMatchObject({
      code: 'access.forbidden',
    });
    await expect(
      grid.apply(editor, { ...ref, revisionId: 'outra', operation }),
    ).rejects.toMatchObject({ code: 'planning.revision_not_found' });
    const revision = store.revisions[0];
    if (revision) store.revisions[0] = { ...revision, sealedAt: new Date() };
    await expect(grid.apply(editor, { ...ref, operation })).rejects.toMatchObject({
      code: 'planning.sealed',
    });
    expect((await grid.view(viewer, { id: ref.id })).editable).toBe(false);
  });
});
