import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GridEvaluationDto, GridViewDto } from '@classorganizer/contracts';
import { accessApiKey, createAccessApi } from '../services/access-api.ts';
import { ApiRequestError } from '../services/api-client.ts';
import { gridApiKey, type GridApi } from '../services/grid-api.ts';
import GridPage from './GridPage.vue';

const date = '2026-01-01T00:00:00.000Z';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PLANNING = id(1);
const REVISION = id(2);
const P1 = id(10);
const P2 = id(11);
const CLASS = id(20);
const TEACHER = id(30);
const SUBJECT = id(40);
const BLOCK = id(50);

function view(overrides: Partial<GridViewDto> = {}): GridViewDto {
  return {
    planning: {
      id: PLANNING,
      name: 'Plano fictício',
      year: 2027,
      version: 3,
      createdAt: date,
      archivedAt: null,
      copiedFromId: null,
    },
    revision: {
      id: REVISION,
      number: 1,
      sealedAt: null,
      rulesReviewed: false,
      availabilityReviewed: false,
    },
    revisions: [{ id: REVISION, number: 1, sealedAt: null }],
    editable: true,
    rules: {
      formatVersion: 1,
      planningPeriods: 'any_shift',
      daily: { maxPerDay: 2, consecutive: true },
      dailyExceptions: [],
    },
    timetable: {
      modelVersion: 1,
      sourceRevision: REVISION,
      lessonMinutes: 50,
      weekdays: [1, 2, 3, 4, 5],
      periods: [
        { id: P1, shiftId: 'shift', startMinute: 420, endMinute: 470 },
        { id: P2, shiftId: 'shift', startMinute: 470, endMinute: 520 },
      ],
      subjects: [{ id: SUBJECT, name: 'Disciplina Alfa' }],
      classGroups: [{ id: CLASS, name: 'Turma Alfa', periodIds: [P1, P2] }],
      teachers: [
        {
          id: TEACHER,
          name: 'Docente Alfa',
          subjectIds: [SUBJECT],
          unavailable: [{ weekday: 5, periodId: P1 }],
          planningPeriods: 1,
          planningPeriodIds: [P1, P2],
          maxWeeklyLessons: null,
        },
      ],
      assignments: [
        {
          id: BLOCK,
          classGroupId: CLASS,
          participants: [{ teacherId: TEACHER, subjectId: SUBJECT }],
          weeklyLessons: 2,
          resourceIds: [],
        },
      ],
      resources: [],
      subjectRules: [{ classGroupId: CLASS, subjectId: SUBJECT, maxPerDay: 2, consecutive: true }],
      fixedLessons: [],
      fixedPlanning: [],
    },
    shifts: [{ id: 'shift', name: 'Turno Alfa', periodIds: [P1, P2] }],
    placements: [{ kind: 'lesson', entityId: BLOCK, weekday: 1, periodId: P1, pinned: false }],
    diagnosis: {
      model: [],
      problems: [],
      pending: [
        {
          code: 'load.lessons',
          message:
            'O bloco de Disciplina Alfa na turma Turma Alfa exige 2 aulas; a grade contém 1.',
          entityIds: [BLOCK],
        },
      ],
      alerts: [],
      teachers: [
        {
          teacherId: TEACHER,
          lessons: 1,
          requiredLessons: 2,
          planning: 0,
          requiredPlanning: 1,
          maxWeeklyLessons: null,
          windows: 0,
        },
      ],
      classGroups: [{ classGroupId: CLASS, lessons: 1, requiredLessons: 2 }],
    },
    history: [
      {
        id: id(60),
        sequence: 1,
        kind: 'operation',
        summary: 'Inseriu Disciplina Alfa (Turma Alfa) em segunda, 07:00 (Turno Alfa).',
        actorUsername: 'editor-test',
        occurredAt: date,
        reverted: false,
      },
    ],
    undo: { changeId: id(60), summary: 'Inseriu Disciplina Alfa (Turma Alfa).' },
    ...overrides,
  };
}
function evaluation(overrides: Partial<GridEvaluationDto> = {}): GridEvaluationDto {
  return {
    accepted: true,
    summary: 'Moveu Disciplina Alfa (Turma Alfa) de segunda, 07:00 para terça, 07:50.',
    introduced: [],
    resolved: [],
    diagnosis: view().diagnosis,
    ...overrides,
  };
}
function fakeApi(current = view()) {
  return {
    view: vi.fn(async () => current),
    preview: vi.fn(async () => evaluation()),
    apply: vi.fn(async () => ({ id: PLANNING, version: 4, summary: 'Moveu.' })),
    undo: vi.fn(async () => ({ id: PLANNING, version: 4, summary: 'Desfez: inserção.' })),
    changeRules: vi.fn(async () => ({ id: PLANNING, version: 4 })),
  } satisfies GridApi;
}

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  wrappers.length = 0;
});
async function render(api: GridApi, role: 'editor' | 'viewer' = 'editor') {
  const access = createAccessApi();
  access.session.value = {
    user: {
      id: id(99),
      username: role + '-test',
      role,
      disabled: false,
      version: 1,
      createdAt: date,
    },
    expiresAt: date,
  };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/planejamentos', component: { template: '<div />' } },
      { path: '/planejamentos/:id/grade', component: GridPage },
    ],
  });
  await router.push('/planejamentos/' + PLANNING + '/grade');
  await router.isReady();
  const wrapper = mount(GridPage, {
    global: {
      plugins: [router],
      provide: { [gridApiKey as symbol]: api, [accessApiKey as symbol]: access },
    },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}
const button = (wrapper: VueWrapper, label: string) => {
  const found = wrapper
    .findAll('button')
    .find((b) => b.attributes('aria-label')?.startsWith(label));
  if (!found) throw new Error('Botão ausente: ' + label);
  return found;
};

describe('grade manual', () => {
  it('mostra a grade da turma, a legenda, a conferência e o histórico', async () => {
    const wrapper = await render(fakeApi());
    expect(wrapper.find('h1').text()).toBe('Grade · Plano fictício · 2027');
    expect(wrapper.get('table[aria-label="Grade da turma Turma Alfa"]').text()).toContain(
      'Disciplina Alfa',
    );
    expect(wrapper.get('[aria-label="Legenda"]').text()).toContain('Fixada');
    expect(wrapper.text()).toContain('0 problemas · 1 pendência para completar.');
    expect(wrapper.get('[aria-label="Alterações da grade"]').text()).toContain('editor-test');
  });

  it('seleciona, move com prévia e só grava na confirmação', async () => {
    const api = fakeApi();
    const wrapper = await render(api);
    await button(wrapper, 'Disciplina Alfa (Turma Alfa), segunda').trigger('click');
    expect(wrapper.text()).toContain('Aula selecionada');
    await button(wrapper, 'Horário livre: terça, 2ª').trigger('click');
    await flushPromises();
    expect(api.preview).toHaveBeenCalledWith(
      { planningId: PLANNING, version: 3, revisionId: REVISION },
      {
        type: 'move',
        slot: { kind: 'lesson', entityId: BLOCK, weekday: 1, periodId: P1 },
        weekday: 2,
        periodId: P2,
      },
    );
    expect(api.apply).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Nenhum problema novo.');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Confirmar alteração')
      ?.trigger('click');
    await flushPromises();
    expect(api.apply).toHaveBeenCalledTimes(1);
    expect(api.view).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[role="status"]').text()).toContain('Alteração aplicada.');
  });

  it('insere pelo horário livre e bloqueia a confirmação quando a prévia acusa problema', async () => {
    const api = fakeApi();
    api.preview.mockResolvedValueOnce(
      evaluation({
        accepted: false,
        introduced: [
          {
            code: 'conflict.teacher',
            message: 'Docente Alfa tem atividades sobrepostas na terça, às 07:00.',
            entityIds: [TEACHER],
          },
        ],
      }),
    );
    const wrapper = await render(api);
    await button(wrapper, 'Horário livre: terça, 1ª').trigger('click');
    await flushPromises();
    expect(wrapper.get('[aria-label="Opções para inserir"]').text()).toContain('faltam 1');
    await button(wrapper, 'Inserir Disciplina Alfa').trigger('click');
    await flushPromises();
    expect(api.preview).toHaveBeenCalledWith(expect.anything(), {
      type: 'place',
      slot: { kind: 'lesson', entityId: BLOCK, weekday: 2, periodId: P1 },
    });
    expect(wrapper.get('[aria-label="Problemas que a alteração criaria"]').text()).toContain(
      'sobrepostas',
    );
    const confirm = wrapper.findAll('button').find((b) => b.text() === 'Confirmar alteração');
    expect(confirm?.attributes('disabled')).toBeDefined();
  });

  it('desfaz a última alteração e recarrega após conflito de versão', async () => {
    const api = fakeApi();
    const wrapper = await render(api);
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Desfazer última alteração')
      ?.trigger('click');
    await flushPromises();
    expect(api.undo).toHaveBeenCalledWith({
      planningId: PLANNING,
      version: 3,
      revisionId: REVISION,
    });
    expect(wrapper.get('[role="status"]').text()).toBe('Desfez: inserção.');
    api.preview.mockRejectedValueOnce(
      new ApiRequestError('concurrency.stale', 'Outra pessoa alterou a grade.', 409),
    );
    await button(wrapper, 'Horário livre: terça, 1ª').trigger('click');
    await flushPromises();
    await button(wrapper, 'Inserir Disciplina Alfa').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Outra pessoa alterou a grade.');
    expect(api.view).toHaveBeenCalledTimes(3);
  });

  it('visão do professor mostra indisponibilidade e permite inserir hora-atividade', async () => {
    const api = fakeApi();
    const wrapper = await render(api);
    await wrapper.get('input[value="teacher"]').setValue(true);
    expect(wrapper.get('table[aria-label="Grade de Docente Alfa na Turno Alfa"]').text()).toContain(
      'Indisponível',
    );
    await button(wrapper, 'Horário livre: quarta, 2ª').trigger('click');
    await flushPromises();
    await button(wrapper, 'Inserir Hora-atividade').trigger('click');
    await flushPromises();
    expect(api.preview).toHaveBeenCalledWith(expect.anything(), {
      type: 'place',
      slot: { kind: 'planning', entityId: TEACHER, weekday: 3, periodId: P2 },
    });
  });

  it('consulta e revisão concluída não oferecem alterações', async () => {
    const wrapper = await render(fakeApi(), 'viewer');
    expect(wrapper.text()).toContain('Seu perfil permite apenas consultar a grade.');
    expect(wrapper.findAll('button.grid-item')).toHaveLength(0);
    expect(wrapper.text()).not.toContain('Desfazer última alteração');
    const sealed = await render(
      fakeApi(view({ editable: false, revision: { ...view().revision, sealedAt: date } })),
    );
    expect(sealed.text()).toContain('Revisão concluída');
    expect(sealed.findAll('button.grid-empty')).toHaveLength(0);
  });

  it('salva regras com exceção por turma e disciplina', async () => {
    const api = fakeApi();
    const wrapper = await render(api);
    await wrapper.get('#grid-exception-class').setValue(CLASS);
    await wrapper.get('#grid-exception-subject').setValue(SUBJECT);
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Adicionar exceção')
      ?.trigger('click');
    await wrapper.findAll('form').at(-1)?.trigger('submit');
    await flushPromises();
    expect(api.changeRules).toHaveBeenCalledWith(expect.anything(), {
      ...view().rules,
      dailyExceptions: [
        { classGroupId: CLASS, subjectId: SUBJECT, maxPerDay: 1, consecutive: false },
      ],
    });
    expect(wrapper.get('[role="status"]').text()).toContain('Regras salvas.');
  });
});
