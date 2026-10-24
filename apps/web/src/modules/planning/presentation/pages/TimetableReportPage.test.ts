import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TimetableReportDto } from '@classorganizer/contracts';
import type { TimetableReportsApi } from '../../application/timetable-reports-api.ts';
import { timetableReportsApiKey } from '../timetable-reports-key.ts';
import { ApiRequestError } from '../../../../shared/application/api-error.ts';
import TimetableReportPage from './TimetableReportPage.vue';

const date = '2026-02-01T12:00:00Z';
function fixture(): TimetableReportDto {
  return {
    planning: { id: 'plan', name: 'Plano inventado', year: 2027, version: 3, archived: false },
    revision: {
      id: 'revision',
      number: 1,
      name: 'Grade inicial',
      sealedAt: null,
      capturedAt: date,
      catalogVersion: 1,
      historical: true,
    },
    revisions: [
      { id: 'revision', number: 1, name: 'Grade inicial' },
      { id: 'latest', number: 2, name: null },
    ],
    generatedAt: date,
    perspective: 'class',
    notices: ['Faltam aulas.'],
    targets: [{ id: 'group', name: 'Turma inventada' }],
    sheets: [
      {
        targetId: 'group',
        targetName: 'Turma inventada',
        shiftName: 'Turno inventado',
        rows: [
          {
            periodId: 'period',
            number: 1,
            startMinute: 420,
            endMinute: 470,
            cells: [1, 2, 3, 4, 5].map((weekday) => ({
              weekday,
              unavailable: false,
              items:
                weekday === 1
                  ? [
                      {
                        title: '<script>Nome inventado</script>',
                        details: ['Docente inventado'],
                        pinned: true,
                      },
                    ]
                  : [],
            })),
          },
        ],
      },
    ],
  };
}
let wrapper: VueWrapper;
afterEach(() => {
  wrapper?.unmount();
  vi.restoreAllMocks();
});
async function render(
  api: TimetableReportsApi = { report: vi.fn(async () => fixture()) },
  query = '?revisao=revision',
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/planejamentos/:id/impressoes', component: TimetableReportPage }],
  });
  await router.push('/planejamentos/plan/impressoes' + query);
  await router.isReady();
  wrapper = mount(TimetableReportPage, {
    global: { plugins: [router], provide: { [timetableReportsApiKey as symbol]: api } },
  });
  await flushPromises();
  return { api, router };
}
async function button(label: string) {
  const found = wrapper.findAll('button').find((b) => b.text() === label);
  if (!found) throw new Error('Botão ausente.');
  await found.trigger('click');
  await flushPromises();
}
describe('impressão e PDF na interface', () => {
  it('mostra identidade, avisos, dados históricos e texto escapado e aciona impressão', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { api } = await render();
    expect(api.report).toHaveBeenCalledWith('plan', {
      revisionId: 'revision',
      perspective: 'class',
    });
    expect(wrapper.text()).toContain('Plano inventado · 2027');
    expect(wrapper.text()).toContain(
      'Revisão 1 - Grade inicial · RASCUNHO - não concluída · Histórica',
    );
    expect(wrapper.text()).toContain('07:00 - 07:50');
    expect(wrapper.text()).toContain('Fixada');
    expect(wrapper.find('script').exists()).toBe(false);
    expect(wrapper.text()).toContain('<script>Nome inventado</script>');
    await button('Imprimir / salvar PDF');
    expect(print).toHaveBeenCalledOnce();
  });
  it('filtra turma e perspectiva por uma nova leitura e troca revisão explicitamente', async () => {
    const { api, router } = await render();
    await wrapper.get('#report-target').setValue('group');
    await flushPromises();
    expect(api.report).toHaveBeenLastCalledWith('plan', {
      revisionId: 'revision',
      perspective: 'class',
      entityId: 'group',
    });
    await wrapper.get('#report-perspective').setValue('teacher');
    await flushPromises();
    expect(api.report).toHaveBeenLastCalledWith('plan', {
      revisionId: 'revision',
      perspective: 'teacher',
    });
    await wrapper.get('#report-revision').setValue('latest');
    await flushPromises();
    expect(router.currentRoute.value.query['revisao']).toBe('latest');
    expect(api.report).toHaveBeenLastCalledWith('plan', {
      revisionId: 'latest',
      perspective: 'teacher',
    });
  });
  it('erro impede imprimir o resultado anterior e permite tentar novamente', async () => {
    const report = vi.fn(async () => fixture());
    await render({ report });
    report.mockRejectedValueOnce(new ApiRequestError('network', 'Sem conexão.', 0));
    await button('Atualizar prévia');
    expect(wrapper.get('[role=alert]').text()).toContain('Sem conexão.');
    expect(wrapper.find('table').exists()).toBe(false);
    const printButton = wrapper.findAll('button').find((b) => b.text() === 'Imprimir / salvar PDF');
    expect(printButton?.attributes('disabled')).toBeDefined();
    await button('Tentar novamente');
    expect(wrapper.find('table').exists()).toBe(true);
  });
  it('não escolhe silenciosamente a revisão mais recente quando falta identificação', async () => {
    const { api } = await render(undefined, '');
    expect(api.report).not.toHaveBeenCalled();
    expect(wrapper.get('[role=alert]').text()).toContain('Escolha a revisão em Planejamentos');
  });
  it('revisão vazia não libera impressão', async () => {
    const empty = fixture();
    empty.targets = [];
    empty.sheets = [];
    await render({ report: vi.fn(async () => empty) });
    expect(wrapper.text()).toContain('Nenhuma turma nesta revisão.');
    expect(wrapper.find('table').exists()).toBe(false);
  });
  it('identifica revisão concluída sem apresentá-la como rascunho', async () => {
    const sealed = fixture();
    sealed.revision.sealedAt = date;
    sealed.notices = [];
    await render({ report: vi.fn(async () => sealed) });
    expect(wrapper.text()).toContain('Concluída');
    expect(wrapper.text()).not.toContain('RASCUNHO');
    expect(wrapper.text()).not.toContain('Pendências na revisão:');
  });
});
