import type { SubjectDto } from '@classorganizer/contracts';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../services/api-client.ts';
import { subjectsApiKey, type SubjectsApi } from '../services/subjects-api.ts';
import SubjectsPage from './SubjectsPage.vue';

const math: SubjectDto = { id: '1', name: 'Matemática', createdAt: '2026-02-01T12:00:00.000Z' };

function fakeApi(initial: SubjectDto[] = []): SubjectsApi & { items: SubjectDto[] } {
  const items = [...initial];
  return {
    items,
    list: vi.fn(async () => [...items]),
    register: vi.fn(async (name: string) => {
      const created = { id: String(items.length + 1), name, createdAt: math.createdAt };
      items.push(created);
      return created;
    }),
  };
}

async function mountPage(api: SubjectsApi) {
  const wrapper = mount(SubjectsPage, {
    global: { provide: { [subjectsApiKey as symbol]: api } },
  });
  await flushPromises();
  return wrapper;
}

describe('SubjectsPage', () => {
  it('mostra estado vazio quando não há disciplinas', async () => {
    const wrapper = await mountPage(fakeApi());

    expect(wrapper.text()).toContain('Nenhuma disciplina cadastrada ainda.');
  });

  it('lista as disciplinas existentes', async () => {
    const wrapper = await mountPage(fakeApi([math]));

    expect(wrapper.get('ul[aria-label="Disciplinas cadastradas"]').text()).toContain('Matemática');
  });

  it('cadastra, confirma e recarrega a lista', async () => {
    const api = fakeApi();
    const wrapper = await mountPage(api);

    await wrapper.get('#subject-name').setValue('História');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(api.register).toHaveBeenCalledWith('História');
    expect(wrapper.get('[role="status"]').text()).toBe('Disciplina "História" cadastrada.');
    expect(wrapper.get('ul').text()).toContain('História');
    expect((wrapper.get('#subject-name').element as HTMLInputElement).value).toBe('');
  });

  it('valida nome vazio sem chamar a API', async () => {
    const api = fakeApi();
    const wrapper = await mountPage(api);

    await wrapper.get('#subject-name').setValue('   ');
    await wrapper.get('form').trigger('submit');

    expect(api.register).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toBe('Informe o nome da disciplina.');
    expect(wrapper.get('#subject-name').attributes('aria-invalid')).toBe('true');
  });

  it('exibe a mensagem de erro devolvida pela API e preserva o texto digitado', async () => {
    const api = fakeApi([math]);
    api.register = vi.fn(async () => {
      throw new ApiRequestError(
        'subject.name_in_use',
        'Já existe uma disciplina chamada "Matemática".',
      );
    });
    const wrapper = await mountPage(api);

    await wrapper.get('#subject-name').setValue('matematica');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Já existe uma disciplina chamada "Matemática".',
    );
    expect((wrapper.get('#subject-name').element as HTMLInputElement).value).toBe('matematica');
  });

  it('permite tentar novamente quando a lista não carrega', async () => {
    const api = fakeApi([math]);
    api.list = vi
      .fn<SubjectsApi['list']>()
      .mockRejectedValueOnce(
        new ApiRequestError('network', 'Não foi possível conectar ao servidor.'),
      )
      .mockResolvedValueOnce([math]);
    const wrapper = await mountPage(api);

    expect(wrapper.text()).toContain('Não foi possível conectar ao servidor.');

    await wrapper.get('button[type="button"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('ul').text()).toContain('Matemática');
  });
});
