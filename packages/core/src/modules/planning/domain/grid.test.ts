import { describe, expect, it } from 'vitest';
import { completeGrid, makeCatalogFixture } from '../../../testing/planning-fixture.ts';
import { translateCatalog } from './catalog-translation.ts';
import { diagnoseGrid, isGridComplete, issuesAdded } from './diagnosis.ts';
import {
  DEFAULT_GRID_RULES,
  applyDelta,
  invertDelta,
  operationDelta,
  validateGridRules,
  type GridSlot,
  type Placement,
} from './grid.ts';
import { describeOperation } from './grid-summary.ts';

const lesson = (entityId: string, weekday: 1 | 2 | 3 | 4 | 5, periodId: string): GridSlot => ({
  kind: 'lesson',
  entityId,
  weekday,
  periodId,
});
const placed = (slot: GridSlot, pinned = false): Placement => ({ ...slot, pinned });
const translated = () => translateCatalog(makeCatalogFixture(), DEFAULT_GRID_RULES, 'revision-1');
const codes = (issues: readonly { code: string }[]) => issues.map((i) => i.code);

describe('operações da grade', () => {
  it('inserir, mover, trocar, remover e fixar viram deltas atômicos', () => {
    const grid = [placed(lesson('a1', 1, 'pa1')), placed(lesson('a3', 2, 'pa2'))];
    expect(operationDelta(grid, { type: 'place', slot: lesson('a1', 3, 'pa1') })).toEqual({
      removed: [],
      added: [placed(lesson('a1', 3, 'pa1'))],
    });
    const move = operationDelta(grid, {
      type: 'move',
      slot: lesson('a1', 1, 'pa1'),
      weekday: 4,
      periodId: 'pa3',
    });
    expect(applyDelta(grid, move)).toContainEqual(placed(lesson('a1', 4, 'pa3')));
    const swap = operationDelta(grid, {
      type: 'swap',
      first: lesson('a1', 1, 'pa1'),
      second: lesson('a3', 2, 'pa2'),
    });
    expect(applyDelta(grid, swap)).toEqual([
      placed(lesson('a1', 2, 'pa2')),
      placed(lesson('a3', 1, 'pa1')),
    ]);
    expect(applyDelta(applyDelta(grid, swap), invertDelta(swap))).toEqual(
      expect.arrayContaining(grid),
    );
    const pin = operationDelta(grid, { type: 'pin', slot: lesson('a1', 1, 'pa1'), pinned: true });
    expect(applyDelta(grid, pin)).toContainEqual(placed(lesson('a1', 1, 'pa1'), true));
    expect(
      applyDelta(grid, operationDelta(grid, { type: 'remove', slot: lesson('a3', 2, 'pa2') })),
    ).toEqual([placed(lesson('a1', 1, 'pa1'))]);
  });

  it('rejeita duplicidade, ausência, aula fixada e operação sem efeito', () => {
    const grid = [
      placed(lesson('a1', 1, 'pa1'), true),
      placed(lesson('a1', 2, 'pa1')),
      placed(lesson('a1', 3, 'pa1')),
    ];
    expect(() => operationDelta(grid, { type: 'place', slot: lesson('a1', 2, 'pa1') })).toThrow(
      expect.objectContaining({ code: 'grid.duplicate' }),
    );
    expect(() => operationDelta(grid, { type: 'remove', slot: lesson('a1', 5, 'pa1') })).toThrow(
      expect.objectContaining({ code: 'grid.slot_missing' }),
    );
    for (const operation of [
      { type: 'remove', slot: lesson('a1', 1, 'pa1') },
      { type: 'move', slot: lesson('a1', 1, 'pa1'), weekday: 4, periodId: 'pa1' },
      { type: 'swap', first: lesson('a1', 2, 'pa1'), second: lesson('a1', 1, 'pa1') },
    ] as const)
      expect(() => operationDelta(grid, operation)).toThrow(
        expect.objectContaining({ code: 'grid.pinned' }),
      );
    // Trocar duas aulas do mesmo bloco não muda a grade.
    expect(() =>
      operationDelta(grid, {
        type: 'swap',
        first: lesson('a1', 2, 'pa1'),
        second: lesson('a1', 3, 'pa1'),
      }),
    ).toThrow(expect.objectContaining({ code: 'grid.no_change' }));
    expect(() =>
      applyDelta(grid, { removed: [placed(lesson('a1', 1, 'pa1'))], added: [] }),
    ).toThrow(expect.objectContaining({ code: 'grid.slot_missing' }));
  });

  it('valida as regras configuráveis', () => {
    expect(validateGridRules(DEFAULT_GRID_RULES)).toEqual(DEFAULT_GRID_RULES);
    const exception = { classGroupId: 'c1', subjectId: 's1', maxPerDay: 1, consecutive: false };
    expect(
      validateGridRules({ ...DEFAULT_GRID_RULES, dailyExceptions: [exception] }).dailyExceptions,
    ).toEqual([exception]);
    for (const invalid of [
      { ...DEFAULT_GRID_RULES, daily: { maxPerDay: 3, consecutive: true } },
      { ...DEFAULT_GRID_RULES, planningPeriods: 'outro' },
      { ...DEFAULT_GRID_RULES, dailyExceptions: [exception, exception] },
      { ...DEFAULT_GRID_RULES, formatVersion: 2 },
    ])
      expect(() => validateGridRules(invalid)).toThrow(
        expect.objectContaining({ code: 'grid.rules_invalid' }),
      );
  });
});

