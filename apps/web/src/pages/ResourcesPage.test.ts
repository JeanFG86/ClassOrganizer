import type { ResourceDto } from '@classorganizer/contracts';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { resourcesApiKey, type ResourcesApi } from '../services/resources-api.ts';
import ResourcesPage from './ResourcesPage.vue';

const createdAt = '2026-03-01T10:00:00.000Z';

/** API em memória que imita versão e arquivamento do servidor. */
function fakeApi(initial: ResourceDto[] = []): ResourcesApi {
  const items = [...initial];
  const replace = (id: string, change: Partial<ResourceDto>) => {
    const index = items.findIndex((r) => r.id === id);
    const current = items[index] as ResourceDto;
    const next = { ...current, ...change, version: current.version + 1 };
    items[index] = next;
    return next;
  };
  return {
    list: vi.fn(async () => [...items]),
    register: vi.fn(async (name: string) => {
      const created = {
        id: String(items.length + 1),
        name,
        createdAt,
        archivedAt: null,
        version: 1,
      };
      items.push(created);
      return created;
    }),
    update: vi.fn(async (id, { name }) => replace(id, { name })),
    archive: vi.fn(async (id) => replace(id, { archivedAt: createdAt })),
    restore: vi.fn(async (id) => replace(id, { archivedAt: null })),
  };
}

async function mountPage(api: ResourcesApi) {
  const wrapper = mount(ResourcesPage, {
    global: { provide: { [resourcesApiKey as symbol]: api } },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

describe('ResourcesPage', () => {
  it('explica o uso opcional e fala do recurso no masculino', async () => {
    const api = fakeApi();
    const wrapper = await mountPage(api);
    expect(wrapper.text()).toContain('Sem recursos cadastrados, nada muda.');
    expect(wrapper.text()).toContain('Nenhum recurso cadastrado ainda.');

    await wrapper.get('#resource-name').setValue('  ');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.get('[role="alert"]').text()).toBe('Informe o nome do recurso.');

    await wrapper.get('#resource-name').setValue('Quadra');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(api.register).toHaveBeenCalledWith('Quadra');
    expect(wrapper.get('[role="status"]').text()).toBe('Recurso "Quadra" cadastrado.');

    await wrapper.get('button[aria-label="Arquivar Quadra"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toBe('Recurso "Quadra" arquivado.');
    expect(wrapper.get('ul[aria-label="Recursos especiais arquivados"]').text()).toContain(
      'Quadra',
    );
  });
});
