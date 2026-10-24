import type { AssignmentDto, ShiftDto, TeacherDto } from '@classorganizer/contracts';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { ApiRequestError } from '../services/api-client.ts';
import { assignmentsApiKey, type AssignmentsApi } from '../services/assignments-api.ts';
import { shiftsApiKey, type ShiftsApi } from '../services/shifts-api.ts';
import { teachersApiKey, type TeachersApi } from '../services/teachers-api.ts';
import AvailabilityPage from './AvailabilityPage.vue';

const createdAt = '2026-02-01T12:00:00.000Z';
const base = { createdAt, archivedAt: null, version: 1 };

const manha: ShiftDto = {
  id: 'manha',
  name: 'Manhã',
  periods: [
    { id: 'p1', start: '07:30', end: '08:20' },
    { id: 'p2', start: '08:20', end: '09:10' },
  ],
  ...base,
};
const antigo: ShiftDto = {
  id: 'antigo',
  name: 'Antigo',
  periods: [{ id: 'x1', start: '18:00', end: '18:50' }],
  ...base,
  archivedAt: createdAt,
};

function teacher(id: string, name: string, extra: Partial<TeacherDto> = {}): TeacherDto {
  return {
    id,
    name,
    subjectIds: [],
    maxWeeklyLessons: 20,
    planningPeriods: 7,
    unavailable: [],
    ...base,
    ...extra,
  };
}

function fakeTeachersApi(initial: TeacherDto[]) {
  const items = [...initial];
  return {
    items,
    list: vi.fn(async () => [...items]),
    register: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    changeAvailability: vi.fn<TeachersApi['changeAvailability']>(async (id, { unavailable }) => {
      const index = items.findIndex((t) => t.id === id);
      const current = items[index] as TeacherDto;
      const next = { ...current, unavailable, version: current.version + 1 };
      items[index] = next;
      return next;
    }),
  } satisfies TeachersApi & { items: TeacherDto[] };
}

async function mountPage(teachersApi: TeachersApi, query: Record<string, string> = {}) {
  const shiftsApi: ShiftsApi = {
    list: vi.fn(async () => [manha, antigo]),
    register: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
  };
  const assignment = (id: string, weeklyLessons: number): AssignmentDto => ({
    id,
    classGroupId: 'c1',
    participants: [
      { subjectId: `s${id}`, teacherId: 'ana' },
      { subjectId: 'other', teacherId: 'second' },
    ],
    weeklyLessons,
    resourceIds: [],
    createdAt,
    version: 1,
  });
  const assignmentsApi: AssignmentsApi = {
    list: vi.fn(async () => [assignment('a1', 5), assignment('a2', 4)]),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/disponibilidade', component: AvailabilityPage }],
  });
  await router.push({ path: '/disponibilidade', query });
  const wrapper = mount(AvailabilityPage, {
    global: {
      plugins: [router],
      provide: {
        [teachersApiKey as symbol]: teachersApi,
        [shiftsApiKey as symbol]: shiftsApi,
        [assignmentsApiKey as symbol]: assignmentsApi,
      },
    },
    attachTo: document.body,
  });
  await flushPromises();
  return { wrapper, router };
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>['wrapper'];
const cell = (wrapper: Wrapper, day: string, n: number, time: string) =>
  wrapper.get<HTMLInputElement>(
    `input[aria-label="Indisponível na ${day}, ${n}ª aula da Manhã (${time})"]`,
  );

