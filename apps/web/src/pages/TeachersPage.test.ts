import type { SubjectDto, TeacherDto } from '@classorganizer/contracts';
import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../services/api-client.ts';
import { subjectsApiKey, type SubjectsApi } from '../services/subjects-api.ts';
import { teachersApiKey, type TeachersApi } from '../services/teachers-api.ts';
import TeachersPage from './TeachersPage.vue';

const createdAt = '2026-02-01T12:00:00.000Z';

function subject(id: string, name: string, extra: Partial<SubjectDto> = {}): SubjectDto {
  return { id, name, createdAt, archivedAt: null, version: 1, ...extra };
}

function teacher(
  id: string,
  name: string,
  subjectIds: string[],
  extra: Partial<TeacherDto> = {},
): TeacherDto {
  return {
    id,
    name,
    subjectIds,
    maxWeeklyLessons: null,
    planningPeriods: 0,
    unavailable: [],
    createdAt,
    archivedAt: null,
    version: 1,
    ...extra,
  };
}

const math = subject('s1', 'Matemática');
const history = subject('s2', 'História');
const latin = subject('s3', 'Latim', { archivedAt: createdAt });

function fakeSubjectsApi(items: SubjectDto[]): SubjectsApi {
  return {
    list: vi.fn(async () => items),
    register: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
  };
}

