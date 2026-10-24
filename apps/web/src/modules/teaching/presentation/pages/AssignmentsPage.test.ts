import type {
  AssignmentDto,
  ClassGroupDto,
  ResourceDto,
  SubjectDto,
  TeacherDto,
} from '@classorganizer/contracts';
import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../../../shared/application/api-error.ts';
import { assignmentsApiKey } from '../assignments-key.ts';
import { type AssignmentsApi } from '../../application/assignments-api.ts';
import type { CatalogApi } from '../../../../shared/application/catalog-api.ts';
import { classGroupsApiKey } from '../../../school-structure/index.ts';
import { resourcesApiKey } from '../../../school-structure/index.ts';
import { subjectsApiKey } from '../../../school-structure/index.ts';
import { teachersApiKey } from '../teachers-key.ts';
import { type TeachersApi } from '../../application/teachers-api.ts';
import AssignmentsPage from './AssignmentsPage.vue';

const createdAt = '2026-02-01T12:00:00.000Z';
const base = { createdAt, archivedAt: null, version: 1 };

const noShift = { shiftId: null, periodIds: [] };
const c6a: ClassGroupDto = { id: 'c6a', name: '6º ano A', ...noShift, ...base };
const c6b: ClassGroupDto = { id: 'c6b', name: '6º ano B', ...noShift, ...base };
const math: SubjectDto = { id: 'math', name: 'Matemática', ...base };
const history: SubjectDto = { id: 'hist', name: 'História', ...base };
const lab: ResourceDto = { id: 'lab', name: 'Laboratório', ...base };
const oldRoom: ResourceDto = { id: 'old', name: 'Sala antiga', ...base, archivedAt: createdAt };
const noLimits = { maxWeeklyLessons: null, planningPeriods: 0, unavailable: [] };
const ana: TeacherDto = {
  id: 'ana',
  name: 'Docente Alfa',
  subjectIds: ['math', 'hist'],
  ...noLimits,
  ...base,
};
const secondTeacher: TeacherDto = {
  id: 'secondTeacher',
  name: 'Docente Beta',
  subjectIds: ['math'],
  ...noLimits,
  ...base,
};
const carla: TeacherDto = {
  id: 'carla',
  name: 'Docente Gama',
  subjectIds: ['hist'],
  ...noLimits,
  ...base,
};

function catalog<T>(
  items: T[],
): CatalogApi<T & { id: string; name: string; archivedAt: string | null; version: number }> {
  return {
    list: vi.fn(async () => items as never),
    register: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
  };
}

function fakeAssignmentsApi(
  initial: AssignmentDto[] = [],
): AssignmentsApi & { items: AssignmentDto[] } {
  const items = [...initial];
  return {
    items,
    list: vi.fn(async () => [...items]),
    create: vi.fn(async (input) => {
      const created = { id: `a${items.length + 1}`, ...input, createdAt, version: 1 };
      items.push(created);
      return created;
    }),
    update: vi.fn(async (id, { participants, weeklyLessons }) => {
      const index = items.findIndex((a) => a.id === id);
      const current = items[index] as AssignmentDto;
      const next = { ...current, participants, weeklyLessons, version: current.version + 1 };
      items[index] = next;
      return next;
    }),
    remove: vi.fn(async (id) => {
      items.splice(
        items.findIndex((a) => a.id === id),
        1,
      );
    }),
  };
}

function assignment(
  id: string,
  classGroupId: string,
  subjectId: string,
  teacherId: string,
  weeklyLessons: number,
): AssignmentDto {
  return {
    id,
    classGroupId,
    participants: [{ subjectId, teacherId }],
    weeklyLessons,
    resourceIds: [],
    createdAt,
    version: 1,
  };
}

