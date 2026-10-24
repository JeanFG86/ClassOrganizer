import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlanningDetailDto, RevisionComparisonDto } from '@classorganizer/contracts';
import { createAccessApi } from '../../../../testing/access-fixture.ts';
import { ApiRequestError } from '../../../../shared/application/api-error.ts';
import { planningsApiKey } from '../plannings-key.ts';
import PlanningVersionsPanel from './PlanningVersionsPanel.vue';

const revision = {
  id: 'first',
  name: 'Grade inicial',
  restoredFromId: null,
  planningId: 'plan',
  number: 1,
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'editor',
  sealedAt: '2026-01-02T00:00:00Z',
  rulesReviewed: true,
  availabilityReviewed: true,
  gridRules: {
    formatVersion: 1 as const,
    planningPeriods: 'any_shift' as const,
    daily: { maxPerDay: 2 as const, consecutive: true },
    dailyExceptions: [],
  },
  snapshot: {
    formatVersion: 1 as const,
    catalogVersion: 1,
    capturedAt: '2026-01-01T00:00:00Z',
    subjects: [],
    teachers: [],
    classGroups: [],
    shifts: [],
    assignments: [],
    resources: [],
  },
};
const planning: PlanningDetailDto = {
  id: 'plan',
  name: 'Plano inventado',
  year: 2027,
  version: 3,
  createdAt: revision.createdAt,
  archivedAt: null,
  copiedFromId: null,
  revisions: [revision, { ...revision, id: 'second', name: null, number: 2, sealedAt: null }],
};
const result: RevisionComparisonDto = {
  version: 3,
  from: { id: 'first', number: 1, name: 'Grade inicial' },
  to: { id: 'second', number: 2, name: null },
  kept: 2,
  added: [],
  removed: [{ label: 'Disciplina inventada (Turma Alfa)', time: 'segunda, 07:00', pinned: true }],
  rulesChanged: true,
  catalogChanges: [],
};
let wrapper: VueWrapper;
afterEach(() => {
  wrapper?.unmount();
});
function render(canWrite = true, current = planning) {
  const api = createAccessApi();
  const compare = vi.spyOn(api, 'compareRevisions').mockResolvedValue(result);
  const rename = vi.spyOn(api, 'renameRevision').mockResolvedValue({ id: 'plan', version: 4 });
  const restore = vi
    .spyOn(api, 'restoreRevision')
    .mockResolvedValue({ id: 'plan', version: 4, revisionId: 'third' });
  const preserve = vi
    .spyOn(api, 'preserveRevision')
    .mockResolvedValue({ id: 'plan', version: 4, revisionId: 'third' });
  wrapper = mount(PlanningVersionsPanel, {
    props: { planning: structuredClone(current), canWrite },
    global: { provide: { [planningsApiKey as symbol]: api } },
  });
  return { api, compare, rename, restore, preserve };
}
async function button(name: string) {
  const target = wrapper.findAll('button').find((item) => item.text() === name);
  if (!target) throw new Error('Botão ausente: ' + name);
  await target.trigger('click');
  await flushPromises();
}
describe('versões na interface', () => {
  it('consulta compara revisões com rótulos, horários e fixação, mas não edita', async () => {
    const { compare } = render(false);
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Restaurar revisão');
    await button('Comparar revisões');
    expect(compare).toHaveBeenCalledWith('plan', 'first', 'second');
    expect(wrapper.text()).toContain('2 alocações mantidas · 1 removidas · 0 incluídas');
    expect(wrapper.text()).toContain('Disciplina inventada (Turma Alfa) · segunda, 07:00 · Fixada');
    expect(wrapper.text()).toContain('As regras da grade mudaram.');
  });
  it('salva nome com versão e solicita atualização do planejamento', async () => {
    const { rename } = render();
    await wrapper.get('#revision-name').setValue('Grade aprovada');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(rename).toHaveBeenCalledWith('plan', 'first', { version: 3, name: 'Grade aprovada' });
    expect(wrapper.emitted('changed')).toHaveLength(1);
    expect(wrapper.get('[role=status]').text()).toBe('Nome da revisão salvo.');
  });
  it('preserva somente o rascunho atual e pede atualização da lista de revisões', async () => {
    const { preserve } = render();
    expect(wrapper.text()).not.toContain('Preservar revisão e continuar');
    await wrapper.get('#version-source').setValue('second');
    await button('Preservar revisão e continuar');
    expect(preserve).toHaveBeenCalledWith('plan', 'second', 3);
    expect(wrapper.emitted('changed')).toHaveLength(1);
    expect(wrapper.text()).toContain('Revisão preservada. Continue no novo rascunho');
  });
  it('restaurar exige confirmação e permite cancelar sem escrever', async () => {
    const { restore } = render();
    await button('Restaurar revisão 1');
    expect(wrapper.text()).toContain('O rascunho atual fica no histórico');
    expect(restore).not.toHaveBeenCalled();
    await button('Cancelar restauração');
    expect(wrapper.find('[aria-label="Confirmar restauração"]').exists()).toBe(false);
    await button('Restaurar revisão 1');
    await button('Confirmar restauração');
    expect(restore).toHaveBeenCalledWith('plan', 'first', 3);
    expect(wrapper.emitted('changed')).toHaveLength(1);
    expect(wrapper.text()).toContain('Revisão restaurada em um novo rascunho');
  });
  it('recarrega em conflito e mantém a mensagem visível', async () => {
    const { rename } = render();
    rename.mockRejectedValue(new ApiRequestError('concurrency.stale', 'Atualize a página.', 409));
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role=alert]').text()).toContain('Atualize a página.');
    expect(wrapper.emitted('changed')).toHaveLength(1);
  });
  it('comparação com falha permite tentar novamente e não conserva resultado anterior ao trocar revisão', async () => {
    const { compare } = render();
    compare.mockRejectedValueOnce(new ApiRequestError('internal', 'Falha temporária.', 500));
    await button('Comparar revisões');
    expect(wrapper.get('[role=alert]').text()).toContain('Falha temporária.');
    await button('Tentar novamente');
    expect(wrapper.find('#comparison-title').exists()).toBe(true);
    await wrapper.get('#version-source').setValue('second');
    expect(wrapper.find('#comparison-title').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Restaurar revisão 2');
  });
  it('ignora resposta atrasada depois de trocar de planejamento', async () => {
    const { compare } = render();
    let resolve: ((value: RevisionComparisonDto) => void) | undefined;
    compare.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await button('Comparar revisões');
    await wrapper.setProps({ planning: { ...planning, id: 'other' } });
    resolve?.(result);
    await flushPromises();
    expect(wrapper.find('#comparison-title').exists()).toBe(false);
  });
  it('planejamento arquivado continua comparável, sem ações de escrita', () => {
    render(true, { ...planning, archivedAt: revision.createdAt });
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Restaurar revisão');
    expect(wrapper.text()).toContain('Comparar revisões');
  });
});
