import type { SubjectDto } from '@classorganizer/contracts';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../../../shared/application/api-error.ts';
import { subjectsApiKey } from '../subjects-key.ts';
import { type SubjectsApi } from '../../application/subjects-api.ts';
import SubjectsPage from './SubjectsPage.vue';

const createdAt = '2026-02-01T12:00:00.000Z';

function subject(id: string, name: string, extra: Partial<SubjectDto> = {}): SubjectDto {
  return { id, name, createdAt, archivedAt: null, version: 1, ...extra };
}

/** API em memória que imita versão e arquivamento do servidor. */
function fakeApi(initial: SubjectDto[] = []): SubjectsApi & { items: SubjectDto[] } {
  const items = [...initial];
  const replace = (id: string, change: Partial<SubjectDto>) => {
    const index = items.findIndex((s) => s.id === id);
    const current = items[index] as SubjectDto;
    const next = { ...current, ...change, version: current.version + 1 };
    items[index] = next;
    return next;
  };
  return {
    items,
    list: vi.fn(async () => [...items]),
    register: vi.fn(async (name: string) => {
      const created = subject(String(items.length + 1), name);
      items.push(created);
      return created;
    }),
    update: vi.fn(async (id, { name }) => replace(id, { name })),
    archive: vi.fn(async (id) => replace(id, { archivedAt: createdAt })),
    restore: vi.fn(async (id) => replace(id, { archivedAt: null })),
  };
}