describe('AvailabilityPage', () => {
  it('escolhe o professor e mostra a grade dos turnos ativos com o resumo da carga', async () => {
    const { wrapper, router } = await mountPage(fakeTeachersApi([teacher('ana', 'Ana')]));
    expect(wrapper.find('table').exists()).toBe(false);

    await wrapper.get('#availability-teacher').setValue('ana');
    await flushPromises();

    expect(router.currentRoute.value.query).toEqual({ professor: 'ana' });
    expect(wrapper.findAll('h2').map((h) => h.text())).toEqual(['Manhã']);
    expect(wrapper.get('.hint').text()).toBe(
      'Aulas atribuídas: 9 de no máximo 20 · Hora-atividade: 7 · Indisponível em 0 horários',
    );
    expect(cell(wrapper, 'segunda', 1, '07:30–08:20').element.checked).toBe(false);
  });

  it('marca horários e o dia inteiro, e salva preservando os de turnos arquivados', async () => {
    const teachersApi = fakeTeachersApi([
      teacher('ana', 'Ana', { unavailable: [{ weekday: 5, periodId: 'x1' }] }),
    ]);
    const { wrapper } = await mountPage(teachersApi, { professor: 'ana' });
    const save = () => wrapper.findAll('button').find((b) => b.text() === 'Salvar disponibilidade');
    expect(save()?.attributes('disabled')).toBeDefined();

    await cell(wrapper, 'segunda', 2, '08:20–09:10').setValue(true);
    await wrapper.get('button[aria-label="quarta inteira indisponível na Manhã"]').trigger('click');
    expect(cell(wrapper, 'quarta', 1, '07:30–08:20').element.checked).toBe(true);
    expect(
      wrapper
        .get('button[aria-label="quarta inteira indisponível na Manhã"]')
        .attributes('aria-pressed'),
    ).toBe('true');
    expect(wrapper.get('.hint').text()).toContain('Indisponível em 4 horários');

    await save()?.trigger('click');
    await flushPromises();

    const sent = teachersApi.changeAvailability.mock.calls[0]?.[1];
    expect(sent?.version).toBe(1);
    expect(sent?.unavailable.toSorted((a, b) => a.weekday - b.weekday)).toEqual([
      { weekday: 1, periodId: 'p2' },
      { weekday: 3, periodId: 'p1' },
      { weekday: 3, periodId: 'p2' },
      { weekday: 5, periodId: 'x1' },
    ]);
    expect(wrapper.get('[role="status"]').text()).toBe('Disponibilidade de Ana salva.');
    expect(save()?.attributes('disabled')).toBeDefined();
  });

  it('desmarca o dia inteiro quando ele já está todo marcado e desfaz as alterações', async () => {
    const teachersApi = fakeTeachersApi([
      teacher('ana', 'Ana', {
        unavailable: [
          { weekday: 2, periodId: 'p1' },
          { weekday: 2, periodId: 'p2' },
        ],
      }),
    ]);
    const { wrapper } = await mountPage(teachersApi, { professor: 'ana' });

    await wrapper.get('button[aria-label="terça inteira indisponível na Manhã"]').trigger('click');
    expect(cell(wrapper, 'terça', 1, '07:30–08:20').element.checked).toBe(false);
    expect(cell(wrapper, 'terça', 2, '08:20–09:10').element.checked).toBe(false);

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Desfazer alterações')
      ?.trigger('click');
    expect(cell(wrapper, 'terça', 1, '07:30–08:20').element.checked).toBe(true);
  });

  it('mostra o erro e recarrega quando o professor foi alterado em outra tela', async () => {
    const teachersApi = fakeTeachersApi([teacher('ana', 'Ana')]);
    teachersApi.changeAvailability.mockRejectedValueOnce(
      new ApiRequestError('concurrency.stale', 'Este cadastro foi alterado em outra tela.', 409),
    );
    const { wrapper } = await mountPage(teachersApi, { professor: 'ana' });

    await cell(wrapper, 'segunda', 1, '07:30–08:20').setValue(true);
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Salvar disponibilidade')
      ?.trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('Este cadastro foi alterado em outra tela.');
    expect(teachersApi.list).toHaveBeenCalledTimes(2);
    expect(cell(wrapper, 'segunda', 1, '07:30–08:20').element.checked).toBe(false);
  });
});
