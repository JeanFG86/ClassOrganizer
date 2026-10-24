import { accountsApiKey } from '../modules/access/presentation/accounts-key.ts';
import { planningsApiKey } from '../modules/planning/presentation/plannings-key.ts';
import { auditApiKey } from '../modules/access/presentation/audit-key.ts';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { accessApiKey, createAccessApi } from './access-fixture.ts';
import { ApiRequestError } from '../shared/application/api-error.ts';
import { subjectsApiKey } from '../modules/school-structure/presentation/subjects-key.ts';
import LoginPage from '../modules/access/presentation/pages/LoginPage.vue';
import AccountPage from '../modules/access/presentation/pages/AccountPage.vue';
import UsersPage from '../modules/access/presentation/pages/UsersPage.vue';
import PlanningsPage from '../modules/planning/presentation/pages/PlanningsPage.vue';
import AuditPage from '../modules/access/presentation/pages/AuditPage.vue';
import SubjectsPage from '../modules/school-structure/presentation/pages/SubjectsPage.vue';
import {
  REVIEW_ITEMS,
  type PlanningDetailDto,
  type RevisionChecklistDto,
} from '@classorganizer/contracts';
const date = '2026-01-01T00:00:00.000Z';
const user = {
  id: 'admin-id',
  username: 'admin-test',
  role: 'admin' as const,
  disabled: false,
  version: 1,
  createdAt: date,
};
const planning: PlanningDetailDto = {
  id: 'planning-id',
  name: 'Plano fictício',
  year: 2027,
  version: 1,
  createdAt: date,
  archivedAt: null,
  copiedFromId: null,
  revisions: [
    {
      id: 'revision-id',
      name: null,
      restoredFromId: null,
      sourceRevisionId: null,
      gridRules: {
        formatVersion: 1,
        planningPeriods: 'any_shift',
        daily: { maxPerDay: 2, consecutive: true },
        dailyExceptions: [],
      },
      planningId: 'planning-id',
      number: 1,
      createdAt: date,
      createdBy: user.id,
      reviewedItems: [],
      sealedAt: null,
      snapshot: {
        formatVersion: 1,
        catalogVersion: 1,
        capturedAt: date,
        subjects: [],
        teachers: [],
        classGroups: [],
        shifts: [],
        assignments: [],
        resources: [],
      },
    },
  ],
};
const checklist: RevisionChecklistDto = {
  version: 1,
  revisionId: 'revision-id',
  reference: { id: 'source-id', label: 'Plano anterior, revisão 2' },
  complete: false,
  items: REVIEW_ITEMS.map((item) => ({
    item,
    title: 'Item ' + item,
    description: 'Descrição ' + item,
    reviewed: false,
    attention:
      item === 'availability'
        ? ['Professor Docente Fictício precisa de horários.']
        : item === 'structure'
          ? ['Turma A sem turno.', 'Turma B sem turno.', 'Turma C sem turno.', 'Turma D sem turno.']
          : [],
    changes:
      item === 'teachers'
        ? [
            {
              kind: 'changed' as const,
              label: 'Professor Docente Fictício',
              fields: ['carga máxima'],
            },
          ]
        : [],
  })),
};
const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  wrappers.length = 0;
});
function fake() {
  const api = createAccessApi();
  api.session.value = { user, expiresAt: date };
  vi.spyOn(api, 'revisionChecklist').mockResolvedValue(checklist);
  return api;
}
async function render(component: object, api = fake(), extra: Record<symbol, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/entrar', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const push = vi.spyOn(router, 'push');
  const wrapper = mount(component, {
    global: {
      plugins: [router],
      provide: {
        [accessApiKey as symbol]: api,
        [accountsApiKey as symbol]: api,
        [planningsApiKey as symbol]: api,
        [auditApiKey as symbol]: api,
        ...extra,
      },
    },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  await flushPromises();
  return { wrapper, push };
}
describe('acesso e planejamentos na interface', () => {
  it('login mostra falha, apaga a senha e permite tentar novamente', async () => {
    const api = fake();
    const login = vi
      .spyOn(api, 'login')
      .mockRejectedValueOnce(
        new ApiRequestError('access.credentials_invalid', 'Usuário ou senha inválidos.', 401),
      )
      .mockResolvedValue();
    const { wrapper, push } = await render(LoginPage, api);
    await wrapper.get('#login-user').setValue('editor-test');
    await wrapper.get('#login-password').setValue('senha ficticia 2026!');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role=alert]').text()).toContain('Usuário ou senha inválidos.');
    expect((wrapper.get('#login-password').element as HTMLInputElement).value).toBe('');
    await wrapper.get('#login-password').setValue('outra senha ficticia');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(login).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledWith('/');
  });
  it('consulta vê planejamentos e dados mas não encontra formulário de edição', async () => {
    const api = fake();
    api.session.value = { user: { ...user, role: 'viewer' }, expiresAt: date };
    vi.spyOn(api, 'plannings').mockResolvedValue([planning]);
    vi.spyOn(api, 'planning').mockResolvedValue(planning);
    const { wrapper } = await render(PlanningsPage, api);
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Copiar');
    await wrapper.get('button[aria-label="Abrir Plano fictício"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Rascunho');
    expect(wrapper.text()).toContain('Baixar revisão em JSON');
    expect(wrapper.text()).toContain('Item rules · Pendente');
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.find('input[type=checkbox]').exists()).toBe(false);
    const catalog = await render(SubjectsPage, api, {
      [subjectsApiKey as symbol]: {
        list: async () => [
          {
            id: 'subject-id',
            name: 'Disciplina fictícia',
            createdAt: date,
            archivedAt: null,
            version: 1,
          },
        ],
      },
    });
    expect(catalog.wrapper.find('form').exists()).toBe(false);
    expect(catalog.wrapper.text()).not.toContain('Editar');
  });
  it('conflito de revisão recarrega a versão atual e mantém a explicação visível', async () => {
    const api = fake();
    vi.spyOn(api, 'plannings').mockResolvedValue([planning]);
    const detail = vi
      .spyOn(api, 'planning')
      .mockResolvedValueOnce(planning)
      .mockResolvedValue({ ...planning, version: 2 });
    const change = vi
      .spyOn(api, 'changePlanning')
      .mockRejectedValue(
        new ApiRequestError('concurrency.stale', 'Outro usuário alterou este registro.', 409),
      );
    const { wrapper } = await render(PlanningsPage, api);
    await wrapper.get('button[aria-label="Abrir Plano fictício"]').trigger('click');
    await flushPromises();
    const forms = wrapper.findAll('form');
    await forms.at(-1)?.trigger('submit');
    await flushPromises();
    expect(change).toHaveBeenCalledWith(
      planning.id,
      expect.objectContaining({ version: 1, revisionId: 'revision-id', operation: 'review' }),
    );
    expect(detail).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[role=alert]').text()).toContain('Outro usuário');
  });
  it('checklist mostra pontos de atenção e alterações e salva os itens conferidos', async () => {
    const api = fake();
    vi.spyOn(api, 'plannings').mockResolvedValue([planning]);
    vi.spyOn(api, 'planning').mockResolvedValue(planning);
    const change = vi.spyOn(api, 'changePlanning').mockResolvedValue(planning);
    const { wrapper } = await render(PlanningsPage, api);
    await wrapper.get('button[aria-label="Abrir Plano fictício"]').trigger('click');
    await flushPromises();
    expect(api.revisionChecklist).toHaveBeenCalledWith(planning.id, 'revision-id');
    const section = wrapper.get('section[aria-labelledby="checklist-title"]');
    expect(section.text()).toContain('0 de 5 itens conferidos');
    expect(section.text()).toContain('comparadas com Plano anterior, revisão 2');
    expect(section.get('[aria-label="Pontos de atenção: Item availability"]').text()).toContain(
      'precisa de horários',
    );
    expect(section.get('[aria-label="Alterações: Item teachers"]').text()).toBe(
      'Alterado: Professor Docente Fictício (carga máxima)',
    );
    expect(section.text()).toContain('Sem alterações desde Plano anterior, revisão 2.');
    const attention = section.findAll('details.attention');
    expect(attention.map((d) => [d.get('summary').text(), d.attributes('open')])).toEqual([
      ['4 pontos de atenção', undefined],
      ['1 ponto de atenção', ''],
    ]);
    const seal = section.findAll('button').find((b) => b.text() === 'Concluir revisão');
    expect(seal?.attributes('disabled')).toBeDefined();
    await section.get('input[value="rules"]').setValue(true);
    await section.get('input[value="structure"]').setValue(true);
    await section.get('form').trigger('submit');
    await flushPromises();
    expect(change).toHaveBeenCalledWith(planning.id, {
      version: 1,
      revisionId: 'revision-id',
      operation: 'review',
      reviewedItems: ['rules', 'structure'],
    });
    expect(wrapper.get('[role=status]').text()).toBe('Conferência salva.');
  });
  it('checklist com falha oferece nova tentativa', async () => {
    const api = fake();
    vi.spyOn(api, 'plannings').mockResolvedValue([planning]);
    vi.spyOn(api, 'planning').mockResolvedValue(planning);
    vi.mocked(api.revisionChecklist)
      .mockRejectedValueOnce(new ApiRequestError('network', 'Sem conexão'))
      .mockResolvedValue(checklist);
    const { wrapper } = await render(PlanningsPage, api);
    await wrapper.get('button[aria-label="Abrir Plano fictício"]').trigger('click');
    await flushPromises();
    const section = wrapper.get('section[aria-labelledby="checklist-title"]');
    expect(section.get('[role=alert]').text()).toContain('Sem conexão');
    await section.get('[role=alert] button').trigger('click');
    await flushPromises();
    expect(section.find('[role=alert]').exists()).toBe(false);
    expect(section.findAll('input[type=checkbox]')).toHaveLength(5);
  });
  it('cópia pode usar a fotografia da origem e deixar a grade para trás', async () => {
    const api = fake();
    vi.spyOn(api, 'plannings').mockResolvedValue([planning]);
    vi.spyOn(api, 'planning').mockResolvedValue(planning);
    const create = vi.spyOn(api, 'createPlanning').mockResolvedValue(planning);
    const { wrapper } = await render(PlanningsPage, api);
    await wrapper.get('button[aria-label="Copiar Plano fictício"]').trigger('click');
    const form = wrapper.get('form');
    expect((form.get('input[value="current"]').element as HTMLInputElement).checked).toBe(true);
    await form.get('input[value="source"]').setValue(true);
    await form.get('input[type=checkbox]').setValue(false);
    await form.trigger('submit');
    await flushPromises();
    expect(create).toHaveBeenCalledWith({
      name: 'Plano fictício — cópia',
      year: new Date().getFullYear(),
      sourceId: planning.id,
      sourceVersion: 1,
      base: 'source',
      keepGrid: false,
    });
  });
  it('cópia informa origem e versão; falha de lista oferece nova tentativa', async () => {
    const api = fake();
    const list = vi
      .spyOn(api, 'plannings')
      .mockRejectedValueOnce(new ApiRequestError('network', 'Sem conexão'))
      .mockResolvedValue([planning]);
    const create = vi.spyOn(api, 'createPlanning').mockResolvedValue(planning);
    vi.spyOn(api, 'planning').mockResolvedValue(planning);
    const { wrapper } = await render(PlanningsPage, api);
    expect(wrapper.get('[role=alert]').text()).toContain('Sem conexão');
    await wrapper.get('[role=alert] button').trigger('click');
    await flushPromises();
    expect(list).toHaveBeenCalledTimes(2);
    await wrapper.get('button[aria-label="Copiar Plano fictício"]').trigger('click');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: planning.id,
        sourceVersion: 1,
        base: 'current',
        keepGrid: true,
      }),
    );
    expect(wrapper.get('[role=status]').text()).toContain('checklist');
  });
  it('gestão de acessos cria usuário e esvazia a senha depois de salvar', async () => {
    const api = fake();
    vi.spyOn(api, 'users').mockResolvedValue([user]);
    const create = vi.spyOn(api, 'createUser').mockResolvedValue(user);
    const { wrapper } = await render(UsersPage, api);
    await wrapper.get('#user-name').setValue('consulta-test');
    await wrapper.get('#user-password').setValue('senha ficticia 2026!');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(create).toHaveBeenCalledWith('consulta-test', 'senha ficticia 2026!', 'viewer');
    expect((wrapper.get('#user-password').element as HTMLInputElement).value).toBe('');
    expect(wrapper.get('[role=status]').text()).toBe('Acesso criado.');
  });
  it('troca de senha encerra o fluxo e volta ao login', async () => {
    const api = fake();
    const save = vi.spyOn(api, 'password').mockResolvedValue();
    const { wrapper, push } = await render(AccountPage, api);
    await wrapper.get('#current-password').setValue('senha ficticia atual');
    await wrapper.get('#new-password').setValue('senha ficticia nova');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(save).toHaveBeenCalledWith('senha ficticia atual', 'senha ficticia nova');
    expect(push).toHaveBeenCalledWith('/entrar');
  });
  it('auditoria apresenta erro recuperável e o responsável pela ação', async () => {
    const api = fake();
    vi.spyOn(api, 'audits')
      .mockRejectedValueOnce(new ApiRequestError('network', 'Sem conexão'))
      .mockResolvedValue([
        {
          id: 'audit-id',
          actorId: user.id,
          actor: { username: user.username },
          action: 'planning.create',
          entityId: planning.id,
          occurredAt: date,
        },
      ]);
    const { wrapper } = await render(AuditPage, api);
    expect(wrapper.get('[role=alert]').text()).toContain('Sem conexão');
    await wrapper.get('[role=alert] button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Criação de planejamento');
    expect(wrapper.text()).toContain(user.username);
  });
});