function fakeTeachersApi(initial: TeacherDto[] = []): TeachersApi & { items: TeacherDto[] } {
  const items = [...initial];
  const replace = (id: string, change: Partial<TeacherDto>) => {
    const index = items.findIndex((t) => t.id === id);
    const current = items[index] as TeacherDto;
    const next = { ...current, ...change, version: current.version + 1 };
    items[index] = next;
    return next;
  };
  return {
    items,
    list: vi.fn(async () => [...items]),
    register: vi.fn(async ({ name, subjectIds, maxWeeklyLessons, planningPeriods }) => {
      const created = teacher(`t${items.length + 1}`, name, subjectIds, {
        maxWeeklyLessons,
        planningPeriods,
      });
      items.push(created);
      return created;
    }),
    update: vi.fn(async (id, { name, subjectIds, maxWeeklyLessons, planningPeriods }) =>
      replace(id, { name, subjectIds, maxWeeklyLessons, planningPeriods }),
    ),
    archive: vi.fn(async (id) => replace(id, { archivedAt: createdAt })),
    restore: vi.fn(async (id) => replace(id, { archivedAt: null })),
    changeAvailability: vi.fn(),
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
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>;
const optionLabels = (wrapper: Wrapper) => wrapper.findAll('fieldset label').map((l) => l.text());
const checked = (wrapper: Wrapper) =>
  wrapper
    .findAll<HTMLInputElement>('input[type="checkbox"]')
    .filter((c) => c.element.checked)
    .map((c) => c.element.value);
const activeItems = (wrapper: Wrapper) =>
  wrapper.findAll('ul[aria-label="Professores cadastrados"] .item-name').map((n) => n.text());

describe('TeachersPage', () => {
  it('oferece apenas disciplinas ativas no cadastro', async () => {
    const wrapper = await mountPage(fakeSubjectsApi([math, history, latin]), fakeTeachersApi());

    expect(optionLabels(wrapper)).toEqual(['Matemática', 'História']);
    expect(wrapper.get('fieldset legend').text()).toBe('Disciplinas que pode lecionar');
    expect(wrapper.get('#teacher-form-title').text()).toBe('Novo professor');
  });

  it('orienta a cadastrar disciplinas quando não há nenhuma', async () => {
    const wrapper = await mountPage(fakeSubjectsApi([]), fakeTeachersApi());

    expect(wrapper.get('fieldset').text()).toContain('Nenhuma disciplina cadastrada.');
    expect(wrapper.getComponent(RouterLinkStub).props('to')).toBe('/disciplinas');
  });

  it('lista professores com as disciplinas, marcando as arquivadas', async () => {
    const wrapper = await mountPage(
      fakeSubjectsApi([math, history, latin]),
      fakeTeachersApi([
        teacher('t1', 'Ana', ['s2', 's3']),
        teacher('t2', 'Bruno', []),
        teacher('t3', 'Carla', [], { archivedAt: createdAt }),
      ]),
    );

    expect(activeItems(wrapper)).toEqual([
      'Ana — História, Latim (arquivada)',
      'Bruno — Sem habilitações',
    ]);
    expect(wrapper.get('ul[aria-label="Professores arquivados"]').text()).toContain('Carla');
  });

  it('cadastra com as disciplinas marcadas e limpa o formulário', async () => {
    const teachersApi = fakeTeachersApi();
    const wrapper = await mountPage(fakeSubjectsApi([math, history]), teachersApi);

    await wrapper.get('#teacher-name').setValue('Ana Souza');
    await wrapper.get('input[type="checkbox"][value="s2"]').setValue(true);
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(teachersApi.register).toHaveBeenCalledWith({
      name: 'Ana Souza',
      subjectIds: ['s2'],
      maxWeeklyLessons: null,
      planningPeriods: 0,
    });
    expect(wrapper.findAll('[role="status"]').map((s) => s.text())).toEqual([
      'Professor(a) "Ana Souza" cadastrado(a).',
    ]);
    expect(activeItems(wrapper)).toEqual(['Ana Souza — História']);
    expect((wrapper.get('#teacher-name').element as HTMLInputElement).value).toBe('');
    expect(checked(wrapper)).toEqual([]);
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
    expect(checked(wrapper)).toEqual(['s1']);
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

  describe('edição', () => {
    it('carrega o professor no formulário e salva com a versão', async () => {
      const teachersApi = fakeTeachersApi([teacher('t1', 'Ana', ['s1'])]);
      const wrapper = await mountPage(fakeSubjectsApi([math, history]), teachersApi);

      await wrapper.get('button[aria-label="Editar Ana"]').trigger('click');

      expect(wrapper.get('#teacher-form-title').text()).toBe('Editar professor: Ana');
      expect((wrapper.get('#teacher-name').element as HTMLInputElement).value).toBe('Ana');
      expect(checked(wrapper)).toEqual(['s1']);
      expect(document.activeElement?.id).toBe('teacher-name');

      await wrapper.get('#teacher-name').setValue('Ana Souza');
      await wrapper.get('input[type="checkbox"][value="s2"]').setValue(true);
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(teachersApi.update).toHaveBeenCalledWith('t1', {
        name: 'Ana Souza',
        subjectIds: ['s1', 's2'],
        maxWeeklyLessons: null,
        planningPeriods: 0,
        version: 1,
      });
      expect(wrapper.get('[role="status"]').text()).toBe('Professor(a) "Ana Souza" atualizado(a).');
      expect(wrapper.get('#teacher-form-title').text()).toBe('Novo professor');
      expect(activeItems(wrapper)).toEqual(['Ana Souza — Matemática, História']);
    });

    it('na edição, oferece a disciplina arquivada em que o professor já é habilitado', async () => {
      const wrapper = await mountPage(
        fakeSubjectsApi([math, latin]),
        fakeTeachersApi([teacher('t1', 'Ana', ['s3'])]),
      );

      expect(optionLabels(wrapper)).toEqual(['Matemática']);

      await wrapper.get('button[aria-label="Editar Ana"]').trigger('click');

      expect(optionLabels(wrapper)).toEqual(['Matemática', 'Latim (arquivada)']);
      expect(checked(wrapper)).toEqual(['s3']);
    });

    it('cancelar volta ao cadastro sem chamar a API', async () => {
      const teachersApi = fakeTeachersApi([teacher('t1', 'Ana', [])]);
      const wrapper = await mountPage(fakeSubjectsApi([math]), teachersApi);

      await wrapper.get('button[aria-label="Editar Ana"]').trigger('click');
      await wrapper.get('form .form-actions button[type="button"]').trigger('click');

      expect(wrapper.get('#teacher-form-title').text()).toBe('Novo professor');
      expect((wrapper.get('#teacher-name').element as HTMLInputElement).value).toBe('');
      expect(teachersApi.update).not.toHaveBeenCalled();
    });

    it('versão desatualizada descarta a edição e recarrega', async () => {
      const teachersApi = fakeTeachersApi([teacher('t1', 'Ana', [])]);
      const wrapper = await mountPage(fakeSubjectsApi([math]), teachersApi);
      teachersApi.items[0] = teacher('t1', 'Ana Paula', [], { version: 2 });
      teachersApi.update = vi.fn(async () => {
        throw new ApiRequestError('concurrency.stale', 'Este cadastro foi alterado...', 409);
      });

      await wrapper.get('button[aria-label="Editar Ana"]').trigger('click');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(wrapper.get('[role="alert"]').text()).toBe('Este cadastro foi alterado...');
      expect(wrapper.get('#teacher-form-title').text()).toBe('Novo professor');
      expect(activeItems(wrapper)).toEqual(['Ana Paula — Sem habilitações']);
    });
  });

  describe('arquivamento', () => {
    it('arquiva e restaura com a versão exibida', async () => {
      const teachersApi = fakeTeachersApi([teacher('t1', 'Ana', [])]);
      const wrapper = await mountPage(fakeSubjectsApi([math]), teachersApi);

      await wrapper.get('button[aria-label="Arquivar Ana"]').trigger('click');
      await flushPromises();

      expect(teachersApi.archive).toHaveBeenCalledWith('t1', 1);
      expect(wrapper.get('[role="status"]').text()).toBe('Professor(a) "Ana" arquivado(a).');
      expect(wrapper.text()).toContain('Nenhum professor cadastrado ainda.');

      await wrapper.get('button[aria-label="Restaurar Ana"]').trigger('click');
      await flushPromises();

      expect(teachersApi.restore).toHaveBeenCalledWith('t1', 2);
      expect(activeItems(wrapper)).toEqual(['Ana — Sem habilitações']);
    });

    it('arquivar o professor em edição limpa o formulário', async () => {
      const wrapper = await mountPage(
        fakeSubjectsApi([math]),
        fakeTeachersApi([teacher('t1', 'Ana', [])]),
      );

      await wrapper.get('button[aria-label="Editar Ana"]').trigger('click');
      await wrapper.get('button[aria-label="Arquivar Ana"]').trigger('click');
      await flushPromises();

      expect(wrapper.get('#teacher-form-title').text()).toBe('Novo professor');
    });
  });

  describe('carga máxima e hora-atividade', () => {
    it('cadastra com os valores informados e os mostra na lista', async () => {
      const teachersApi = fakeTeachersApi();
      const wrapper = await mountPage(fakeSubjectsApi([math]), teachersApi);

      await wrapper.get('#teacher-name').setValue('Ana');
      await wrapper.get('#teacher-max-lessons').setValue('20');
      await wrapper.get('#teacher-planning').setValue('7');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(teachersApi.register).toHaveBeenCalledWith({
        name: 'Ana',
        subjectIds: [],
        maxWeeklyLessons: 20,
        planningPeriods: 7,
      });
      expect(wrapper.get('ul[aria-label="Professores cadastrados"] .item-detail').text()).toBe(
        '· até 20 aulas · 7 de hora-atividade',
      );
      expect(wrapper.get<HTMLInputElement>('#teacher-max-lessons').element.value).toBe('');
    });

    it('carrega os valores na edição; apagar a carga máxima envia sem limite', async () => {
      const teachersApi = fakeTeachersApi([
        teacher('t1', 'Ana', [], { maxWeeklyLessons: 20, planningPeriods: 7 }),
      ]);
      const wrapper = await mountPage(fakeSubjectsApi([math]), teachersApi);

      await wrapper.get('button[aria-label="Editar Ana"]').trigger('click');
      expect(wrapper.get<HTMLInputElement>('#teacher-max-lessons').element.value).toBe('20');
      expect(wrapper.get<HTMLInputElement>('#teacher-planning').element.value).toBe('7');

      await wrapper.get('#teacher-max-lessons').setValue('');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(teachersApi.update).toHaveBeenCalledWith('t1', {
        name: 'Ana',
        subjectIds: [],
        maxWeeklyLessons: null,
        planningPeriods: 7,
        version: 1,
      });
    });

    it('leva à disponibilidade do professor', async () => {
      const wrapper = await mountPage(
        fakeSubjectsApi([math]),
        fakeTeachersApi([teacher('t1', 'Ana', [])]),
      );

      const link = wrapper.getComponent(RouterLinkStub);
      expect(link.props('to')).toEqual({ path: '/disponibilidade', query: { professor: 't1' } });
    });
  });
});
