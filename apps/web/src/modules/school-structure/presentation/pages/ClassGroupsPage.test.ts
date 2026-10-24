import type { ClassGroupDto, ShiftDto } from '@classorganizer/contracts';
import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { classGroupsApiKey } from '../class-groups-key.ts';
import { type ClassGroupsApi } from '../../application/class-groups-api.ts';
import { shiftsApiKey } from '../shifts-key.ts';
import { type ShiftsApi } from '../../application/shifts-api.ts';
import ClassGroupsPage from './ClassGroupsPage.vue';

const base = { createdAt: '2026-02-01T12:00:00.000Z', archivedAt: null, version: 1 };
const manha: ShiftDto = {
  id: 'manha',
  name: 'Manhã',
  periods: [
    { id: 'p1', start: '07:30', end: '08:20' },
    { id: 'p2', start: '08:20', end: '09:10' },
  ],
  ...base,
};

function mountPage(api: ClassGroupsApi, shifts: ShiftDto[] = []) {
  const shiftsApi: ShiftsApi = {
    list: vi.fn(async () => shifts),
    register: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
  };
  return mount(ClassGroupsPage, {
    global: {
      provide: { [classGroupsApiKey as symbol]: api, [shiftsApiKey as symbol]: shiftsApi },
      stubs: { RouterLink: RouterLinkStub },
    },
  });
}

function fakeApi(list: ClassGroupsApi['list'], register: ClassGroupsApi['register'] = vi.fn()) {
  return {
    list,
    register,
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    changeSchedule: vi.fn(),
  } satisfies ClassGroupsApi;
}

// O comportamento do cadastro é coberto em SubjectsPage.test.ts (mesmo componente
// CatalogPage); aqui só os textos, ids e o turno próprios das turmas.
describe('ClassGroupsPage', () => {
  it('usa os textos de turma', async () => {
    const created: ClassGroupDto = {
      id: 'c1',
      name: '6º ano A',
      shiftId: null,
      periodIds: [],
      ...base,
    };
    const api = fakeApi(
      vi.fn().mockResolvedValueOnce([]).mockResolvedValue([created]),
      vi.fn(async () => created),
    );
    const wrapper = mountPage(api);
    await flushPromises();

    expect(wrapper.get('h1').text()).toBe('Turmas');
    expect(wrapper.text()).toContain('Nenhuma turma cadastrada ainda.');
    expect(wrapper.get('label[for="class-group-name"]').text()).toBe('Nome da turma');

    await wrapper.get('form').trigger('submit');
    expect(wrapper.get('[role="alert"]').text()).toBe('Informe o nome da turma.');

    await wrapper.get('#class-group-name').setValue('6º ano A');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[role="status"]').text()).toBe('Turma "6º ano A" cadastrada.');
    expect(wrapper.get('ul[aria-label="Turmas cadastradas"]').text()).toContain('6º ano A');
  });

  it('mostra o turno e quantas aulas por dia cada turma tem', async () => {
    const turmas: ClassGroupDto[] = [
      { id: 'c1', name: '6º A', shiftId: 'manha', periodIds: ['p1', 'p2'], ...base },
      { id: 'c2', name: '6º B', shiftId: 'manha', periodIds: ['p1'], ...base },
      { id: 'c3', name: '6º C', shiftId: null, periodIds: [], ...base },
    ];
    const wrapper = mountPage(fakeApi(vi.fn(async () => turmas)), [manha]);
    await flushPromises();

    const details = wrapper
      .findAll('ul[aria-label="Turmas cadastradas"] li')
      .map((li) => [li.get('.item-name').text(), li.find('.item-detail').text()]);
    expect(details).toEqual([
      ['6º A', 'Manhã, 2 aulas por dia'],
      ['6º B', 'Manhã, 1 aula por dia'],
      ['6º C', 'sem turno'],
    ]);
  });
});
