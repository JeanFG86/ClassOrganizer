import type { SubjectDto, TeacherDto } from '@classorganizer/contracts';
import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../services/api-client.ts';
import { subjectsApiKey, type SubjectsApi } from '../services/subjects-api.ts';
import { teachersApiKey, type TeachersApi } from '../services/teachers-api.ts';
import TeachersPage from './TeachersPage.vue';

const createdAt = '2026-02-01T12:00:00.000Z';
const math: SubjectDto = { id: 's1', name: 'Matemática', createdAt };
const history: SubjectDto = { id: 's2', name: 'História', createdAt };

function fakeSubjectsApi(items: SubjectDto[]): SubjectsApi {
  return { list: vi.fn(async () => items), register: vi.fn() };
}

function fakeTeachersApi(initial: TeacherDto[] = []): TeachersApi & { items: TeacherDto[] } {
  const items = [...initial];
  return {
    items,
    list: vi.fn(async () => [...items]),
    register: vi.fn(async ({ name, subjectIds }) => {
      const created = { id: `t${items.length + 1}`, name, subjectIds, createdAt };
      items.push(created);
      return created;
    }),
  };
}

async function mountPage(subjectsApi: SubjectsApi, teachersApi: TeachersApi) {
  const wrapper = mount(TeachersPage, {
    global: {
      provide: {
        [subjectsApiKey as symbol]: subjectsApi,
        [teachersApiKey as symbol]: teachersApi,
      },
      stubs: { RouterLink: RouterLinkStub },
    },
  });
  await flushPromises();
  return wrapper;
}

describe('TeachersPage', () => {
  it('oferece as disciplinas cadastradas como opções de habilitação', async () => {
    const wrapper = await mountPage(fakeSubjectsApi([math, history]), fakeTeachersApi());

    const options = wrapper.findAll('fieldset label').map((l) => l.text());
    expect(options).toEqual(['Matemática', 'História']);
    expect(wrapper.get('fieldset legend').text()).toBe('Disciplinas que pode lecionar');
  });

  it('orienta a cadastrar disciplinas quando não há nenhuma', async () => {
    const wrapper = await mountPage(fakeSubjectsApi([]), fakeTeachersApi());

    expect(wrapper.get('fieldset').text()).toContain('Nenhuma disciplina cadastrada.');
    expect(wrapper.getComponent(RouterLinkStub).props('to')).toBe('/disciplinas');
  });

  it('lista professores com os nomes das disciplinas habilitadas', async () => {
    const wrapper = await mountPage(
      fakeSubjectsApi([math, history]),
      fakeTeachersApi([
        { id: 't1', name: 'Ana', subjectIds: ['s2', 's1'], createdAt },
        { id: 't2', name: 'Bruno', subjectIds: [], createdAt },
      ]),
    );

    const items = wrapper.findAll('ul li').map((li) => li.text());
    expect(items).toEqual(['Ana — História, Matemática', 'Bruno — Sem habilitações']);
  });

  it('cadastra com as disciplinas marcadas e limpa o formulário', async () => {
    const teachersApi = fakeTeachersApi();
    const wrapper = await mountPage(fakeSubjectsApi([math, history]), teachersApi);

    await wrapper.get('#teacher-name').setValue('Ana Souza');
    await wrapper.get('input[type="checkbox"][value="s2"]').setValue(true);
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(teachersApi.register).toHaveBeenCalledWith({ name: 'Ana Souza', subjectIds: ['s2'] });
    expect(wrapper.findAll('[role="status"]').map((s) => s.text())).toEqual([
      'Professor(a) "Ana Souza" cadastrado(a).',
    ]);
    expect(wrapper.get('ul').text()).toContain('Ana Souza — História');
    expect((wrapper.get('#teacher-name').element as HTMLInputElement).value).toBe('');
    expect(
      wrapper.findAll<HTMLInputElement>('input[type="checkbox"]').every((c) => !c.element.checked),
    ).toBe(true);
  });

  it('valida nome vazio sem chamar a API', async () => {
    const teachersApi = fakeTeachersApi();
    const wrapper = await mountPage(fakeSubjectsApi([math]), teachersApi);

    await wrapper.get('form').trigger('submit');

    expect(teachersApi.register).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toBe('Informe o nome do professor.');
  });

  it('mantém o que foi preenchido quando a API recusa', async () => {
    const teachersApi = fakeTeachersApi();
    teachersApi.register = vi.fn(async () => {
      throw new ApiRequestError('teacher.unknown_subject', 'Uma ou mais disciplinas...');
    });
    const wrapper = await mountPage(fakeSubjectsApi([math]), teachersApi);

    await wrapper.get('#teacher-name').setValue('Ana');
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('Uma ou mais disciplinas...');
    expect((wrapper.get('#teacher-name').element as HTMLInputElement).value).toBe('Ana');
    expect((wrapper.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true);
  });

  it('mostra erro com opção de tentar novamente se o carregamento falhar', async () => {
    const subjectsApi = fakeSubjectsApi([math]);
    subjectsApi.list = vi
      .fn<SubjectsApi['list']>()
      .mockRejectedValueOnce(
        new ApiRequestError('network', 'Não foi possível conectar ao servidor.'),
      )
      .mockResolvedValueOnce([math]);
    const wrapper = await mountPage(subjectsApi, fakeTeachersApi());

    expect(wrapper.text()).toContain('Não foi possível conectar ao servidor.');
    expect(wrapper.find('form').exists()).toBe(false);

    await wrapper.get('button[type="button"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('form').exists()).toBe(true);
  });
});