async function mountPage(api: SubjectsApi) {
  const wrapper = mount(SubjectsPage, {
    global: { provide: { [subjectsApiKey as symbol]: api } },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

const statuses = (wrapper: Awaited<ReturnType<typeof mountPage>>) =>
  wrapper.findAll('[role="status"]').map((s) => s.text());

describe('SubjectsPage', () => {
  it('mostra estado vazio quando não há disciplinas', async () => {
    const wrapper = await mountPage(fakeApi());

    expect(wrapper.text()).toContain('Nenhuma disciplina cadastrada ainda.');
  });

  it('separa ativas e arquivadas', async () => {
    const wrapper = await mountPage(
      fakeApi([subject('1', 'Matemática'), subject('2', 'Latim', { archivedAt: createdAt })]),
    );

    expect(wrapper.get('ul[aria-label="Disciplinas cadastradas"]').text()).toContain('Matemática');
    expect(wrapper.get('ul[aria-label="Disciplinas cadastradas"]').text()).not.toContain('Latim');
    expect(wrapper.get('#archived-subjects-title').text()).toBe('Arquivadas (1)');
    expect(wrapper.get('ul[aria-label="Disciplinas arquivadas"]').text()).toContain('Latim');
  });

  it('cadastra, confirma e recarrega a lista', async () => {
    const api = fakeApi();
    const wrapper = await mountPage(api);

    await wrapper.get('#subject-name').setValue('História');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(api.register).toHaveBeenCalledWith('História');
    expect(statuses(wrapper)).toEqual(['Disciplina "História" cadastrada.']);
    expect(wrapper.get('ul').text()).toContain('História');
    expect((wrapper.get('#subject-name').element as HTMLInputElement).value).toBe('');
  });

  it('não volta ao estado "carregando" enquanto atualiza a lista após salvar', async () => {
    const api = fakeApi([subject('1', 'Matemática')]);
    let releaseList: () => void = () => {};
    const wrapper = await mountPage(api);
    api.list = vi.fn(
      () =>
        new Promise<SubjectDto[]>((resolve) => {
          releaseList = () => resolve([...api.items]);
        }),
    );

    await wrapper.get('#subject-name').setValue('História');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).not.toContain('Carregando disciplinas…');
    expect(wrapper.get('ul').text()).toContain('Matemática');

    releaseList();
    await flushPromises();
    expect(wrapper.get('ul').text()).toContain('História');
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
    const api = fakeApi([subject('1', 'Matemática')]);
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
    const api = fakeApi([subject('1', 'Matemática')]);
    api.list = vi
      .fn<SubjectsApi['list']>()
      .mockRejectedValueOnce(
        new ApiRequestError('network', 'Não foi possível conectar ao servidor.'),
      )
      .mockResolvedValueOnce([subject('1', 'Matemática')]);
    const wrapper = await mountPage(api);

    expect(wrapper.text()).toContain('Não foi possível conectar ao servidor.');

    await wrapper.get('button[type="button"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('ul').text()).toContain('Matemática');
  });

  describe('edição', () => {
    it('renomeia na própria lista enviando a versão exibida', async () => {
      const api = fakeApi([subject('1', 'Matematica')]);
      const wrapper = await mountPage(api);

      await wrapper.get('button[aria-label="Editar Matematica"]').trigger('click');
      expect(document.activeElement?.id).toBe('edit-1');
      await wrapper.get('#edit-1').setValue('Matemática');
      await wrapper.get('form.inline-edit').trigger('submit');
      await flushPromises();

      expect(api.update).toHaveBeenCalledWith('1', { name: 'Matemática', version: 1 });
      expect(statuses(wrapper)).toEqual(['Disciplina renomeada para "Matemática".']);
      expect(wrapper.find('#edit-1').exists()).toBe(false);
      expect(wrapper.get('ul').text()).toContain('Matemática');
    });

    it('Esc cancela a edição sem chamar a API', async () => {
      const api = fakeApi([subject('1', 'Matemática')]);
      const wrapper = await mountPage(api);

      await wrapper.get('button[aria-label="Editar Matemática"]').trigger('click');
      await wrapper.get('#edit-1').setValue('Outro');
      await wrapper.get('form.inline-edit').trigger('keydown', { key: 'Escape' });

      expect(wrapper.find('#edit-1').exists()).toBe(false);
      expect(api.update).not.toHaveBeenCalled();
    });

    it('mantém a edição aberta quando o nome é recusado', async () => {
      const api = fakeApi([subject('1', 'Matemática'), subject('2', 'História')]);
      api.update = vi.fn(async () => {
        throw new ApiRequestError(
          'subject.name_in_use',
          'Já existe uma disciplina chamada "História".',
        );
      });
      const wrapper = await mountPage(api);

      await wrapper.get('button[aria-label="Editar Matemática"]').trigger('click');
      await wrapper.get('#edit-1').setValue('historia');
      await wrapper.get('form.inline-edit').trigger('submit');
      await flushPromises();

      expect(wrapper.get('[role="alert"]').text()).toContain('Já existe uma disciplina');
      expect((wrapper.get('#edit-1').element as HTMLInputElement).value).toBe('historia');
    });

    it('versão desatualizada fecha a edição e recarrega a lista', async () => {
      const api = fakeApi([subject('1', 'Matemática')]);
      const wrapper = await mountPage(api);
      api.items[0] = subject('1', 'Matemática I', { version: 2 });
      api.update = vi.fn(async () => {
        throw new ApiRequestError('concurrency.stale', 'Este cadastro foi alterado...', 409);
      });

      await wrapper.get('button[aria-label="Editar Matemática"]').trigger('click');
      await wrapper.get('form.inline-edit').trigger('submit');
      await flushPromises();

      expect(wrapper.get('[role="alert"]').text()).toBe('Este cadastro foi alterado...');
      expect(wrapper.find('#edit-1').exists()).toBe(false);
      expect(wrapper.get('ul').text()).toContain('Matemática I');
    });
  });

  describe('arquivamento', () => {
    it('arquiva e restaura movendo entre as listas', async () => {
      const api = fakeApi([subject('1', 'Matemática')]);
      const wrapper = await mountPage(api);

      await wrapper.get('button[aria-label="Arquivar Matemática"]').trigger('click');
      await flushPromises();

      expect(api.archive).toHaveBeenCalledWith('1', 1);
      expect(statuses(wrapper)).toEqual(['Disciplina "Matemática" arquivada.']);
      expect(wrapper.text()).toContain('Nenhuma disciplina cadastrada ainda.');
      expect(wrapper.get('ul[aria-label="Disciplinas arquivadas"]').text()).toContain('Matemática');

      await wrapper.get('button[aria-label="Restaurar Matemática"]').trigger('click');
      await flushPromises();

      expect(api.restore).toHaveBeenCalledWith('1', 2);
      expect(wrapper.find('ul[aria-label="Disciplinas arquivadas"]').exists()).toBe(false);
      expect(wrapper.get('ul[aria-label="Disciplinas cadastradas"]').text()).toContain(
        'Matemática',
      );
    });
  });
});