describe('tradução da fotografia para o validador', () => {
  it('seleciona apenas os registros aplicáveis', () => {
    const { timetable, shifts } = translated();
    expect(shifts.map((s) => s.id)).toEqual(['shift-a', 'shift-b']);
    expect(timetable.classGroups.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(timetable.teachers.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(timetable.assignments.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
    // Indisponibilidade em turno arquivado não entra; a do turno ativo permanece.
    expect(timetable.teachers[0]?.unavailable).toEqual([{ weekday: 5, periodId: 'pa1' }]);
    expect(timetable.sourceRevision).toBe('revision-1');
    expect(timetable.subjectRules).toContainEqual({
      classGroupId: 'c1',
      subjectId: 's2',
      maxPerDay: 2,
      consecutive: true,
    });
  });

  it('durações diferentes contam como uma aula cada (regra de equivalência)', () => {
    expect(translated().timetable.lessonMinutes).toBeNull();
    const catalog = makeCatalogFixture();
    catalog.shifts = catalog.shifts.filter((s) => (s as { id: string }).id === 'shift-a');
    catalog.classGroups = catalog.classGroups.filter((c) => (c as { id: string }).id === 'c1');
    expect(translateCatalog(catalog, DEFAULT_GRID_RULES, 'r').timetable.lessonMinutes).toBe(50);
  });

  it('leva os recursos ativos dos blocos e acusa um recurso usado duas vezes no horário', () => {
    expect(translated().timetable.resources).toEqual([]);
    expect(translated().timetable.assignments.every((a) => a.resourceIds.length === 0)).toBe(true);
    const catalog = makeCatalogFixture();
    catalog.resources = [
      { id: 'lab', name: 'Laboratório', archivedAt: null },
      { id: 'old', name: 'Sala antiga', archivedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const block = (id: string) =>
      catalog.assignments.find((a) => (a as { id: string }).id === id) as {
        resourceIds?: string[];
      };
    // A turma de a4 é arquivada na fixture; aqui ela volta para dividir o horário com a1.
    for (const c of catalog.classGroups as { id: string; archivedAt: string | null }[])
      if (c.id === 'c3') c.archivedAt = null;
    block('a1').resourceIds = ['lab'];
    block('a4').resourceIds = ['lab', 'old'];
    const withLab = translateCatalog(catalog, DEFAULT_GRID_RULES, 'r');
    expect(withLab.timetable.resources).toEqual([{ id: 'lab', name: 'Laboratório' }]);
    expect(withLab.timetable.assignments.find((a) => a.id === 'a4')?.resourceIds).toEqual(['lab']);
    const diagnosis = diagnoseGrid(withLab, [
      placed(lesson('a1', 1, 'pa1')),
      placed(lesson('a4', 1, 'pa1')),
    ]);
    expect(codes(diagnosis.problems)).toEqual(['conflict.resource']);
    expect(diagnosis.problems[0]?.message).toContain('O recurso Laboratório');
  });

  it('aplica a política de hora-atividade e as exceções diárias', () => {
    const catalog = makeCatalogFixture();
    const t2 = catalog.teachers[1] as { planningPeriods: number };
    t2.planningPeriods = 1;
    const rules = {
      ...DEFAULT_GRID_RULES,
      planningPeriods: 'teaching_shifts' as const,
      dailyExceptions: [
        { classGroupId: 'c1', subjectId: 's1', maxPerDay: 1 as const, consecutive: false },
      ],
    };
    const { timetable } = translateCatalog(catalog, rules, 'r');
    expect(timetable.teachers.find((t) => t.id === 't2')?.planningPeriodIds).toEqual([
      'pa1',
      'pa2',
      'pa3',
    ]);
    expect(timetable.teachers.find((t) => t.id === 't1')?.planningPeriodIds).toHaveLength(5);
    expect(timetable.subjectRules).toContainEqual({
      classGroupId: 'c1',
      subjectId: 's1',
      maxPerDay: 1,
      consecutive: false,
    });
  });

  it('recusa fotografia em formato desconhecido', () => {
    const catalog = makeCatalogFixture();
    catalog.shifts = [{ id: 1 }];
    expect(() => translateCatalog(catalog, DEFAULT_GRID_RULES, 'r')).toThrow(
      expect.objectContaining({ code: 'planning.snapshot_invalid' }),
    );
  });
});

describe('diagnóstico da grade', () => {
  it('grade vazia tem pendências, alerta de carga e nenhum conflito', () => {
    const diagnosis = diagnoseGrid(translated(), []);
    expect(diagnosis.model).toEqual([]);
    expect(diagnosis.problems).toEqual([]);
    expect(codes(diagnosis.pending)).toEqual([
      'load.lessons',
      'load.lessons',
      'load.lessons',
      'load.planning',
    ]);
    expect(diagnosis.alerts).toEqual([
      expect.objectContaining({ code: 'load.max', entityIds: ['t2'] }),
    ]);
    expect(isGridComplete(diagnosis)).toBe(false);
  });

  it('grade completa conclui; conflitos usam horários reais entre turnos', () => {
    const complete = diagnoseGrid(translated(), completeGrid());
    expect(isGridComplete(complete)).toBe(true);
    expect(complete.teachers.find((t) => t.teacherId === 't1')).toMatchObject({
      lessons: 5,
      requiredLessons: 5,
      planning: 1,
      requiredPlanning: 1,
    });
    // pa2 (07:50–08:40) e pb1 (08:20–09:05) se sobrepõem, embora sejam de turnos diferentes.
    const overlapping = diagnoseGrid(translated(), [
      placed(lesson('a1', 1, 'pa2')),
      placed(lesson('a2', 1, 'pb1')),
    ]);
    expect(codes(overlapping.problems)).toEqual(['conflict.teacher']);
    expect(overlapping.problems[0]?.message).toContain('segunda');
  });

  it('conta janelas do professor no mesmo turno e dia', () => {
    const diagnosis = diagnoseGrid(translated(), [
      placed(lesson('a1', 1, 'pa1')),
      placed(lesson('a1', 1, 'pa3')),
    ]);
    expect(diagnosis.teachers.find((t) => t.teacherId === 't1')?.windows).toBe(1);
  });

  it('compara problemas como multiconjuntos', () => {
    const issue = { code: 'x', message: 'm', entityIds: ['a'] };
    expect(issuesAdded([issue], [issue, issue])).toEqual([issue]);
    expect(issuesAdded([issue, issue], [issue])).toEqual([]);
  });

  it('descreve as operações em português', () => {
    expect(
      describeOperation(translated(), {
        type: 'move',
        slot: lesson('a3', 1, 'pa1'),
        weekday: 2,
        periodId: 'pa2',
      }),
    ).toBe(
      'Moveu Disciplina Alfa + Disciplina Beta (Turma Alfa) de segunda, 07:00 (Turno Alfa) para terça, 07:50 (Turno Alfa).',
    );
  });
});
