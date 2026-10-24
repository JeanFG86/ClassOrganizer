import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  GenerationDetailDto,
  GenerationListDto,
  GenerationRunDto,
} from '@classorganizer/contracts';
import { accessApiKey, createAccessApi } from '../services/access-api.ts';
import { ApiRequestError } from '../services/api-client.ts';
import { generationApiKey, type GenerationApi } from '../services/generation-api.ts';
import { gridApiKey, type GridApi } from '../services/grid-api.ts';
import GenerationPage from './GenerationPage.vue';
import {
  BLOCK,
  P1,
  P2,
  PLANNING,
  REVISION,
  TEACHER,
  date,
  gridViewFixture,
  id,
} from './grid-fixture.ts';

const RUN = id(70);
function run(overrides: Partial<GenerationRunDto> = {}): GenerationRunDto {
  return {
    id: RUN,
    revisionId: REVISION,
    status: 'feasible',
    requestedAt: date,
    requestedBy: 'editor-test',
    startedAt: date,
    finishedAt: date,
    attempts: 1,
    cancelRequested: false,
    options: { timeLimitMs: 30000, nodeLimit: 2000000, seed: 11, memoryLimitMb: 256 },
    reason: 'solved',
    diagnostics: [],
    warnings: [],
    metrics: { elapsedMs: 1250, visitedNodes: 40, backtracks: 2, restarts: 0 },
    appliedAt: null,
    appliedBy: null,
    stale: false,
    ...overrides,
  };
}
function list(overrides: Partial<GenerationListDto> = {}): GenerationListDto {
  return { revisionId: REVISION, editable: true, active: null, runs: [], ...overrides };
}
const proposal = [
  { kind: 'lesson' as const, entityId: BLOCK, weekday: 1 as const, periodId: P1, pinned: false },
  { kind: 'lesson' as const, entityId: BLOCK, weekday: 2 as const, periodId: P1, pinned: false },
  {
    kind: 'planning' as const,
    entityId: TEACHER,
    weekday: 3 as const,
    periodId: P2,
    pinned: false,
  },
];
function detail(overrides: Partial<GenerationDetailDto> = {}): GenerationDetailDto {
  const base = gridViewFixture().diagnosis;
  return {
    run: run(),
    applicable: true,
    comparison: {
      kept: 1,
      added: 2,
      removed: 0,
      placements: proposal,
      diagnosis: { ...base, pending: [] },
      currentWindows: 0,
      proposalWindows: 0,
    },
    ...overrides,
  };
}
function fakeGrid() {
  return {
    view: vi.fn(async () => gridViewFixture()),
    preview: vi.fn(),
    apply: vi.fn(),
    undo: vi.fn(),
    changeRules: vi.fn(),
  } as unknown as GridApi;
}
function fakeApi(initial = list()) {
  return {
    list: vi.fn(async () => initial),
    detail: vi.fn(async () => detail()),
    request: vi.fn(async () => run({ status: 'queued', finishedAt: null, metrics: null })),
    cancel: vi.fn(async () => run({ status: 'running', cancelRequested: true, finishedAt: null })),
    apply: vi.fn(async () => ({
      id: PLANNING,
      version: 4,
      summary: 'Aplicou a geração automática: 1 alocação mantida, 2 novas e 0 retiradas.',
    })),
  } satisfies GenerationApi;
}

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  wrappers.length = 0;
  vi.useRealTimers();
});
async function render(api: GenerationApi, role: 'editor' | 'viewer' = 'editor', grid = fakeGrid()) {
  const access = createAccessApi();
  access.session.value = {
    user: {
      id: id(99),
      username: role + '-test',
      role,
      disabled: false,
      version: 1,
      createdAt: date,
    },
    expiresAt: date,
  };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/planejamentos/:id/grade', component: { template: '<div />' } },
      { path: '/planejamentos/:id/geracao', component: GenerationPage },
    ],
  });
  await router.push('/planejamentos/' + PLANNING + '/geracao');
  await router.isReady();
  const wrapper = mount(GenerationPage, {
    global: {
      plugins: [router],
      provide: {
        [generationApiKey as symbol]: api,
        [gridApiKey as symbol]: grid,
        [accessApiKey as symbol]: access,
      },
    },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}
const button = (wrapper: VueWrapper, text: string) => {
  const found = wrapper.findAll('button').find((b) => b.text() === text);
  if (!found) throw new Error('Botão ausente: ' + text);
  return found;
};

describe('GenerationPage', () => {
  it('mostra o estado vazio; consulta acompanha sem poder gerar', async () => {
    const editor = await render(fakeApi());
    expect(editor.text()).toContain('Nenhuma geração solicitada nesta revisão.');
    expect(button(editor, 'Gerar grade').attributes('disabled')).toBeUndefined();
    const viewer = await render(fakeApi(), 'viewer');
    expect(viewer.text()).toContain('Seu perfil permite apenas acompanhar as gerações.');
    expect(viewer.findAll('button').some((b) => b.text() === 'Gerar grade')).toBe(false);
  });

  it('solicita, acompanha sem percentual e mostra o resultado ao terminar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'));
    const api = fakeApi();
    const queued = run({ status: 'queued', startedAt: null, finishedAt: null, metrics: null });
    const running = run({ status: 'running', finishedAt: null, metrics: null });
    api.list
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(list({ active: queued, runs: [queued] }))
      .mockResolvedValueOnce(list({ active: running, runs: [running] }))
      .mockResolvedValue(list({ runs: [run()] }));
    const wrapper = await render(api);
    await button(wrapper, 'Gerar grade').trigger('click');
    await flushPromises();
    expect(api.request).toHaveBeenCalledWith({
      planningId: PLANNING,
      version: 3,
      revisionId: REVISION,
    });
    expect(wrapper.text()).toContain('Geração em andamento');
    expect(wrapper.text()).toContain('Na fila desde');
    expect(button(wrapper, 'Gerar grade').attributes('disabled')).toBeDefined();

    await vi.advanceTimersByTimeAsync(2000);
    await flushPromises();
    expect(wrapper.text()).toContain('Calculando há 7 s');
    expect(wrapper.text()).not.toContain('%');

    await vi.advanceTimersByTimeAsync(2000);
    await flushPromises();
    expect(api.detail).toHaveBeenCalledWith(PLANNING, RUN);
    expect(wrapper.find('[role="status"]').text()).toBe(
      'Geração terminada: Grade completa encontrada.',
    );
    expect(wrapper.find('.generation-summary').text()).toContain('Novas posições2');
    expect(wrapper.findAll('.grid-item.changed')).toHaveLength(1);
  });

  it('aplica a proposta somente após confirmação', async () => {
    const api = fakeApi(list({ runs: [run()] }));
    const grid = fakeGrid();
    const wrapper = await render(api, 'editor', grid);
    expect(wrapper.text()).toContain('Grade completa encontrada');
    await button(wrapper, 'Aplicar proposta').trigger('click');
    expect(api.apply).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('generation-confirm-title');
    await button(wrapper, 'Confirmar aplicação').trigger('click');
    await flushPromises();
    expect(api.apply).toHaveBeenCalledWith(
      { planningId: PLANNING, version: 3, revisionId: REVISION },
      RUN,
    );
    expect(grid.view).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[role="status"]').text()).toContain('Proposta aplicada à grade.');
  });

  it('explica propostas desatualizadas e resultados sem grade', async () => {
    const api = fakeApi(list({ runs: [run({ stale: true })] }));
    api.detail.mockResolvedValueOnce(detail({ run: run({ stale: true }), applicable: false }));
    const stale = await render(api);
    expect(stale.text()).toContain('Desatualizada');
    expect(stale.findAll('button').some((b) => b.text() === 'Aplicar proposta')).toBe(false);

    const infeasible = run({
      status: 'infeasible',
      reason: 'capacity',
      diagnostics: [
        {
          code: 'capacity',
          message: 'A turma Turma Alfa não tem aulas suficientes.',
          entityIds: [],
        },
      ],
    });
    const other = fakeApi(list({ runs: [infeasible] }));
    other.detail.mockResolvedValue(
      detail({ run: infeasible, applicable: false, comparison: null }),
    );
    const wrapper = await render(other);
    expect(wrapper.text()).toContain('Não há grade possível com estes dados');
    expect(wrapper.text()).toContain('A turma Turma Alfa não tem aulas suficientes.');
  });

  it('cancela a geração em andamento', async () => {
    const running = run({ status: 'running', finishedAt: null, metrics: null });
    const api = fakeApi(list({ active: running, runs: [running] }));
    api.list
      .mockResolvedValueOnce(list({ active: running, runs: [running] }))
      .mockResolvedValue(list({ active: { ...running, cancelRequested: true }, runs: [running] }));
    const wrapper = await render(api);
    await button(wrapper, 'Cancelar geração').trigger('click');
    await flushPromises();
    expect(api.cancel).toHaveBeenCalledWith(PLANNING, RUN);
    expect(wrapper.text()).toContain('Cancelamento solicitado. A busca será interrompida');
    expect(wrapper.findAll('button').some((b) => b.text() === 'Cancelar geração')).toBe(false);
  });

  it('mostra o erro de carregamento com nova tentativa', async () => {
    const api = fakeApi();
    api.list.mockRejectedValueOnce(new ApiRequestError('network', 'Sem conexão.'));
    const wrapper = await render(api);
    expect(wrapper.find('[role="alert"]').text()).toContain('Sem conexão.');
    await button(wrapper, 'Tentar novamente').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Nenhuma geração solicitada');
  });
});
