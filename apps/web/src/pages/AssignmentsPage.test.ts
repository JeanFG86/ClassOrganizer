import type {
  AssignmentDto,
  ClassGroupDto,
  SubjectDto,
  TeacherDto,
} from '@classorganizer/contracts';
import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../services/api-client.ts';
import { assignmentsApiKey, type AssignmentsApi } from '../services/assignments-api.ts';
import type { CatalogApi } from '../services/catalog-api.ts';
import { classGroupsApiKey } from '../services/class-groups-api.ts';
import { subjectsApiKey } from '../services/subjects-api.ts';
import { teachersApiKey, type TeachersApi } from '../services/teachers-api.ts';
import AssignmentsPage from './AssignmentsPage.vue';

const createdAt = '2026-02-01T12:00:00.000Z';
const base = { createdAt, archivedAt: null, version: 1 };

const noShift = { shiftId: null, periodIds: [] };
const c6a: ClassGroupDto = { id: 'c6a', name: '6º ano A', ...noShift, ...base };
const c6b: ClassGroupDto = { id: 'c6b', name: '6º ano B', ...noShift, ...base };
const math: SubjectDto = { id: 'math', name: 'Matemática', ...base };
const history: SubjectDto = { id: 'hist', name: 'História', ...base };
const noLimits = { maxWeeklyLessons: null, planningPeriods: 0, unavailable: [] };
const ana: TeacherDto = {
  id: 'ana',
  name: 'Ana',
  subjectIds: ['math', 'hist'],
  ...noLimits,
  ...base,
};
const bruno: TeacherDto = {
  id: 'bruno',
  name: 'Bruno',
  subjectIds: ['math'],
  ...noLimits,
  ...base,
};
const carla: TeacherDto = {
  id: 'carla',
  name: 'Carla',
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
    update: vi.fn(async (id, { teacherId, weeklyLessons }) => {
      const index = items.findIndex((a) => a.id === id);
      const current = items[index] as AssignmentDto;
      const next = { ...current, teacherId, weeklyLessons, version: current.version + 1 };
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
  return { id, classGroupId, subjectId, teacherId, weeklyLessons, createdAt, version: 1 };
}

async function mountPage(
  assignmentsApi: AssignmentsApi,
  options: { teachers?: TeacherDto[]; classGroups?: ClassGroupDto[] } = {},
) {
  const teachersApi: TeachersApi = {
    list: vi.fn(async () => options.teachers ?? [ana, bruno, carla]),
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
      ['História', 'Carla', '3'],
      ['Matemática', 'Ana', '5'],
    ]);
    expect(wrapper.text()).toContain('Turmas sem atribuições: 6º ano B.');

    const loads = wrapper
      .get('table[aria-label="Carga semanal por professor"]')
      .findAll('tbody tr')
      .map((r) => r.findAll('th, td').map((c) => c.text()));
    expect(loads).toEqual([
      ['Ana', '5', '—', '0', '1'],
      ['Bruno', '0', '—', '0', '0'],
      ['Carla', '3', '—', '0', '1'],
    ]);
  });

  it('só oferece professores habilitados na disciplina escolhida', async () => {
    const wrapper = await mountPage(fakeAssignmentsApi());
    const teacherSelect = wrapper.get('#assignment-teacher');

    expect(teacherSelect.attributes('disabled')).toBeDefined();

    await wrapper.get('#assignment-subject').setValue('math');
    expect(teacherSelect.attributes('disabled')).toBeUndefined();
    expect(optionTexts(wrapper, '#assignment-teacher')).toEqual([
      'Escolha o professor',
      'Ana',
      'Bruno',
    ]);

    await wrapper.get('#assignment-teacher').setValue('bruno');
    await wrapper.get('#assignment-subject').setValue('hist');
    expect(optionTexts(wrapper, '#assignment-teacher')).toEqual([
      'Escolha o professor',
      'Ana',
      'Carla',
    ]);
    expect((teacherSelect.element as HTMLSelectElement).value).toBe('');
  });

  it('seleciona sozinho o único professor habilitado', async () => {
    const wrapper = await mountPage(fakeAssignmentsApi(), { teachers: [ana, carla] });

    await wrapper.get('#assignment-subject').setValue('math');

    expect((wrapper.get('#assignment-teacher').element as HTMLSelectElement).value).toBe('ana');
  });

  it('desabilita disciplina que já tem professor na turma escolhida', async () => {
    const wrapper = await mountPage(
      fakeAssignmentsApi([assignment('a1', 'c6a', 'math', 'ana', 5)]),
    );

    await wrapper.get('#assignment-class-group').setValue('c6a');

    const mathOption = wrapper.get('#assignment-subject option[value="math"]');
    expect(mathOption.attributes('disabled')).toBeDefined();
    expect(mathOption.text()).toBe('Matemática (já atribuída nesta turma)');

    await wrapper.get('#assignment-class-group').setValue('c6b');
    expect(
      wrapper.get('#assignment-subject option[value="math"]').attributes('disabled'),
    ).toBeUndefined();
  });

  it('valida campos antes de chamar a API', async () => {
    const api = fakeAssignmentsApi();
    const wrapper = await mountPage(api);

    await wrapper.get('form').trigger('submit');
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Escolha a turma, a disciplina, o professor.',
    );

    await wrapper.get('#assignment-class-group').setValue('c6a');
    await wrapper.get('#assignment-subject').setValue('math');
    await wrapper.get('#assignment-teacher').setValue('ana');
    await wrapper.get('#assignment-lessons').setValue('41');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.get('[role="alert"]').text()).toContain('entre 1 e 40');

    expect(api.create).not.toHaveBeenCalled();
  });

  it('atribui, confirma e mantém a turma escolhida', async () => {
    const api = fakeAssignmentsApi();
    const wrapper = await mountPage(api);

    await wrapper.get('#assignment-class-group').setValue('c6a');
    await wrapper.get('#assignment-subject').setValue('math');
    await wrapper.get('#assignment-teacher').setValue('ana');
    await wrapper.get('#assignment-lessons').setValue('5');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(api.create).toHaveBeenCalledWith({
      classGroupId: 'c6a',
      subjectId: 'math',
      teacherId: 'ana',
      weeklyLessons: 5,
    });
    expect(wrapper.get('[role="status"]').text()).toBe(
      'Matemática em 6º ano A atribuída a Ana (5 aulas por semana).',
    );
    expect((wrapper.get('#assignment-class-group').element as HTMLSelectElement).value).toBe('c6a');
    expect((wrapper.get('#assignment-subject').element as HTMLSelectElement).value).toBe('');
    expect(wrapper.get('section[aria-label="Turma 6º ano A"]').text()).toContain('Matemática');
  });

  it('edita professor e carga com a versão exibida', async () => {
    const api = fakeAssignmentsApi([assignment('a1', 'c6a', 'math', 'ana', 5)]);
    const wrapper = await mountPage(api);

    await wrapper.get('button[aria-label="Editar Matemática em 6º ano A"]').trigger('click');
    expect(optionTexts(wrapper, '#edit-teacher-a1')).toEqual(['Ana', 'Bruno']);
    await wrapper.get('#edit-teacher-a1').setValue('bruno');
    await wrapper.get('#edit-lessons-a1').setValue('4');
    await wrapper.get('td.actions button.small:not(.ghost)').trigger('click');
    await flushPromises();

    expect(api.update).toHaveBeenCalledWith('a1', {
      teacherId: 'bruno',
      weeklyLessons: 4,
      version: 1,
    });
    expect(wrapper.get('[role="status"]').text()).toBe(
      'Atribuição de Matemática em 6º ano A atualizada.',
    );
    expect(wrapper.get('section[aria-label="Turma 6º ano A"] tbody').text()).toContain('Bruno');
  });

  it('remove só depois de confirmar', async () => {
    const api = fakeAssignmentsApi([assignment('a1', 'c6a', 'math', 'ana', 5)]);
    const wrapper = await mountPage(api);

    await wrapper.get('button[aria-label="Remover Matemática em 6º ano A"]').trigger('click');
    expect(api.remove).not.toHaveBeenCalled();

    await wrapper
      .get('button[aria-label="Confirmar remoção de Matemática em 6º ano A"]')
      .trigger('click');
    await flushPromises();

    expect(api.remove).toHaveBeenCalledWith('a1', 1);
    expect(wrapper.get('[role="status"]').text()).toBe(
      'Atribuição de Matemática em 6º ano A removida.',
    );
    expect(wrapper.text()).toContain('Nenhuma atribuição feita ainda.');
  });

  it('dado desatualizado mostra o aviso e recarrega', async () => {
    const api = fakeAssignmentsApi([assignment('a1', 'c6a', 'math', 'ana', 5)]);
    const wrapper = await mountPage(api);
    api.items[0] = { ...assignment('a1', 'c6a', 'math', 'bruno', 2), version: 2 };
    api.remove = vi.fn(async () => {
      throw new ApiRequestError('concurrency.stale', 'Este cadastro foi alterado...', 409);
    });

    await wrapper.get('button[aria-label="Remover Matemática em 6º ano A"]').trigger('click');
    await wrapper
      .get('button[aria-label="Confirmar remoção de Matemática em 6º ano A"]')
      .trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('Este cadastro foi alterado...');
    expect(wrapper.get('section[aria-label="Turma 6º ano A"] tbody').text()).toContain('Bruno');
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
          { ...bruno, maxWeeklyLessons: 20 },
          carla,
        ],
      },
    );

    expect(wrapper.get('p.error').text()).toBe('Acima da carga máxima: Ana (10 de 8).');
    const ana10 = wrapper.get('table[aria-label="Carga semanal por professor"] tbody tr');
    expect(ana10.findAll('th, td').map((c) => c.text())).toEqual([
      'Ana',
      '10 (acima do máximo)',
      '8',
      '4',
      '2',
    ]);
  });
});
