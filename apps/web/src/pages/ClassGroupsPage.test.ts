import type { ClassGroupDto } from '@classorganizer/contracts';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { classGroupsApiKey, type ClassGroupsApi } from '../services/class-groups-api.ts';
import ClassGroupsPage from './ClassGroupsPage.vue';

// O comportamento do cadastro é coberto em SubjectsPage.test.ts (mesmo componente
// CatalogPage); aqui só os textos e ids próprios das turmas.
describe('ClassGroupsPage', () => {
  it('usa os textos de turma', async () => {
    const created: ClassGroupDto = {
      id: 'c1',
      name: '6º ano A',
      createdAt: '2026-02-01T12:00:00.000Z',
      archivedAt: null,
      version: 1,
    };
    const api: ClassGroupsApi = {
      list: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([created]),
      register: vi.fn(async () => created),
      update: vi.fn(),
      archive: vi.fn(),
      restore: vi.fn(),
    };
    const wrapper = mount(ClassGroupsPage, {
      global: { provide: { [classGroupsApiKey as symbol]: api } },
    });
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
});