async function mountPage(
  assignmentsApi: AssignmentsApi,
  options: {
    teachers?: TeacherDto[];
    classGroups?: ClassGroupDto[];
    resources?: ResourceDto[];
  } = {},
) {
  const teachersApi: TeachersApi = {
    list: vi.fn(async () => options.teachers ?? [ana, secondTeacher, carla]),
    register: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    changeAvailability: vi.fn(),
  };
  const wrapper = mount(AssignmentsPage, {
    global: {
      provide: {
        [assignmentsApiKey as symbol]: assignmentsApi,
        [classGroupsApiKey as symbol]: catalog(options.classGroups ?? [c6a, c6b]),
        [subjectsApiKey as symbol]: catalog([math, history]),
        [resourcesApiKey as symbol]: catalog(options.resources ?? []),
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
const optionTexts = (wrapper: Wrapper, selector: string) =>
  wrapper.findAll(`${selector} option`).map((o) => o.text());

describe('AssignmentsPage', () => {
  it('agrupa por turma com totais e mostra a carga por professor', async () => {
    const wrapper = await mountPage(
      fakeAssignmentsApi([
        assignment('a1', 'c6a', 'math', 'ana', 5),
        assignment('a2', 'c6a', 'hist', 'carla', 3),
      ]),
    );

    const group = wrapper.get('section[aria-label="Turma 6º ano A"]');
    expect(group.get('h3').text()).toBe('6º ano A — 8 aulas por semana');
    expect(
      group.findAll('tbody tr').map((r) =>
        r
          .findAll('th, td')
          .slice(0, 3)
          .map((c) => c.text()),
      ),
    ).toEqual([
      ['1', 'História — Docente Gama', '3'],
      ['2', 'Matemática — Docente Alfa', '5'],
    ]);
    expect(wrapper.text()).toContain('Turmas sem atribuições: 6º ano B.');

    const loads = wrapper
      .get('table[aria-label="Carga semanal por professor"]')
      .findAll('tbody tr')
      .map((r) => r.findAll('th, td').map((c) => c.text()));
    expect(loads).toEqual([
      ['Docente Alfa', '5', '—', '0', '1'],
      ['Docente Beta', '0', '—', '0', '0'],
      ['Docente Gama', '3', '—', '0', '1'],
    ]);
  });

  it('só oferece professores habilitados na disciplina escolhida', async () => {
    const wrapper = await mountPage(fakeAssignmentsApi());
    const teacherSelect = wrapper.get('#assignment-teacher-0');

    expect(teacherSelect.attributes('disabled')).toBeDefined();

    await wrapper.get('#assignment-subject-0').setValue('math');
    expect(teacherSelect.attributes('disabled')).toBeUndefined();
    expect(optionTexts(wrapper, '#assignment-teacher-0')).toEqual([
      'Escolha o professor',
      'Docente Alfa',
      'Docente Beta',
    ]);

    await wrapper.get('#assignment-teacher-0').setValue('secondTeacher');
    await wrapper.get('#assignment-subject-0').setValue('hist');
    expect(optionTexts(wrapper, '#assignment-teacher-0')).toEqual([
      'Escolha o professor',
      'Docente Alfa',
      'Docente Gama',
    ]);
    expect((teacherSelect.element as HTMLSelectElement).value).toBe('');
  });

  it('seleciona sozinho o único professor habilitado', async () => {
    const wrapper = await mountPage(fakeAssignmentsApi(), { teachers: [ana, carla] });

    await wrapper.get('#assignment-subject-0').setValue('math');

    expect((wrapper.get('#assignment-teacher-0').element as HTMLSelectElement).value).toBe('ana');
  });

  it('permite a mesma disciplina em blocos separados', async () => {
    const wrapper = await mountPage(
      fakeAssignmentsApi([assignment('a1', 'c6a', 'math', 'ana', 5)]),
    );

    await wrapper.get('#assignment-class-group').setValue('c6a');

    const mathOption = wrapper.get('#assignment-subject-0 option[value="math"]');
    expect(mathOption.attributes('disabled')).toBeUndefined();
    expect(mathOption.text()).toBe('Matemática');

    await wrapper.get('#assignment-class-group').setValue('c6b');
    expect(
      wrapper.get('#assignment-subject-0 option[value="math"]').attributes('disabled'),
    ).toBeUndefined();
  });

  it('valida campos antes de chamar a API', async () => {
    const api = fakeAssignmentsApi();
    const wrapper = await mountPage(api);

    await wrapper.get('form').trigger('submit');
    expect(wrapper.get('[role="alert"]').text()).toBe('Escolha a turma.');

    await wrapper.get('#assignment-class-group').setValue('c6a');
    await wrapper.get('#assignment-subject-0').setValue('math');
    await wrapper.get('#assignment-teacher-0').setValue('ana');
    await wrapper.get('#assignment-lessons').setValue('41');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.get('[role="alert"]').text()).toContain('entre 1 e 40');

    expect(api.create).not.toHaveBeenCalled();
  });

  it('atribui, confirma e mantém a turma escolhida', async () => {
    const api = fakeAssignmentsApi();
    const wrapper = await mountPage(api);

    await wrapper.get('#assignment-class-group').setValue('c6a');
    await wrapper.get('#assignment-subject-0').setValue('math');
    await wrapper.get('#assignment-teacher-0').setValue('ana');
    await wrapper.get('#assignment-lessons').setValue('5');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(api.create).toHaveBeenCalledWith({
      classGroupId: 'c6a',
      participants: [{ subjectId: 'math', teacherId: 'ana' }],
      weeklyLessons: 5,
      resourceIds: [],
    });
    expect(wrapper.text()).not.toContain('Recursos especiais');
    expect(wrapper.get('[role="status"]').text()).toBe('Bloco de aulas em 6º ano A criado.');
    expect((wrapper.get('#assignment-class-group').element as HTMLSelectElement).value).toBe('c6a');
    expect((wrapper.get('#assignment-subject-0').element as HTMLSelectElement).value).toBe('');
    expect(wrapper.get('section[aria-label="Turma 6º ano A"]').text()).toContain('Matemática');
  });

  it('edita professor e carga com a versão exibida', async () => {
    const api = fakeAssignmentsApi([assignment('a1', 'c6a', 'math', 'ana', 5)]);
    const wrapper = await mountPage(api);

    await wrapper.get('button[aria-label="Editar bloco 1 em 6º ano A"]').trigger('click');
    expect(optionTexts(wrapper, '#edit-a1-teacher-0')).toEqual([
      'Escolha o professor',
      'Docente Alfa',
      'Docente Beta',
    ]);
    await wrapper.get('#edit-a1-teacher-0').setValue('secondTeacher');
    await wrapper.get('#edit-lessons-a1').setValue('4');
    await wrapper.get('td form').trigger('submit');
    await flushPromises();

    expect(api.update).toHaveBeenCalledWith('a1', {
      participants: [{ subjectId: 'math', teacherId: 'secondTeacher' }],
      weeklyLessons: 4,
      resourceIds: [],
      version: 1,
    });
    expect(wrapper.get('[role="status"]').text()).toBe('Bloco de aulas atualizado.');
    expect(wrapper.get('section[aria-label="Turma 6º ano A"] tbody').text()).toContain(
      'Docente Beta',
    );
  });

  it('remove só depois de confirmar', async () => {
    const api = fakeAssignmentsApi([assignment('a1', 'c6a', 'math', 'ana', 5)]);
    const wrapper = await mountPage(api);

    await wrapper.get('button[aria-label="Remover bloco 1 em 6º ano A"]').trigger('click');
    expect(api.remove).not.toHaveBeenCalled();

    await wrapper
      .get('button[aria-label="Confirmar remoção do bloco 1 em 6º ano A"]')
      .trigger('click');
    await flushPromises();

    expect(api.remove).toHaveBeenCalledWith('a1', 1);
    expect(wrapper.get('[role="status"]').text()).toBe('Bloco de aulas removido.');
    expect(wrapper.text()).toContain('Nenhuma atribuição feita ainda.');
  });

  it('dado desatualizado mostra o aviso e recarrega', async () => {
    const api = fakeAssignmentsApi([assignment('a1', 'c6a', 'math', 'ana', 5)]);
    const wrapper = await mountPage(api);
    api.items[0] = { ...assignment('a1', 'c6a', 'math', 'secondTeacher', 2), version: 2 };
    api.remove = vi.fn(async () => {
      throw new ApiRequestError('concurrency.stale', 'Este cadastro foi alterado...', 409);
    });

    await wrapper.get('button[aria-label="Remover bloco 1 em 6º ano A"]').trigger('click');
    await wrapper
      .get('button[aria-label="Confirmar remoção do bloco 1 em 6º ano A"]')
      .trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('Este cadastro foi alterado...');
    expect(wrapper.get('section[aria-label="Turma 6º ano A"] tbody').text()).toContain(
      'Docente Beta',
    );
  });

  it('orienta a cadastrar turmas quando não há nenhuma', async () => {
    const wrapper = await mountPage(fakeAssignmentsApi(), { classGroups: [] });

    expect(wrapper.text()).toContain('Nenhuma turma cadastrada.');
  });

  it('avisa quem passou da carga máxima, sem impedir a atribuição', async () => {
    const wrapper = await mountPage(
      fakeAssignmentsApi([
        assignment('a1', 'c6a', 'math', 'ana', 5),
        assignment('a2', 'c6b', 'math', 'ana', 5),
      ]),
      {
        teachers: [
          { ...ana, maxWeeklyLessons: 8, planningPeriods: 4 },
          { ...secondTeacher, maxWeeklyLessons: 20 },
          carla,
        ],
      },
    );

    expect(wrapper.get('p.error').text()).toBe('Acima da carga máxima: Docente Alfa (10 de 8).');
    const ana10 = wrapper.get('table[aria-label="Carga semanal por professor"] tbody tr');
    expect(ana10.findAll('th, td').map((c) => c.text())).toEqual([
      'Docente Alfa',
      '10 (acima do máximo)',
      '8',
      '4',
      '2',
    ]);
  });

  it('conta o bloco uma vez na turma e para todos os participantes, somando blocos separados', async () => {
    const shared = {
      ...assignment('a1', 'c6a', 'math', 'ana', 2),
      participants: [
        { subjectId: 'math', teacherId: 'ana' },
        { subjectId: 'math', teacherId: 'secondTeacher' },
        { subjectId: 'hist', teacherId: 'carla' },
      ],
    };
    const wrapper = await mountPage(
      fakeAssignmentsApi([shared, assignment('a2', 'c6a', 'math', 'secondTeacher', 3)]),
    );
    expect(wrapper.get('section[aria-label="Turma 6º ano A"] h3').text()).toBe(
      '6º ano A — 5 aulas por semana',
    );
    const rows = wrapper.get('table[aria-label="Carga semanal por professor"]').findAll('tbody tr');
    expect(rows.map((r) => r.findAll('th, td').map((c) => c.text()))).toEqual([
      ['Docente Alfa', '2', '—', '0', '1'],
      ['Docente Beta', '5', '—', '0', '1'],
      ['Docente Gama', '2', '—', '0', '1'],
    ]);
  });

  it('adiciona e remove participantes e salva professores da mesma disciplina e de outra', async () => {
    const api = fakeAssignmentsApi();
    const wrapper = await mountPage(api);
    const add = () => wrapper.findAll('button').find((b) => b.text() === 'Adicionar professor');
    await wrapper.get('#assignment-class-group').setValue('c6a');
    await wrapper.get('#assignment-subject-0').setValue('math');
    await wrapper.get('#assignment-teacher-0').setValue('ana');
    await add()?.trigger('click');
    await wrapper.get('#assignment-subject-1').setValue('math');
    expect(
      wrapper.get('#assignment-teacher-1 option[value="ana"]').attributes('disabled'),
    ).toBeDefined();
    await wrapper.get('#assignment-teacher-1').setValue('secondTeacher');
    await add()?.trigger('click');
    await wrapper.get('#assignment-subject-2').setValue('hist');
    await wrapper.get('#assignment-teacher-2').setValue('carla');
    await add()?.trigger('click');
    await wrapper.get('button[aria-label="Remover participante 4"]').trigger('click');
    await wrapper.get('#assignment-lessons').setValue('2');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(api.create).toHaveBeenCalledWith({
      classGroupId: 'c6a',
      weeklyLessons: 2,
      participants: [
        { subjectId: 'math', teacherId: 'ana' },
        { subjectId: 'math', teacherId: 'secondTeacher' },
        { subjectId: 'hist', teacherId: 'carla' },
      ],
      resourceIds: [],
    });
  });

  it('marca recursos especiais no bloco e mostra os arquivados só onde já estão', async () => {
    const used = { ...assignment('a1', 'c6a', 'math', 'ana', 5), resourceIds: ['old'] };
    const api = fakeAssignmentsApi([used]);
    const wrapper = await mountPage(api, { resources: [lab, oldRoom] });
    const labels = (selector: string) =>
      wrapper.findAll(selector + ' label.check').map((l) => l.text());

    const create = wrapper.get('form[aria-labelledby="assignment-form-title"]');
    expect(create.text()).toContain('Recursos especiais usados pelo bloco (opcional)');
    expect(labels('form[aria-labelledby="assignment-form-title"]')).toEqual(['Laboratório']);
    expect(wrapper.get('section[aria-label="Turma 6º ano A"]').text()).toContain(
      'Recurso: Sala antiga (arquivado)',
    );
    await wrapper.get('#assignment-class-group').setValue('c6b');
    await wrapper.get('#assignment-subject-0').setValue('math');
    await wrapper.get('#assignment-teacher-0').setValue('ana');
    await wrapper.get('#assignment-lessons').setValue('2');
    await create.get('input[type="checkbox"][value="lab"]').setValue(true);
    await create.trigger('submit');
    await flushPromises();
    expect(api.create).toHaveBeenCalledWith({
      classGroupId: 'c6b',
      participants: [{ subjectId: 'math', teacherId: 'ana' }],
      weeklyLessons: 2,
      resourceIds: ['lab'],
    });

    await wrapper.get('button[aria-label="Editar bloco 1 em 6º ano A"]').trigger('click');
    expect(labels('td form')).toEqual(['Laboratório', 'Sala antiga (arquivado)']);
    await wrapper.get('td form input[type="checkbox"][value="old"]').setValue(false);
    await wrapper.get('td form').trigger('submit');
    await flushPromises();
    expect(api.update).toHaveBeenCalledWith('a1', {
      participants: [{ subjectId: 'math', teacherId: 'ana' }],
      weeklyLessons: 5,
      resourceIds: [],
      version: 1,
    });
  });

  it('edita o conjunto de participantes sem alterar a lista antes de salvar e permite cancelar', async () => {
    const api = fakeAssignmentsApi([assignment('a1', 'c6a', 'math', 'ana', 5)]);
    const wrapper = await mountPage(api);
    const edit = () =>
      wrapper.get('button[aria-label="Editar bloco 1 em 6º ano A"]').trigger('click');
    await edit();
    await wrapper.get('#edit-a1-teacher-0').setValue('secondTeacher');
    expect(api.items[0]?.participants[0]?.teacherId).toBe('ana');
    await wrapper
      .findAll('td form button')
      .find((b) => b.text() === 'Cancelar')
      ?.trigger('click');
    expect(api.update).not.toHaveBeenCalled();
    await edit();
    await wrapper
      .findAll('td form button')
      .find((b) => b.text() === 'Adicionar professor')
      ?.trigger('click');
    await wrapper.get('#edit-a1-subject-1').setValue('hist');
    await wrapper.get('#edit-a1-teacher-1').setValue('carla');
    await wrapper.get('td form').trigger('submit');
    await flushPromises();
    expect(api.update).toHaveBeenCalledWith('a1', {
      weeklyLessons: 5,
      version: 1,
      resourceIds: [],
      participants: [
        { subjectId: 'math', teacherId: 'ana' },
        { subjectId: 'hist', teacherId: 'carla' },
      ],
    });
  });

  it('exibe carregamento e permite tentar novamente após erro', async () => {
    const api = fakeAssignmentsApi();
    let finish: (items: AssignmentDto[]) => void = () => {};
    api.list = vi
      .fn()
      .mockRejectedValueOnce(new Error('Falha de teste'))
      .mockImplementationOnce(
        () =>
          new Promise<AssignmentDto[]>((resolve) => {
            finish = resolve;
          }),
      );
    const wrapper = await mountPage(api);
    expect(wrapper.get('[role="alert"]').text()).toContain('Ocorreu um erro inesperado.');
    await wrapper.get('button').trigger('click');
    expect(wrapper.get('[role="status"]').text()).toContain('Carregando');
    finish([]);
    await flushPromises();
    expect(wrapper.text()).toContain('Nenhuma atribuição feita ainda.');
  });
});
