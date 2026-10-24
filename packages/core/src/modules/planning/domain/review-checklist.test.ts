import { describe, expect, it } from 'vitest';
import { makeCatalogFixture } from '../../../testing/planning-fixture.ts';
import { DEFAULT_GRID_RULES } from './grid.ts';
import { PlanningRevisionEntity, type PlanningRevision } from './planning.ts';
import { reviewChecklist } from './review-checklist.ts';
import { isRevisionReviewed, validReviewedItems, type ReviewItem } from './review-items.ts';

function revision(
  change: (snapshot: ReturnType<typeof makeCatalogFixture>) => void = () => {},
  id = 'r1',
): PlanningRevision {
  const snapshot = makeCatalogFixture();
  change(snapshot);
  return PlanningRevisionEntity.open({
    id,
    planningId: 'p1',
    number: 1,
    snapshot,
    gridRules: DEFAULT_GRID_RULES,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: 'u1',
  }).snapshot();
}
function entry(checklist: ReturnType<typeof reviewChecklist>, item: ReviewItem) {
  const found = checklist.items.find((i) => i.item === item);
  if (!found) throw new Error('Item ausente: ' + item);
  return found;
}

describe('checklist de conferência da revisão', () => {
  it('lista os cinco itens na ordem da conferência, sem referência na primeira revisão', () => {
    const checklist = reviewChecklist(revision(), null);

    expect(checklist.reference).toBeNull();
    expect(checklist.complete).toBe(false);
    expect(checklist.items.map((i) => [i.item, i.title, i.reviewed])).toEqual([
      ['structure', 'Disciplinas, turnos e turmas', false],
      ['teachers', 'Professores e habilitações', false],
      ['assignments', 'Atribuições, cargas e recursos', false],
      ['availability', 'Disponibilidade e hora-atividade', false],
      ['rules', 'Regras da grade', false],
    ]);
    expect(checklist.items.every((i) => i.changes.length === 0)).toBe(true);
  });

  it('aponta dados que ficam fora da grade ou que provavelmente precisam de ajuste', () => {
    const checklist = reviewChecklist(revision(), null);

    expect(entry(checklist, 'structure').attention).toEqual([
      'Turma Turma sem turno não tem turno ou aulas definidos e fica fora da grade.',
    ]);
    expect(entry(checklist, 'teachers').attention).toEqual([
      'Professor Docente Beta tem 2 aulas atribuídas, acima da carga máxima de 1.',
    ]);
    expect(entry(checklist, 'assignments').attention).toEqual([
      'Atribuição Turma arquivada · Disciplina Alfa · Docente Beta fica fora da grade: turma arquivada.',
      'Turma Turma Alfa tem 4 aulas atribuídas para 15 horários na semana.',
      'Turma Turma Beta tem 1 aula atribuída para 10 horários na semana.',
    ]);
    expect(entry(checklist, 'availability').attention).toEqual([]);
    expect(entry(checklist, 'rules').attention).toEqual([]);
  });

  it('acusa professor sem disciplinas, sem atribuições e com disponibilidade insuficiente', () => {
    const checklist = reviewChecklist(
      revision((snapshot) => {
        snapshot.teachers.push({
          id: 't4',
          name: 'Docente Gama',
          subjectIds: [],
          maxWeeklyLessons: null,
          planningPeriods: 0,
          unavailable: [],
          archivedAt: null,
        });
        const beta = snapshot.teachers[1];
        if (beta && typeof beta === 'object' && !Array.isArray(beta))
          beta['unavailable'] = [1, 2, 3, 4, 5].flatMap((weekday) =>
            ['pa1', 'pa2', 'pa3'].map((periodId) => ({ weekday, periodId })),
          );
      }),
      null,
    );

    expect(entry(checklist, 'teachers').attention).toEqual([
      'Professor Docente Beta tem 2 aulas atribuídas, acima da carga máxima de 1.',
      'Professor Docente Gama não tem disciplinas habilitadas.',
      'Professor Docente Gama não tem atribuições nesta revisão.',
    ]);
    expect(entry(checklist, 'availability').attention).toEqual([
      'Professor Docente Beta precisa de 2 horários (aulas e hora-atividade), mas tem 0 horários disponíveis nos turnos em que pode atuar.',
    ]);
  });

  it('acusa atribuição de professor arquivado e exceção de regra sem atribuição', () => {
    const base = revision((snapshot) => {
      const assignment = snapshot.assignments[1];
      if (assignment && typeof assignment === 'object' && !Array.isArray(assignment))
        assignment['participants'] = [{ teacherId: 't3', subjectId: 's2' }];
    });
    const checklist = reviewChecklist(
      {
        ...base,
        gridRules: {
          ...base.gridRules,
          dailyExceptions: [
            { classGroupId: 'c2', subjectId: 's1', maxPerDay: 1, consecutive: false },
          ],
        },
      },
      null,
    );

    expect(entry(checklist, 'assignments').attention).toContain(
      'Atribuição Turma Beta · Disciplina Beta · Docente arquivado fica fora da grade: professor arquivado (Docente arquivado).',
    );
    expect(entry(checklist, 'rules').attention).toEqual([
      'A exceção do limite diário para Turma Beta · Disciplina Alfa não tem atribuição correspondente nesta revisão.',
    ]);
  });

  it('mostra o que mudou em relação à referência, separando cadastro e disponibilidade', () => {
    const reference = revision(undefined, 'r0');
    const current = revision((snapshot) => {
      const [alfa, beta] = snapshot.teachers;
      if (alfa && typeof alfa === 'object' && !Array.isArray(alfa)) {
        alfa['unavailable'] = [];
        alfa['version'] = 9;
      }
      if (beta && typeof beta === 'object' && !Array.isArray(beta)) beta['maxWeeklyLessons'] = 4;
      snapshot.teachers.push({
        id: 't4',
        name: 'Docente Gama',
        subjectIds: ['s1'],
        maxWeeklyLessons: null,
        planningPeriods: 2,
        unavailable: [],
        archivedAt: null,
      });
      snapshot.assignments.splice(1, 1);
      snapshot.subjects.push({ id: 's3', name: 'Disciplina Gama', archivedAt: null });
    });
    const checklist = reviewChecklist(
      { ...current, gridRules: { ...current.gridRules, planningPeriods: 'teaching_shifts' } },
      { revision: reference, label: 'Plano anterior, revisão 2' },
    );

    expect(checklist.reference).toEqual({ id: 'r0', label: 'Plano anterior, revisão 2' });
    expect(entry(checklist, 'structure').changes).toEqual([
      { kind: 'added', label: 'Disciplina Disciplina Gama', fields: [] },
    ]);
    expect(entry(checklist, 'teachers').changes).toEqual([
      { kind: 'changed', label: 'Professor Docente Beta', fields: ['carga máxima'] },
      { kind: 'added', label: 'Professor Docente Gama', fields: [] },
    ]);
    expect(entry(checklist, 'availability').changes).toEqual([
      { kind: 'changed', label: 'Professor Docente Alfa', fields: ['horários indisponíveis'] },
      { kind: 'added', label: 'Professor Docente Gama', fields: [] },
    ]);
    expect(entry(checklist, 'assignments').changes).toEqual([
      {
        kind: 'removed',
        label: 'Atribuição Turma Beta · Disciplina Beta · Docente Alfa',
        fields: [],
      },
    ]);
    expect(entry(checklist, 'rules').changes).toEqual([
      { kind: 'changed', label: 'Onde cumprir a hora-atividade', fields: [] },
    ]);
  });

  it('aceita somente itens conhecidos, sem repetição e na ordem da conferência', () => {
    expect(validReviewedItems(['rules', 'structure', 'rules'])).toEqual(['structure', 'rules']);
    expect(() => validReviewedItems(['outro'])).toThrow('Informe os itens conferidos');
    expect(() => validReviewedItems(undefined)).toThrow('Informe os itens conferidos');

    const all = PlanningRevisionEntity.reconstitute(revision())
      .review(['structure', 'teachers', 'assignments', 'availability', 'rules'])
      .snapshot();
    expect(isRevisionReviewed(all)).toBe(true);
    expect(reviewChecklist(all, null).complete).toBe(true);
    expect(isRevisionReviewed({ reviewedItems: ['structure'] })).toBe(false);
  });
});
